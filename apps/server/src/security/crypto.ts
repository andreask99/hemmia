/**
 * Cryptographic primitives for kchat. Owned by Claude; see docs/SECURITY.md.
 *
 * - AEAD: AES-256-GCM, random 96-bit nonce, versioned envelope, mandatory AAD.
 * - KDF: Argon2id for passwords and recovery codes (parameters stored per user),
 *   HKDF-SHA256 for keys derived from high-entropy secrets (session tokens).
 * - Random tokens (sessions, invites) and recovery codes.
 *
 * Nothing in this module logs, and error messages never contain key material or plaintext.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { hashRaw, type Algorithm } from '@node-rs/argon2';

export const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Envelope version 1: [0x01][nonce 12][ciphertext][tag 16], AES-256-GCM. */
const V1 = 0x01;

export class DecryptError extends Error {
  override name = 'DecryptError';
  constructor() {
    super('Decryption failed');
  }
}

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_BYTES) throw new Error('Invalid key length');
}

function aadBytes(aad: string): Buffer {
  if (aad.length === 0) throw new Error('AAD must not be empty');
  return Buffer.from(`kchat|v1|${aad}`, 'utf8');
}

/** Encrypts `plaintext` under `key`, binding it to `aad` (use the aad* helpers below). */
export function encrypt(key: Uint8Array, plaintext: Uint8Array, aad: string): Buffer {
  assertKey(key);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadBytes(aad));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.of(V1), nonce, body, cipher.getAuthTag()]);
}

/** Decrypts an envelope from `encrypt`. Throws DecryptError on any mismatch or tampering. */
export function decrypt(key: Uint8Array, envelope: Uint8Array, aad: string): Buffer {
  assertKey(key);
  const buf = Buffer.from(envelope.buffer, envelope.byteOffset, envelope.byteLength);
  if (buf.length < 1 + NONCE_BYTES + TAG_BYTES || buf[0] !== V1) throw new DecryptError();
  const nonce = buf.subarray(1, 1 + NONCE_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const body = buf.subarray(1 + NONCE_BYTES, buf.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(aadBytes(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new DecryptError();
  }
}

export function encryptString(key: Uint8Array, plaintext: string, aad: string): Buffer {
  return encrypt(key, Buffer.from(plaintext, 'utf8'), aad);
}

export function decryptString(key: Uint8Array, envelope: Uint8Array, aad: string): string {
  return decrypt(key, envelope, aad).toString('utf8');
}

// ---------------------------------------------------------------------------
// Associated data: binds each ciphertext to where it lives, so ciphertexts can't be
// swapped between rows, columns or users. Components must not contain '|'.

const AAD_PART = /^[A-Za-z0-9_-]{1,64}$/;

function aadJoin(parts: readonly string[]): string {
  for (const p of parts) if (!AAD_PART.test(p)) throw new Error('Invalid AAD component');
  return parts.join('|');
}

/** AAD for an encrypted database column. */
export function aadColumn(userId: string, table: string, rowId: string, column: string): string {
  return aadJoin(['col', userId, table, rowId, column]);
}

/** AAD for an encrypted attachment blob. */
export function aadBlob(userId: string, attachmentId: string): string {
  return aadJoin(['blob', userId, attachmentId]);
}

/**
 * AAD for a wrapped data key; `slot` is 'password', 'recovery', 'session-<sessionId>' or
 * 'link-<linkId>' (a sign-in link, SECURITY.md §4.2).
 */
export function aadWrap(
  userId: string,
  slot: 'password' | 'recovery' | `session-${string}` | `link-${string}`,
): string {
  return aadJoin(['wrap', userId, slot]);
}

// ---------------------------------------------------------------------------
// Keys

export function randomKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** Wraps (encrypts) a data key under a key-encryption key. */
export function wrapKey(kek: Uint8Array, dek: Uint8Array, aad: string): Buffer {
  assertKey(dek);
  return encrypt(kek, dek, aad);
}

/** Unwraps a data key; throws DecryptError if the KEK or AAD is wrong. */
export function unwrapKey(kek: Uint8Array, wrapped: Uint8Array, aad: string): Buffer {
  const dek = decrypt(kek, wrapped, aad);
  if (dek.length !== KEY_BYTES) throw new DecryptError();
  return dek;
}

/** HKDF-SHA256 for high-entropy input keying material (never for passwords). */
export function hkdf(ikm: Uint8Array, salt: string, info: string, length = KEY_BYTES): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.from(salt), Buffer.from(info), length));
}

export function sha256(data: Uint8Array | string): Buffer {
  return createHash('sha256').update(data).digest();
}

/** Constant-time equality for equal-length secrets; false for different lengths. */
export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Best-effort zeroing of key material once it is no longer needed. */
export function wipe(...buffers: (Uint8Array | undefined)[]): void {
  for (const b of buffers) b?.fill(0);
}

// ---------------------------------------------------------------------------
// Argon2id

export interface KdfParams {
  /** Memory in KiB. */
  m: number;
  /** Passes. */
  t: number;
  /** Lanes. */
  p: number;
}

/** Current parameters for new hashes; measured on the Mac mini (see SECURITY.md). */
export const DEFAULT_KDF_PARAMS: KdfParams = { m: 262144, t: 12, p: 4 };

/**
 * Each derivation holds m KiB (256 MiB) while it runs. Allow two at once so a burst of
 * logins can't take memory the models need; the rest wait their turn.
 */
const MAX_CONCURRENT_KDF = 2;
let kdfRunning = 0;
const kdfQueue: (() => void)[] = [];

async function withKdfSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (kdfRunning >= MAX_CONCURRENT_KDF) {
    await new Promise<void>((resolve) => kdfQueue.push(resolve));
  } else {
    kdfRunning++;
  }
  try {
    return await fn();
  } finally {
    const next = kdfQueue.shift();
    if (next) next();
    else kdfRunning--;
  }
}
export const SALT_BYTES = 16;

// `Algorithm` is an ambient const enum, which isolatedModules can't reference; 2 = Argon2id.
// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
const ARGON2ID = 2 as Algorithm;

export function randomSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

/** Argon2id raw output of `outputLen` bytes. Runs off the main thread. */
export async function argon2id(
  secret: string,
  salt: Uint8Array,
  params: KdfParams,
  outputLen: number,
): Promise<Buffer> {
  return withKdfSlot(() =>
    hashRaw(secret.normalize('NFC'), {
      algorithm: ARGON2ID,
      salt,
      memoryCost: params.m,
      timeCost: params.t,
      parallelism: params.p,
      outputLen,
    }),
  );
}

export interface PasswordKeys {
  /** Key-encryption key for the password slot. Never stored. */
  kek: Buffer;
  /** SHA-256 of the auth half; the only thing stored for login checks. */
  authHash: Buffer;
}

/**
 * Derives the password KEK and login verifier from one Argon2id call:
 * 64 bytes out, first half KEK, second half auth key (stored only as SHA-256).
 */
export async function derivePasswordKeys(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<PasswordKeys> {
  const out = await argon2id(password, salt, params, 64);
  const kek = Buffer.from(out.subarray(0, 32));
  const authHash = sha256(out.subarray(32, 64));
  wipe(out);
  return { kek, authHash };
}

/** Derives the recovery-slot KEK from a (normalised) recovery code. */
export async function deriveRecoveryKey(
  code: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Buffer> {
  return argon2id(code, salt, params, KEY_BYTES);
}

// ---------------------------------------------------------------------------
// Tokens and codes

/** A random 256-bit token, base64url (sessions, invites). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Crockford base32 alphabet: no I, L, O, U, so codes are easy to write down and read back. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_CHARS = 25; // 125 bits
const RECOVERY_GROUP = 5;

/** A new recovery code: 25 Crockford base32 characters (125 bits) in groups of 5. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CHARS);
  let out = '';
  for (let i = 0; i < RECOVERY_CHARS; i++) {
    // 256 is a multiple of 32, so masking the low 5 bits is unbiased.
    out += CROCKFORD.charAt((bytes[i] ?? 0) & 31);
    if (i % RECOVERY_GROUP === RECOVERY_GROUP - 1 && i < RECOVERY_CHARS - 1) out += '-';
  }
  wipe(bytes);
  return out;
}

/**
 * Normalises a typed recovery code: case-insensitive, ignores spaces and dashes, and maps
 * the look-alikes O→0 and I/L→1. Returns the 25 canonical characters, or null if invalid.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CHARS) return null;
  for (const ch of s) if (!CROCKFORD.includes(ch)) return null;
  return s;
}
