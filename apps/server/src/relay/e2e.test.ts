/**
 * End to end (P2.14): a relay (fake ACME and DNS, test CA as the public CA) and a full hub app
 * in one process. The hub registers, gets its certificate and connects; an HTTPS client that
 * trusts only the test CA reaches the hub through the relay port; a server-sent event stream
 * crosses the tunnel; the relay's data holds no hub key; the hub reconnects after a relay
 * restart. Also run by `npm run e2e:relay`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import { RemoteStatus, StartPullResponse } from '@hemmia/shared';
import { hasOpenssl } from '@hemmia/relay/testing';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, LlmClient, PullProgress } from '../llm/types.ts';
import { startTestRelay, type TestRelay } from './testrelay.ts';

const ORIGIN = 'http://localhost:5173';

function viaRelay(
  t: TestRelay,
  host: string,
  path: string,
  cookie = '',
): Promise<{ status: number; chunks: { at: number; text: string }[] }> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({
      host: '127.0.0.1',
      port: t.relay.port,
      servername: host,
      ca: t.ca.certPem,
    });
    const chunks: { at: number; text: string }[] = [];
    s.on('secureConnect', () => {
      s.write(
        `GET ${path} HTTP/1.1\r\nhost: ${host}\r\n${cookie ? `cookie: ${cookie}\r\n` : ''}connection: close\r\n\r\n`,
      );
    });
    const finish = () => {
      const status = Number(/^HTTP\/1\.1 (\d+)/.exec(chunks[0]?.text ?? '')?.[1] ?? 0);
      resolve({ status, chunks });
    };
    s.on('data', (d: Buffer) => {
      chunks.push({ at: Date.now(), text: d.toString() });
      // The end of a chunked body (event streams keep the connection open).
      if (
        chunks
          .map((c) => c.text)
          .join('')
          .includes('\r\n0\r\n\r\n')
      ) {
        finish();
        s.destroy();
      }
    });
    s.on('end', finish);
    s.on('error', reject);
  });
}

(hasOpenssl() ? describe : describe.skip)('relay end to end', () => {
  let t: TestRelay;
  let dir: string;
  let built: App;
  let host = '';
  let admin = '';
  let deviceCookie = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'e2e-relay-'));
    t = await startTestRelay({ dataDir: join(dir, 'relay') });
    writeFileSync(join(dir, 'ca.pem'), t.ca.certPem);
    const llm: LlmClient = {
      async *chat(): AsyncGenerator<ChatChunk> {
        await Promise.resolve();
        yield { type: 'done', promptTokens: 0, outputTokens: 0, loadMs: 0 };
      },
      loaded: () => Promise.resolve([]),
      unload: () => Promise.resolve(),
      capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
      installed: () => Promise.resolve([]),
      // A slow download, so its progress events arrive over time.
      async *pull(): AsyncGenerator<PullProgress> {
        for (const pct of [10, 50, 100]) {
          await new Promise((r) => setTimeout(r, 300));
          yield { status: pct === 100 ? 'success' : 'pulling', completed: pct, total: 100 };
        }
      },
    };
    built = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        HEMMIA_DATA_DIR: join(dir, 'hub'),
        HEMMIA_RELAY_DOMAIN: 'relay.test',
        HEMMIA_RELAY_ADDRESS: `127.0.0.1:${String(t.endpoint.address.port)}`,
        HEMMIA_RELAY_CA: join(dir, 'ca.pem'),
      }),
      {
        db: openDatabase(':memory:'),
        kdfParams: { m: 1024, t: 1, p: 1 },
        llm,
        fastRemote: true,
        remoteWaitMs: 10_000,
      },
    );
    await built.app.ready();
    const invite = built.auth.createInvite({ role: 'admin', restricted: false, createdBy: null });
    const res = await built.app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({
        code: invite.code,
        username: 'boss',
        password: 'blue tractor sings loudly',
      }),
    });
    admin = String(res.headers['set-cookie']).split(';')[0] ?? '';
    // Pair this "browser" as a device (normally by redeeming a link) so the gate lets it in.
    const token = randomBytes(32).toString('base64url');
    const session = built.auth.resolveSession(admin.split('=')[1] ?? '');
    if (!session) throw new Error('no session');
    built.db
      .prepare(
        "INSERT INTO devices (id, user_id, token_hash, label, created_at, last_seen_at) VALUES ('d1', ?, ?, 'test', ?, ?)",
      )
      .run(session.userId, createHash('sha256').update(token).digest(), Date.now(), Date.now());
    built.db.prepare("UPDATE sessions SET device_id = 'd1' WHERE id = ?").run(session.sessionId);
    deviceCookie = `hemmia_device=${token}`;
    const on = await built.app.inject({
      method: 'POST',
      url: '/api/admin/remote',
      headers: { cookie: admin, origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{"connect":true}',
    });
    const status = RemoteStatus.parse(on.json());
    expect(status.state).toBe('connected');
    host = status.hostname ?? '';
  });
  afterAll(async () => {
    await built.app.close();
    await t.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the hub through the relay with a certificate from the CA', async () => {
    const res = await viaRelay(t, host, '/api/health');
    expect(res.status).toBe(200);
    expect(res.chunks.map((c) => c.text).join('')).toContain('"status":"ok"');
  });

  it('streams server-sent events across the tunnel as they happen', async () => {
    const started = await built.app.inject({
      method: 'POST',
      url: '/api/admin/models/pulls',
      headers: { cookie: admin, origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{"model":"gemma4:e2b"}',
    });
    const { pullId } = StartPullResponse.parse(started.json());
    // Without a paired device the relay path is closed; with one it works.
    expect(
      (await viaRelay(t, host, `/api/admin/models/pulls/${pullId}/events`, admin)).status,
    ).toBe(403);
    const res = await viaRelay(
      t,
      host,
      `/api/admin/models/pulls/${pullId}/events`,
      `${admin}; ${deviceCookie}`,
    );
    expect(res.status).toBe(200);
    const progress = res.chunks.filter((c) => c.text.includes('"type":"progress"'));
    const done = res.chunks.find((c) => c.text.includes('"type":"done"'));
    expect(progress.length).toBeGreaterThan(0);
    expect(done).toBeDefined();
    expect((done?.at ?? 0) - (progress[0]?.at ?? 0)).toBeGreaterThan(250);
  });

  it('keeps every hub key on the hub', () => {
    const hubKey = readFileSync(join(dir, 'hub', 'relay', 'tls-key.pem'), 'utf8');
    const body = hubKey
      .split('\n')
      .filter((l) => !l.startsWith('-----'))
      .join('');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(join(dir, 'relay'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = readFileSync(f);
      expect(content.includes(Buffer.from(body.slice(0, 40)))).toBe(false);
      expect(content.includes(Buffer.from(body, 'base64'))).toBe(false);
    }
  });

  it('reconnects after the relay restarts', async () => {
    await t.stop();
    await t.restart();
    const end = Date.now() + 10_000;
    for (;;) {
      const ok = await viaRelay(t, host, '/api/health').then(
        (r) => r.status === 200,
        () => false,
      );
      if (ok) break;
      if (Date.now() > end) throw new Error('no reconnect');
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  it('keeps trying after Connect failed to start, without the admin switching again', async () => {
    const toggle = (connect: boolean) =>
      built.app.inject({
        method: 'POST',
        url: '/api/admin/remote',
        headers: { cookie: admin, origin: ORIGIN, 'content-type': 'application/json' },
        payload: JSON.stringify({ connect }),
      });
    await toggle(false);
    await t.stop();
    const on = RemoteStatus.parse((await toggle(true)).json());
    expect(on.state).not.toBe('connected');
    await t.restart();
    const end = Date.now() + 10_000;
    for (;;) {
      const ok = await viaRelay(t, host, '/api/health').then(
        (r) => r.status === 200,
        () => false,
      );
      if (ok) break;
      if (Date.now() > end) throw new Error('no retry');
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});
