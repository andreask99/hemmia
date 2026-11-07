import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { createTestCa, hasOpenssl, type TestCa } from '../../test/ca.ts';
import { createApnsSender } from './apns.ts';

const TOKEN = 'ab'.repeat(32);
const MESSAGE = {
  kind: 'reply' as const,
  ref: 'r1',
  hubHost: 'zt0jr4qknd6e.h.relay.test',
  hubId: 'zt0jr4qknd6e',
};

(hasOpenssl() ? describe : describe.skip)('APNs sender', () => {
  let ca: TestCa;
  let server: http2.Http2SecureServer;
  let origin = '';
  const seen: { headers: http2.IncomingHttpHeaders; body: string }[] = [];
  let answers: { status: number; reason?: string }[] = [];
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

  beforeAll(async () => {
    ca = createTestCa();
    const cert = ca.issue(['localhost']);
    server = http2.createSecureServer({ cert: cert.cert, key: cert.key });
    server.on('stream', (stream, headers) => {
      let body = '';
      stream.setEncoding('utf8');
      stream.on('data', (c: string) => (body += c));
      stream.on('end', () => {
        seen.push({ headers, body });
        const a = answers.shift() ?? { status: 200 };
        stream.respond({ ':status': a.status });
        stream.end(a.reason ? JSON.stringify({ reason: a.reason }) : '');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    origin = `https://localhost:${String((server.address() as AddressInfo).port)}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) =>
      server.close(() => {
        r();
      }),
    );
    ca.dispose();
  });

  const sender = () =>
    createApnsSender({
      keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'ABCDEFGHIJ',
      teamId: 'TEAM123456',
      topic: 'app.hemmia.ios',
      origins: { production: origin, sandbox: origin },
      ca: ca.certPem,
      retryDelayMs: 5,
    });

  it('sends a content-free alert with a valid token', async () => {
    seen.length = 0;
    const s = sender();
    expect(await s.send('ios', 'production', TOKEN, MESSAGE)).toBe('ok');
    const h = seen[0]?.headers ?? {};
    expect(h[':path']).toBe(`/3/device/${TOKEN}`);
    expect(h['apns-topic']).toBe('app.hemmia.ios');
    expect(h['apns-push-type']).toBe('alert');
    expect(h['apns-priority']).toBe('10');
    expect(h['apns-collapse-id']).toBe('reply');
    const jwt = String(h.authorization).replace(/^bearer /, '');
    const [head, claims, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(head ?? '', 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'ABCDEFGHIJ',
    });
    expect(JSON.parse(Buffer.from(claims ?? '', 'base64url').toString())).toMatchObject({
      iss: 'TEAM123456',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head ?? ''}.${claims ?? ''}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sig ?? '', 'base64url'),
      ),
    ).toBe(true);
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({
      aps: {
        alert: { 'title-loc-key': 'push_reply_title', 'loc-key': 'push_reply_body' },
        sound: 'default',
        'thread-id': 'zt0jr4qknd6e',
      },
      k: 'reply',
      r: 'r1',
      h: 'zt0jr4qknd6e.h.relay.test',
    });
    s.close();
  });

  it('maps 410 and bad tokens to gone, retries 5xx once, then reports errors', async () => {
    const s = sender();
    answers = [{ status: 410 }];
    expect(await s.send('ios', 'production', TOKEN, MESSAGE)).toBe('gone');
    answers = [{ status: 400, reason: 'BadDeviceToken' }];
    expect(await s.send('ios', 'production', TOKEN, MESSAGE)).toBe('gone');
    answers = [{ status: 400, reason: 'PayloadTooLarge' }];
    expect(await s.send('ios', 'production', TOKEN, MESSAGE)).toBe('error');
    answers = [{ status: 503 }, { status: 200 }];
    expect(await s.send('ios', 'production', TOKEN, MESSAGE)).toBe('ok');
    answers = [{ status: 500 }, { status: 500 }];
    expect(await s.send('ios', 'production', TOKEN, MESSAGE)).toBe('error');
    expect(await s.send('android', 'production', TOKEN, MESSAGE)).toBe('error');
    s.close();
  });
});
