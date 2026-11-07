import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import net from 'node:net';
import { X509Certificate } from 'node:crypto';
import { openDb } from './db.ts';
import { startRelay, type Relay } from './relay.ts';
import { createTestCa, hasOpenssl, type TestCa } from '../test/ca.ts';
import { connect, DOMAIN, rawHttp, silent, testConfig } from '../test/helpers.ts';

const run = hasOpenssl() ? describe : describe.skip;

run('relay router and own TLS', () => {
  let ca: TestCa;
  let relay: Relay;
  beforeAll(async () => {
    ca = createTestCa();
    const own = ca.issue([`api.${DOMAIN}`, `tunnel.${DOMAIN}`, `join.${DOMAIN}`]);
    relay = await startRelay(testConfig(), {
      db: openDb(':memory:'),
      log: silent,
      tls: own,
      limits: { perIpConcurrent: 3, perIpPerMinute: 1000 },
    });
  });
  afterAll(async () => {
    await relay.close();
    ca.dispose();
  });

  it('serves health on api.<domain> with the relay certificate', async () => {
    const s = await connect(relay.port, `api.${DOMAIN}`, ca.certPem);
    const res = await rawHttp(s, 'GET', '/v1/health', `api.${DOMAIN}`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('drops unknown server names and non-TLS bytes', async () => {
    await expect(connect(relay.port, 'evil.example', ca.certPem)).rejects.toThrow();
    await expect(connect(relay.port, `nothub.h.${DOMAIN}`, ca.certPem)).rejects.toThrow();
    const closed = await new Promise<boolean>((resolve) => {
      const s = net.connect(relay.port, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\n\r\n'));
      s.on('close', () => {
        resolve(true);
      });
      s.on('error', () => undefined);
    });
    expect(closed).toBe(true);
  });

  it('accepts the tunnel host only with the tunnel ALPN', async () => {
    // tunnel. with http/1.1 → closed right after the handshake.
    const s = await connect(relay.port, `tunnel.${DOMAIN}`, ca.certPem);
    const closed = await new Promise<boolean>((resolve) => {
      s.on('close', () => {
        resolve(true);
      });
    });
    expect(closed).toBe(true);
  });

  it('limits concurrent connections per client address', async () => {
    const held: net.Socket[] = [];
    for (let i = 0; i < 3; i++) {
      held.push(
        await new Promise<net.Socket>((resolve) => {
          const s = net.connect(relay.port, '127.0.0.1', () => {
            resolve(s);
          });
        }),
      );
    }
    await expect(connect(relay.port, `api.${DOMAIN}`, ca.certPem)).rejects.toThrow();
    for (const s of held) s.destroy();
    await new Promise((r) => setTimeout(r, 50));
    const ok = await connect(relay.port, `api.${DOMAIN}`, ca.certPem);
    expect(ok.authorized).toBe(true);
    ok.destroy();
  });

  it('swaps its certificate in place', async () => {
    const next = ca.issue([`api.${DOMAIN}`, `tunnel.${DOMAIN}`, `join.${DOMAIN}`]);
    relay.ownTls.setCertificate(next.cert, next.key);
    const s = await connect(relay.port, `api.${DOMAIN}`, ca.certPem);
    const peer = s.getPeerX509Certificate();
    expect(peer?.toString()).toBe(new X509Certificate(next.cert).toString());
    s.destroy();
  });
});
