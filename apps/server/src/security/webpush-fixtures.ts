/** Test helpers: a browser's side of Web Push. */
import { createDecipheriv, createECDH, hkdfSync } from 'node:crypto';

/** What a browser does with a push message (RFC 8291), written independently for the test. */
export function decryptAsBrowser(body: Buffer, uaPrivate: Buffer, auth: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(senderPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), senderPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12),
  );
  const ct = body.subarray(21 + idlen);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const record = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
  return record.subarray(0, record.lastIndexOf(0x02));
}

/** A browser-like subscription: keys plus the request body the app would send. */
export function fakeSubscription(endpoint = 'https://web.push.apple.com/QGuQyavXutnMH') {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = Buffer.alloc(16, 9);
  return {
    privateKey: ua.getPrivateKey(),
    auth,
    body: {
      endpoint,
      keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    },
  };
}
