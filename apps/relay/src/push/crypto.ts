/**
 * Push tokens at rest (RELAY.md §7.1): AES-256-GCM with RELAY_DATA_KEY, AAD
 * `push|<hubId>|<handle hash hex>`, so a token copied to another row or hub fails to open.
 * Layout: 12-byte IV, ciphertext, 16-byte tag. Owned by Claude.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const handleHash = (handle: string) => createHash('sha256').update(handle, 'utf8').digest();

const aad = (hubId: string, hash: Buffer) =>
  Buffer.from(`push|${hubId}|${hash.toString('hex')}`, 'utf8');

export function sealToken(key: Buffer, hubId: string, hash: Buffer, token: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(aad(hubId, hash));
  const body = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]);
}

export function openToken(key: Buffer, hubId: string, hash: Buffer, sealed: Buffer): string {
  const d = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  d.setAAD(aad(hubId, hash));
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(12, sealed.length - 16)), d.final()]).toString(
    'utf8',
  );
}
