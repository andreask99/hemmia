import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import Fastify, { type FastifyInstance } from 'fastify';
import { hasOpenssl } from '@hemmia/relay/testing';
import { isViaRelay } from '../security/viarelay.ts';
import { loadOrCreateIdentity, type RelayIdentity } from '../security/relay-identity.ts';
import { createHubCertificate } from './certificate.ts';
import { createRelayClient } from './client.ts';
import { startTestRelay, type TestRelay } from './testrelay.ts';
import { createTunnelClient, safeClientIp, type TunnelClient, type TunnelState } from './tunnel.ts';

const until = async (check: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** An HTTPS request over the relay port with SNI = the hub host, trusting only the test CA. */
function get(
  port: number,
  host: string,
  ca: string,
  path: string,
): Promise<{ status: number; chunks: { at: number; text: string }[] }> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host: '127.0.0.1', port, servername: host, ca });
    const chunks: { at: number; text: string }[] = [];
    let head = '';
    let status = 0;
    s.on('secureConnect', () => {
      s.write(`GET ${path} HTTP/1.1\r\nhost: ${host}\r\nconnection: close\r\n\r\n`);
    });
    s.on('data', (d: Buffer) => {
      const text = d.toString();
      if (status === 0) {
        head += text;
        const m = /^HTTP\/1\.1 (\d+)/.exec(head);
        if (m) status = Number(m[1]);
      }
      chunks.push({ at: Date.now(), text });
    });
    s.on('end', () => {
      resolve({ status, chunks });
    });
    s.on('error', reject);
  });
}

(hasOpenssl() ? describe : describe.skip)('hub tunnel', () => {
  let t: TestRelay;
  let dir: string;
  let app: FastifyInstance;
  let identity: RelayIdentity;
  let hostname = '';
  let tunnel: TunnelClient;
  const states: TunnelState[] = [];

  beforeAll(async () => {
    t = await startTestRelay();
    dir = mkdtempSync(join(tmpdir(), 'hub-tunnel-'));
    identity = loadOrCreateIdentity(dir);
    const client = createRelayClient({ endpoint: t.endpoint, identity: () => identity });
    hostname = (await client.register()).hostname;
    const cert = createHubCertificate({
      dataDir: dir,
      client,
      hostname: () => hostname,
      pollMs: 10,
    });
    await cert.ensure();
    app = Fastify();
    app.get('/ip', async (req) => ({ ip: req.ip, via: isViaRelay(req.socket) }));
    app.get('/stream', (_req, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, { 'content-type': 'text/event-stream' });
      reply.raw.write('data: one\n\n');
      setTimeout(() => {
        reply.raw.end('data: two\n\n');
      }, 300);
    });
    await app.ready();
    tunnel = createTunnelClient({
      endpoint: t.endpoint,
      identity: () => identity,
      secureContext: () => cert.current(),
      server: app.server,
      agent: 'kchat-test',
      backoffScale: 0.01,
      onStatus: (s) => states.push(s.state),
    });
    tunnel.start();
    await until(() => tunnel.status().state === 'connected');
  });
  afterAll(async () => {
    tunnel.stop();
    await app.close();
    await t.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves HTTP through the relay with TLS ending on the hub', async () => {
    const res = await get(t.relay.port, hostname, t.ca.certPem, '/ip');
    expect(res.status).toBe(200);
    const body = res.chunks.map((c) => c.text).join('');
    // The relay saw 127.0.0.1, which the hub maps to the shared documentation address.
    expect(body).toContain('{"ip":"192.0.2.1","via":true}');
  });

  it('streams server-sent events as they are written', async () => {
    const res = await get(t.relay.port, hostname, t.ca.certPem, '/stream');
    const one = res.chunks.find((c) => c.text.includes('data: one'));
    const two = res.chunks.find((c) => c.text.includes('data: two'));
    expect(one && two).toBeTruthy();
    expect((two?.at ?? 0) - (one?.at ?? 0)).toBeGreaterThan(200);
  });

  it('reconnects when the relay comes back', async () => {
    await t.stop();
    await until(() => tunnel.status().state === 'connecting');
    await t.restart();
    await until(() => tunnel.status().state === 'connected');
    const res = await get(t.relay.port, hostname, t.ca.certPem, '/ip');
    expect(res.status).toBe(200);
  });

  it('stops retrying when the relay blocks the hub', async () => {
    t.relay.db.prepare('UPDATE hubs SET blocked_at = 1 WHERE id = ?').run(identity.hubId);
    t.relay.tunnels.close(identity.hubId);
    await until(() => tunnel.status().state === 'blocked');
    expect(tunnel.status().lastError).toBe('blocked');
    t.relay.db.prepare('UPDATE hubs SET blocked_at = NULL WHERE id = ?').run(identity.hubId);
    tunnel.stop();
    expect(tunnel.status().state).toBe('off');
    tunnel.start();
    await until(() => tunnel.status().state === 'connected');
  });
});

describe('tunnel client backoff', () => {
  it('waits longer after each failed connection', async () => {
    const attempts: number[] = [];
    const server = net.createServer((s) => {
      attempts.push(Date.now());
      s.destroy();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as net.AddressInfo).port;
    const client = createTunnelClient({
      endpoint: { domain: 'relay.test', address: { host: '127.0.0.1', port }, ca: null },
      identity: () => {
        throw new Error('unused');
      },
      secureContext: () => null,
      server: Fastify().server,
      agent: 'x',
      backoffScale: 0.02,
      random: () => 0.5,
    });
    client.start();
    await until(() => attempts.length >= 5, 5000);
    client.stop();
    server.close();
    const gaps = attempts.slice(1).map((a, i) => a - (attempts[i] ?? a));
    // 20, 40, 80, 160 ms (scaled 1, 2, 4, 8 s): each gap clearly longer than the one before.
    for (let i = 1; i < gaps.length; i++)
      expect(gaps[i] ?? 0).toBeGreaterThan((gaps[i - 1] ?? 0) * 1.4);
  });

  it('maps odd client addresses to a shared one', () => {
    expect(safeClientIp('203.0.113.7')).toBe('203.0.113.7');
    expect(safeClientIp('2001:db8::1')).toBe('2001:db8::1');
    expect(safeClientIp('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7');
    for (const odd of [
      '127.0.0.1',
      '::1',
      '::',
      'fe80::1',
      '169.254.1.1',
      '0.0.0.0',
      'nonsense',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
    ]) {
      expect(safeClientIp(odd)).toBe('192.0.2.1');
    }
  });
});
