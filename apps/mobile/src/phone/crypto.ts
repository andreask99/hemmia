/**
 * Encrypted files of phone mode (PHONE-MODE.md §6): AES-256-GCM with WebCrypto. File format:
 * byte 1 (version), 12-byte random IV, ciphertext with the 16-byte tag. The AAD binds a file to
 * its path, so files can't be swapped. The AAD prefix is a protocol constant: never renamed.
 */

export const FORMAT_VERSION = 1;
export const AAD_PREFIX = 'kchat|phone|v1|';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DecryptError extends Error {
  override name = 'DecryptError';
}

const aad = (path: string) => new TextEncoder().encode(`${AAD_PREFIX}${path}`);

/** 32 random bytes for a new data key. */
export function newDataKeyBytes(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error('data key must be 32 bytes');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Encrypts `plain` for the file at `path` (relative to phone/v1). */
export async function seal(
  key: CryptoKey,
  path: string,
  plain: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(path) }, key, plain),
  );
  const out = new Uint8Array(1 + IV_BYTES + ct.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return out;
}

/** Decrypts a file; throws DecryptError for another version, a wrong key or path, or any change. */
export async function unseal(
  key: CryptoKey,
  path: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (data.length < 1 + IV_BYTES + TAG_BYTES || data[0] !== FORMAT_VERSION)
    throw new DecryptError('not a phone file');
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.subarray(1, 1 + IV_BYTES), additionalData: aad(path) },
      key,
      data.subarray(1 + IV_BYTES),
    );
    return new Uint8Array(plain);
  } catch {
    throw new DecryptError('cannot decrypt');
  }
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
