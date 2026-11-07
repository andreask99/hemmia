/**
 * PKCS#10 certificate requests in DER (RFC 2986), built by hand: ECDSA P-256 key, SHA-256,
 * subject CN = the first name, subjectAltName = the DNS names only (RELAY.md §5.3). Used by the
 * hub for its certificate and by the relay for its own. Owned by Claude.
 */
import { createPublicKey, type KeyObject, sign } from 'node:crypto';

function len(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
};
const seq = (...p: Buffer[]) => tlv(0x30, ...p);
const set = (...p: Buffer[]) => tlv(0x31, ...p);

function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const [a = 0, b = 0, ...rest] = parts;
  const out: number[] = [a * 40 + b];
  for (const n of rest) {
    const groups: number[] = [];
    let v = n;
    do {
      groups.unshift(v & 0x7f);
      v >>= 7;
    } while (v > 0);
    for (let i = 0; i < groups.length - 1; i++) groups[i] = (groups[i] ?? 0) | 0x80;
    out.push(...groups);
  }
  return tlv(0x06, Buffer.from(out));
}

const NAME = /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*$/;

export function buildCsr(key: KeyObject, names: readonly string[]): Buffer {
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new TypeError('CSR keys are ECDSA P-256');
  }
  const first = names[0];
  if (first === undefined || names.some((n) => n.length > 253 || !NAME.test(n))) {
    throw new RangeError('CSR names must be lower-case DNS names');
  }
  const spki = createPublicKey(key).export({ type: 'spki', format: 'der' });
  const subject = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(first, 'utf8')))));
  const generalNames = seq(...names.map((n) => tlv(0x82, Buffer.from(n, 'ascii'))));
  const extensions = seq(seq(oid('2.5.29.17'), tlv(0x04, generalNames)));
  const attributes = tlv(0xa0, seq(oid('1.2.840.113549.1.9.14'), set(extensions)));
  const info = seq(tlv(0x02, Buffer.from([0])), subject, spki, attributes);
  const signature = sign('sha256', info, key);
  return seq(info, seq(oid('1.2.840.10045.4.3.2')), tlv(0x03, Buffer.from([0]), signature));
}
