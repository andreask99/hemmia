/**
 * Web Push without dependencies: payload encryption (RFC 8291, aes128gcm per RFC 8188) and
 * VAPID authentication (RFC 8292) with node:crypto. Owned by Claude (crypto).
 *
 * The payload is end-to-end encrypted to the browser's subscription key; the push service
 * (Apple, Google, Mozilla) only sees the ciphertext, its length and timing.
 */
import {
  createECDH,
  createCipheriv,
  createPrivateKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  type JsonWebKey,
} from 'node:crypto';

export interface PushKeys {
  /** Browser's P-256 public key, 65 bytes uncompressed. */
  p256dh: Buffer;
  /** Browser's 16-byte auth secret. */
  auth: Buffer;
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (the browser's applicationServerKey). */
  publicKey: string;
  /** Private key as JWK (d, x, y). */
  privateJwk: JsonWebKey;
}

/** Push services browsers use; subscriptions to any other host are refused (no SSRF). */
const PUSH_HOSTS = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'notify.windows.com',
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: rawPublicKey(jwk).toString('base64url'), privateJwk: jwk };
}

function rawPublicKey(jwk: JsonWebKey): Buffer {
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') throw new Error('bad VAPID key');
  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
}

/**
 * Encrypts `plaintext` for one subscription (a single aes128gcm record). `salt` and
 * `senderKey` are only passed by tests; normally both are fresh per message.
 */
export function encryptPayload(
  keys: PushKeys,
  plaintext: Buffer,
  test?: { salt: Buffer; senderPrivateKey: Buffer },
): Buffer {
  if (keys.p256dh.length !== 65 || keys.p256dh[0] !== 0x04 || keys.auth.length !== 16) {
    throw new Error('bad subscription keys');
  }
  const ecdh = createECDH('prime256v1');
  if (test) ecdh.setPrivateKey(test.senderPrivateKey);
  else ecdh.generateKeys();
  const senderPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(keys.p256dh); // throws on a point not on the curve
  const salt = test?.salt ?? randomBytes(16);

  // RFC 8291 §3.4: IKM from the ECDH secret, keyed by the auth secret.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), keys.p256dh, senderPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, keys.auth, keyInfo, 32));
  // RFC 8188 §2.2: content key and nonce.
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
  );

  // One record: plaintext, then the 0x02 delimiter that marks the last record.
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  if (record.length + 16 > RECORD_SIZE) throw new Error('payload too large');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  // Header: salt (16) | record size (uint32) | key id length (1) | sender public key (65).
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([header, senderPublic, body]);
}

const RECORD_SIZE = 4096;

/** The Authorization header for one push request (JWT valid 12 hours). */
export function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  nowMs: number,
): string {
  const audience = new URL(endpoint).origin;
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned = `${b64({ typ: 'JWT', alg: 'ES256' })}.${b64({
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: subject,
  })}`;
  const key = createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${signature.toString('base64url')}, k=${keys.publicKey}`;
}
