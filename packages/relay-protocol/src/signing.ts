/**
 * Ed25519 signatures between hub and relay (RELAY.md §4.3, §5.1, §5.2). The signed strings
 * start with a fixed label and are protocol constants: never rename them. Owned by Claude.
 */
import { createHash, createPublicKey, type KeyObject, sign, verify } from 'node:crypto';
import { CLOCK_SKEW_SECONDS, hubIdFromPublicKey, isHubId } from './identity.ts';

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');

/** The raw 32-byte public key of an Ed25519 key (private or public). */
export function publicKeyRaw(key: KeyObject): Uint8Array {
  const jwk = createPublicKey(key).export({ format: 'jwk' });
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    throw new TypeError('not an Ed25519 key');
  }
  return Buffer.from(jwk.x, 'base64url');
}

export function publicKeyFromRaw(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new RangeError('Ed25519 public keys are 32 bytes');
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: b64url(raw) }, format: 'jwk' });
}

function signString(privateKey: KeyObject, text: string): string {
  return sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64url');
}

function verifyString(publicKey: KeyObject, text: string, sig: string): boolean {
  if (!/^[A-Za-z0-9_-]{86}$/.test(sig)) return false;
  try {
    return verify(null, Buffer.from(text, 'utf8'), publicKey, Buffer.from(sig, 'base64url'));
  } catch {
    return false;
  }
}

// --- Tunnel challenge (§4.3) ---

const tunnelString = (hubId: string, relayDomain: string, nonce: string) =>
  `kchat-tunnel-v1\n${hubId}\ntunnel.${relayDomain}\n${nonce}`;

export function signTunnelChallenge(
  privateKey: KeyObject,
  hubId: string,
  relayDomain: string,
  nonce: string,
): string {
  return signString(privateKey, tunnelString(hubId, relayDomain, nonce));
}

export function verifyTunnelChallenge(
  publicKey: Uint8Array,
  hubId: string,
  relayDomain: string,
  nonce: string,
  sig: string,
): boolean {
  return verifyString(publicKeyFromRaw(publicKey), tunnelString(hubId, relayDomain, nonce), sig);
}

// --- Registration (§5.2) ---

const registerString = (publicKey: string, time: number) =>
  `kchat-register-v1\n${publicKey}\n${String(time)}`;

export function signRegistration(
  privateKey: KeyObject,
  time: number,
): { publicKey: string; time: number; proof: string } {
  const publicKey = b64url(publicKeyRaw(privateKey));
  return { publicKey, time, proof: signString(privateKey, registerString(publicKey, time)) };
}

export type RegistrationCheck =
  | { ok: true; publicKey: Uint8Array; hubId: string }
  | { ok: false; reason: 'bad_key' | 'bad_time' | 'bad_signature' };

export function verifyRegistration(
  body: { publicKey: string; time: number; proof: string },
  nowSeconds: number,
): RegistrationCheck {
  const raw = /^[A-Za-z0-9_-]{43}$/.test(body.publicKey)
    ? Buffer.from(body.publicKey, 'base64url')
    : null;
  if (raw?.length !== 32) return { ok: false, reason: 'bad_key' };
  if (Math.abs(nowSeconds - body.time) > CLOCK_SKEW_SECONDS)
    return { ok: false, reason: 'bad_time' };
  let key: KeyObject;
  try {
    key = publicKeyFromRaw(raw);
  } catch {
    return { ok: false, reason: 'bad_key' };
  }
  if (!verifyString(key, registerString(body.publicKey, body.time), body.proof)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true, publicKey: raw, hubId: hubIdFromPublicKey(raw) };
}

// --- Signed control API requests (§5.1) ---

export const HUB_HEADER = 'x-kchat-hub';
export const TIME_HEADER = 'x-kchat-time';
export const SIGNATURE_HEADER = 'x-kchat-signature';

const requestString = (
  method: string,
  pathWithQuery: string,
  relayDomain: string,
  time: number,
  body: Uint8Array,
) =>
  `kchat-api-v1\n${method.toUpperCase()}\n${pathWithQuery}\napi.${relayDomain}\n${String(time)}\n${createHash('sha256').update(body).digest('hex')}`;

export function signRequest(input: {
  privateKey: KeyObject;
  hubId: string;
  method: string;
  pathWithQuery: string;
  relayDomain: string;
  time: number;
  body: Uint8Array;
}): Record<string, string> {
  return {
    [HUB_HEADER]: input.hubId,
    [TIME_HEADER]: String(input.time),
    [SIGNATURE_HEADER]: signString(
      input.privateKey,
      requestString(input.method, input.pathWithQuery, input.relayDomain, input.time, input.body),
    ),
  };
}

export type RequestCheck =
  | { ok: true; hubId: string; signature: string }
  | { ok: false; reason: 'missing' | 'unknown_hub' | 'bad_time' | 'bad_signature' };

/**
 * Verifies a signed request. `publicKeyFor` returns the registered key of a hub id or null.
 * Replay protection (same signature twice) is the caller's job: it gets the signature back.
 */
export function verifyRequest(
  input: {
    headers: Record<string, string | string[] | undefined>;
    method: string;
    pathWithQuery: string;
    relayDomain: string;
    body: Uint8Array;
    nowSeconds: number;
  },
  publicKeyFor: (hubId: string) => Uint8Array | null,
): RequestCheck {
  const one = (name: string) => {
    const v = input.headers[name];
    return typeof v === 'string' ? v : undefined;
  };
  const hubId = one(HUB_HEADER);
  const timeText = one(TIME_HEADER);
  const signature = one(SIGNATURE_HEADER);
  if (!hubId || !timeText || !signature || !isHubId(hubId) || !/^\d{1,12}$/.test(timeText)) {
    return { ok: false, reason: 'missing' };
  }
  const time = Number(timeText);
  if (Math.abs(input.nowSeconds - time) > CLOCK_SKEW_SECONDS)
    return { ok: false, reason: 'bad_time' };
  const raw = publicKeyFor(hubId);
  if (!raw) return { ok: false, reason: 'unknown_hub' };
  const text = requestString(
    input.method,
    input.pathWithQuery,
    input.relayDomain,
    time,
    input.body,
  );
  if (!verifyString(publicKeyFromRaw(raw), text, signature))
    return { ok: false, reason: 'bad_signature' };
  return { ok: true, hubId, signature };
}
