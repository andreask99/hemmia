/**
 * Hub identity (RELAY.md §1–§2): the hub id is derived from the hub's Ed25519 public key, so
 * a hub can prove it owns its id. Owned by Claude.
 */
import { createHash } from 'node:crypto';

/** Crockford base32, lower case (no i, l, o, u). */
export const HUB_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const HUB_ID_LENGTH = 12;
export const PROTOCOL_VERSION = 1;
/** Allowed clock difference for signed strings, seconds. */
export const CLOCK_SKEW_SECONDS = 300;

const HUB_ID = /^[0-9a-hjkmnp-tv-z]{12}$/;

/** SHA-256 of the 32 raw public key bytes; the first 60 bits as 12 base32 characters. */
export function hubIdFromPublicKey(raw: Uint8Array): string {
  if (raw.length !== 32) throw new RangeError('Ed25519 public keys are 32 bytes');
  const digest = createHash('sha256').update(raw).digest();
  // 60 bits = the first 7.5 bytes; read 8 bytes as a big-endian integer and drop 4 bits.
  let bits = digest.readBigUInt64BE(0) >> 4n;
  let id = '';
  for (let i = 0; i < HUB_ID_LENGTH; i++) {
    id = HUB_ID_ALPHABET.charAt(Number(bits & 31n)) + id;
    bits >>= 5n;
  }
  return id;
}

export function isHubId(id: string): boolean {
  return HUB_ID.test(id);
}

/** `<hub-id>.h.<relay-domain>` for this relay domain (case-insensitive). */
export function isHubHost(host: string, relayDomain: string): boolean {
  const h = host.toLowerCase();
  const suffix = `.h.${relayDomain.toLowerCase()}`;
  return h.endsWith(suffix) && isHubId(h.slice(0, -suffix.length));
}

export function hubHostname(hubId: string, relayDomain: string): string {
  return `${hubId}.h.${relayDomain}`;
}

/** The hub id of a hub host, or null. */
export function hubIdOfHost(host: string, relayDomain: string): string | null {
  return isHubHost(host, relayDomain) ? (host.toLowerCase().split('.')[0] ?? null) : null;
}
