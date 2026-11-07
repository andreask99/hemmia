import { createECDH, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  encryptPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  vapidAuthorization,
} from './webpush.ts';
import { decryptAsBrowser } from './webpush-fixtures.ts';

const b = (s: string) => Buffer.from(s, 'base64url');

describe('encryptPayload', () => {
  it('matches the RFC 8291 Appendix A test vector exactly', () => {
    const out = encryptPayload(
      {
        p256dh: b(
          'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        ),
        auth: b('BTBZMqHH6r4Tts7J_aSIgg'),
      },
      Buffer.from('When I grow up, I want to be a watermelon'),
      {
        salt: b('DGv6ra1nlYgDCS1FRnbzlw'),
        senderPrivateKey: b('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
      },
    );
    expect(out.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('uses fresh keys and salt per message, and the browser can decrypt it', () => {
    const ua = createECDH('prime256v1');
    ua.generateKeys();
    const keys = { p256dh: ua.getPublicKey(), auth: Buffer.alloc(16, 7) };
    const a = encryptPayload(keys, Buffer.from('{"kind":"reply"}'));
    const c = encryptPayload(keys, Buffer.from('{"kind":"reply"}'));
    expect(a.equals(c)).toBe(false);
    expect(decryptAsBrowser(a, ua.getPrivateKey(), keys.auth).toString()).toBe('{"kind":"reply"}');
  });

  it('rejects malformed subscription keys', () => {
    expect(() =>
      encryptPayload({ p256dh: Buffer.alloc(65, 4), auth: Buffer.alloc(16) }, Buffer.from('x')),
    ).toThrow();
    expect(() =>
      encryptPayload({ p256dh: Buffer.alloc(33), auth: Buffer.alloc(16) }, Buffer.from('x')),
    ).toThrow();
  });
});

describe('VAPID', () => {
  it('signs an ES256 JWT for the push service origin that verifies with the public key', () => {
    const keys = generateVapidKeys();
    const header = vapidAuthorization(
      'https://web.push.apple.com/QGuQyavXutnMH',
      keys,
      'https://kchat.example.ts.net',
      1_800_000_000_000,
    );
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h = '', c = '', sig = '', k = ''] = match ?? [];
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(b(h).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(b(c).toString())).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1_800_000_000 + 12 * 3600,
      sub: 'https://kchat.example.ts.net',
    });
    const raw = b(keys.publicKey);
    const pub = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: raw.subarray(1, 33).toString('base64url'),
        y: raw.subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    expect(
      verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, b(sig)),
    ).toBe(true);
  });
});

describe('isAllowedPushEndpoint', () => {
  it('allows only HTTPS endpoints of known push services', () => {
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('http://web.push.apple.com/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://web.push.apple.com:8443/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://evilweb.push.apple.com.attacker.net/')).toBe(false);
    expect(isAllowedPushEndpoint('https://127.0.0.1/')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pw@web.push.apple.com/')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
  });
});
