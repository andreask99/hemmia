import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { RemoteStatus } from '@hemmia/shared';
import { hasOpenssl } from '@hemmia/relay/testing';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { startTestRelay, type TestRelay } from '../relay/testrelay.ts';

const ORIGIN = 'http://localhost:5173';

async function signUp(built: App, role: 'admin' | 'member', username: string) {
  const invite = built.auth.createInvite({ role, restricted: false, createdBy: null });
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

describe('remote access without a relay', () => {
  it('reports not configured and refuses to turn on', async () => {
    const built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
    });
    const admin = await signUp(built, 'admin', 'boss');
    const get = await built.app.inject({
      method: 'GET',
      url: '/api/admin/remote',
      headers: { cookie: admin },
    });
    expect(RemoteStatus.parse(get.json())).toMatchObject({ relayConfigured: false, state: 'off' });
    const post = await built.app.inject({
      method: 'POST',
      url: '/api/admin/remote',
      headers: { cookie: admin, origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{"connect":true}',
    });
    expect(post.statusCode).toBe(409);
    expect(post.json()).toEqual({ error: { code: 'relay_not_configured' } });
    await built.app.close();
  });
});

(hasOpenssl() ? describe : describe.skip)('remote access through the relay', () => {
  let t: TestRelay;
  let dir: string;
  let built: App;
  beforeAll(async () => {
    t = await startTestRelay();
    dir = mkdtempSync(join(tmpdir(), 'hub-remote-'));
    writeFileSync(join(dir, 'ca.pem'), t.ca.certPem);
    built = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        HEMMIA_DATA_DIR: join(dir, 'data'),
        HEMMIA_RELAY_DOMAIN: 'relay.test',
        HEMMIA_RELAY_ADDRESS: `127.0.0.1:${String(t.endpoint.address.port)}`,
        HEMMIA_RELAY_CA: join(dir, 'ca.pem'),
      }),
      {
        db: openDatabase(':memory:'),
        kdfParams: { m: 1024, t: 1, p: 1 },
        fastRemote: true,
        remoteWaitMs: 10_000,
      },
    );
    await built.app.ready();
  });
  afterAll(async () => {
    await built.app.close();
    await t.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  const call = (method: 'GET' | 'POST' | 'DELETE', cookie: string, body?: unknown) =>
    built.app.inject({
      method,
      url: '/api/admin/remote',
      headers: { cookie, origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { payload: JSON.stringify(body) } : {}),
    });

  function healthViaRelay(host: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const s = tls.connect({
        host: '127.0.0.1',
        port: t.relay.port,
        servername: host,
        ca: t.ca.certPem,
      });
      let data = '';
      s.on('secureConnect', () => {
        s.write(`GET /api/health HTTP/1.1\r\nhost: ${host}\r\nconnection: close\r\n\r\n`);
      });
      s.on('data', (d: Buffer) => (data += d.toString()));
      s.on('end', () => {
        resolve(data);
      });
      s.on('error', reject);
    });
  }

  it('is admin only', async () => {
    const member = await signUp(built, 'member', 'ben');
    expect((await call('GET', member)).statusCode).toBe(403);
    expect((await call('POST', member, { connect: true })).statusCode).toBe(403);
  });

  it('turns on, serves the hub host through the relay, turns off and forgets', async () => {
    const admin = await signUp(built, 'admin', 'boss');
    const before = RemoteStatus.parse((await call('GET', admin)).json());
    expect(before).toMatchObject({ relayConfigured: true, connect: false, state: 'off' });

    const on = RemoteStatus.parse((await call('POST', admin, { connect: true })).json());
    expect(on.state).toBe('connected');
    expect(on.hostname).toMatch(/^[0-9a-hjkmnp-tv-z]{12}\.h\.relay\.test$/);
    expect(on.certificate?.notAfter ?? 0).toBeGreaterThan(Date.now());
    const host = on.hostname ?? '';

    const direct = await built.app.inject({ method: 'GET', url: '/api/health', headers: { host } });
    expect(direct.statusCode).toBe(200);
    expect(await healthViaRelay(host)).toContain('{"status":"ok"');
    const status = RemoteStatus.parse((await call('GET', admin)).json());
    expect(status.quota?.limitBytes).toBeGreaterThan(0);

    const off = RemoteStatus.parse((await call('POST', admin, { connect: false })).json());
    expect(off).toMatchObject({ connect: false, state: 'off' });
    expect(
      (await built.app.inject({ method: 'GET', url: '/api/health', headers: { host } })).statusCode,
    ).toBe(421);

    const forgotten = RemoteStatus.parse((await call('DELETE', admin)).json());
    expect(forgotten).toMatchObject({ connect: false, hostname: null });
    expect(existsSync(join(dir, 'data', 'relay', 'identity.pem'))).toBe(false);
    expect(t.relay.db.prepare('SELECT COUNT(*) AS n FROM hubs').get()).toEqual({ n: 0 });

    const events = built.db
      .prepare("SELECT event FROM audit_log WHERE event LIKE 'remote_%' ORDER BY id")
      .all() as { event: string }[];
    expect(events.map((e) => e.event)).toEqual([
      'remote_enabled',
      'remote_disabled',
      'remote_forgotten',
    ]);
  });
});
