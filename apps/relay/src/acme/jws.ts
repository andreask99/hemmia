/**
 * JSON Web Signatures for ACME (RFC 8555 §6.2, RFC 7515/7518/7638): flattened JSON, ES256 with
 * the signature in IEEE P1363 form. Owned by Claude.
 */
import { createHash, createPublicKey, type KeyObject, sign, verify } from 'node:crypto';

export interface EcJwk {
  crv: 'P-256';
  kty: 'EC';
  x: string;
  y: string;
}

export interface Jws {
  protected: string;
  payload: string;
  signature: string;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function publicJwk(key: KeyObject): EcJwk {
  const j = createPublicKey(key).export({ format: 'jwk' });
  if (j.kty !== 'EC' || j.crv !== 'P-256' || typeof j.x !== 'string' || typeof j.y !== 'string') {
    throw new TypeError('ACME keys are ECDSA P-256');
  }
  return { crv: 'P-256', kty: 'EC', x: j.x, y: j.y };
}

/** RFC 7638 thumbprint: SHA-256 over the required members in lexicographic order. */
export function thumbprint(jwk: EcJwk): string {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  return b64(createHash('sha256').update(canonical).digest());
}

/** The dns-01 TXT value for a challenge token (RFC 8555 §8.1, §8.4). */
export function dns01Value(token: string, jwk: EcJwk): string {
  return b64(
    createHash('sha256')
      .update(`${token}.${thumbprint(jwk)}`)
      .digest(),
  );
}

/** Signs an ACME request. `payload` null is POST-as-GET (empty payload). */
export function signJws(o: {
  key: KeyObject;
  url: string;
  nonce: string;
  payload: unknown;
  kid?: string;
}): Jws {
  const header = {
    alg: 'ES256',
    nonce: o.nonce,
    url: o.url,
    ...(o.kid ? { kid: o.kid } : { jwk: publicJwk(o.key) }),
  };
  const protectedB64 = b64(JSON.stringify(header));
  const payloadB64 = o.payload === null ? '' : b64(JSON.stringify(o.payload));
  const signature = sign('sha256', Buffer.from(`${protectedB64}.${payloadB64}`), {
    key: o.key,
    dsaEncoding: 'ieee-p1363',
  });
  return { protected: protectedB64, payload: payloadB64, signature: b64(signature) };
}

/** Verifies a JWS with a public JWK (used by the fake ACME server). */
export function verifyJws(jws: Jws, jwk: EcJwk): boolean {
  try {
    const key = createPublicKey({ key: { ...jwk }, format: 'jwk' });
    return verify(
      'sha256',
      Buffer.from(`${jws.protected}.${jws.payload}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(jws.signature, 'base64url'),
    );
  } catch {
    return false;
  }
}
