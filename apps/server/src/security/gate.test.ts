import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { allowedWithoutDevice } from './gate.ts';
import { markViaRelay } from './viarelay.ts';

const ORIGIN = 'http://localhost';

/** Every route of the app as [method, concrete path], from Fastify's route tree. */
function allRoutes(tree: string): [string, string][] {
  const out: [string, string][] = [];
  const stack: string[] = [];
  for (const line of tree.split('\n')) {
    const m = /^((?:│ {3}| {4})*)(?:├── |└── )(\S+)(?: \(([^)]+)\))?/.exec(line);
    if (!m) continue;
    const depth = (m[1] ?? '').length / 4;
    const path = (stack[depth - 1] ?? '') + (m[2] ?? '');
    stack[depth] = path;
    stack.length = depth + 1;
    for (const method of (m[3] ?? '').split(', ').filter(Boolean)) {
      if (method === 'HEAD') continue;
      out.push([
        method,
        path.replace(/:[A-Za-z]+(\|:[A-Za-z]+)*/g, '00000000-0000-4000-8000-000000000000'),
      ]);
    }
  }
  return out;
}

describe('the allow list', () => {
  it('is exactly SECURITY.md §3', () => {
    for (const [m, p] of [
      ['GET', '/'],
      ['GET', '/index.html'],
      ['GET', '/assets/index-abc.js'],
      ['GET', '/chats/123'],
      ['GET', '/manifest.webmanifest'],
      ['GET', '/sw.js'],
      ['GET', '/api/health'],
      ['GET', '/api/gate'],
      ['GET', '/api/setup/state'],
      ['POST', '/api/links/redeem'],
      ['POST', '/api/setup/account'],
    ]) {
      expect(allowedWithoutDevice(m ?? '', p ?? '')).toBe(true);
    }
    for (const [m, p] of [
      ['GET', '/api/me'],
      ['GET', '/api'],
      ['POST', '/api/auth/login'],
      ['POST', '/api/auth/invite/accept'],
      ['POST', '/api/auth/recover'],
      ['POST', '/'],
      ['PUT', '/api/links/redeem'],
      ['GET', '/api/links/redeem'],
      ['DELETE', '/index.html'],
      // Encoded paths are API paths once decoded (the router decodes them too).
      ['GET', '/%61pi/me'],
      ['GET', '/%E0%A4%A'],
    ]) {
      expect(allowedWithoutDevice(m ?? '', p ?? '')).toBe(false);
    }
  });
});

describe('device gate', () => {
  let built: App;
  let port = 0;
  let relay = false;
  let cookie = '';
  let deviceCookie = '';
  let sessionId = '';

  beforeAll(async () => {
    built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
    });
    // Sockets accepted while `relay` is set count as coming through the relay tunnel.
    built.app.server.on('connection', (s) => {
      if (relay) markViaRelay(s);
    });
    await built.app.listen({ host: '127.0.0.1', port: 0 });
    port = (built.app.server.address() as AddressInfo).port;
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
    cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
    const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
    if (!session) throw new Error('no session');
    sessionId = session.sessionId;
  });
  afterAll(async () => {
    await built.app.close();
  });

  function request(
    method: string,
    path: string,
    viaRelay: boolean,
    cookies: string,
    body?: string,
  ): Promise<{ status: number; body: string; setCookie: string[] }> {
    relay = viaRelay;
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path,
          agent: false,
          headers: {
            host: 'localhost',
            origin: ORIGIN,
            ...(cookies ? { cookie: cookies } : {}),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
        },
        (res) => {
          let text = '';
          res.on('data', (c: Buffer) => (text += c.toString()));
          res.on('end', () => {
            const sc = res.headers['set-cookie'] ?? [];
            resolve({ status: res.statusCode ?? 0, body: text, setCookie: sc });
          });
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }

  it('answers 403 device_required for every route outside the allow list through the relay', async () => {
    const routes = allRoutes(built.app.printRoutes({ commonPrefix: false }));
    expect(routes.length).toBeGreaterThan(45);
    const checked: string[] = [];
    for (const [method, path] of routes) {
      if (allowedWithoutDevice(method, path)) continue;
      const res = await request(
        method,
        path,
        true,
        cookie,
        method === 'GET' || method === 'DELETE' ? undefined : '{}',
      );
      expect([method, path, res.status, res.body]).toEqual([
        method,
        path,
        403,
        '{"error":{"code":"device_required"}}',
      ]);
      checked.push(`${method} ${path}`);
    }
    expect(checked).toContain('POST /api/auth/login');
    expect(checked).toContain('GET /api/me');
  });

  it('works over loopback without a device (Tailscale and this computer are not gated)', async () => {
    const res = await request('GET', '/api/me', false, cookie);
    expect(res.status).toBe(200);
  });

  it('lets the allow list through without a device', async () => {
    expect((await request('GET', '/api/health', true, '')).status).toBe(200);
    expect(JSON.parse((await request('GET', '/api/gate', true, '')).body)).toEqual({
      device: false,
    });
  });

  it('lets a paired device in, and only with its own session', async () => {
    const token = randomBytes(32).toString('base64url');
    const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
    built.db
      .prepare(
        "INSERT INTO devices (id, user_id, token_hash, label, created_at, last_seen_at) VALUES ('11111111-1111-4111-8111-111111111111', ?, ?, 'phone', ?, ?)",
      )
      .run(
        session?.userId ?? '',
        createHash('sha256').update(token).digest(),
        Date.now(),
        Date.now(),
      );
    deviceCookie = `hemmia_device=${token}`;
    // The session isn't tied to this device yet: through the relay it doesn't count.
    expect((await request('GET', '/api/me', true, `${cookie}; ${deviceCookie}`)).status).toBe(401);
    built.db
      .prepare(
        "UPDATE sessions SET device_id = '11111111-1111-4111-8111-111111111111' WHERE id = ?",
      )
      .run(sessionId);
    expect((await request('GET', '/api/me', true, `${cookie}; ${deviceCookie}`)).status).toBe(200);
    expect(JSON.parse((await request('GET', '/api/gate', true, deviceCookie)).body)).toEqual({
      device: true,
    });
    const list = JSON.parse(
      (await request('GET', '/api/devices', true, `${cookie}; ${deviceCookie}`)).body,
    ) as {
      devices: { id: string; current: boolean }[];
    };
    expect(list.devices).toEqual([expect.objectContaining({ label: 'phone', current: true })]);
  });

  it('accepts a device cookie from before the rename and moves it to the new name', async () => {
    const token = deviceCookie.split('=')[1] ?? '';
    const res = await request('GET', '/api/gate', true, `kchat_device=${token}`);
    expect(JSON.parse(res.body)).toEqual({ device: true });
    expect(res.setCookie.some((c) => c.startsWith(`hemmia_device=${token};`))).toBe(true);
    expect(
      res.setCookie.some((c) => c.startsWith('kchat_device=;') && c.includes('Max-Age=0')),
    ).toBe(true);
    // With the new cookie present nothing moves.
    const now = await request('GET', '/api/gate', true, deviceCookie);
    expect(now.setCookie.some((c) => c.startsWith('kchat_device='))).toBe(false);
  });

  it('removing the device ends its sessions', async () => {
    const res = await request(
      'DELETE',
      '/api/devices/11111111-1111-4111-8111-111111111111',
      false,
      `${cookie}; ${deviceCookie}`,
    );
    expect(res.status).toBe(204);
    expect(
      built.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?').get(sessionId),
    ).toEqual({ n: 0 });
    expect((await request('GET', '/api/me', true, `${cookie}; ${deviceCookie}`)).status).toBe(403);
  });

  it('binds a session created on a paired device, and sign-out everywhere keeps only that device', async () => {
    // A device bound to nobody yet (as after redeeming an invite).
    const token = randomBytes(32).toString('base64url');
    built.db
      .prepare(
        "INSERT INTO devices (id, user_id, token_hash, label, created_at, last_seen_at) VALUES ('22222222-2222-4222-8222-222222222222', NULL, ?, '', ?, ?)",
      )
      .run(createHash('sha256').update(token).digest(), Date.now(), Date.now());
    const other = randomBytes(32).toString('base64url');
    const users = built.db.prepare("SELECT id FROM users WHERE username = 'boss'").get() as {
      id: string;
    };
    built.db
      .prepare(
        "INSERT INTO devices (id, user_id, token_hash, label, created_at, last_seen_at) VALUES ('33333333-3333-4333-8333-333333333333', ?, ?, 'old', ?, ?)",
      )
      .run(users.id, createHash('sha256').update(other).digest(), Date.now(), Date.now());
    const login = await request(
      'POST',
      '/api/auth/login',
      true,
      `hemmia_device=${token}`,
      JSON.stringify({ username: 'boss', password: 'blue tractor sings loudly' }),
    );
    expect(login.status).toBe(200);
    const session =
      login.setCookie.find((c) => c.startsWith('hemmia_session='))?.split(';')[0] ?? '';
    const both = `${session}; hemmia_device=${token}`;
    expect((await request('GET', '/api/me', true, both)).status).toBe(200);
    expect((await request('POST', '/api/auth/logout-all', true, both, '{}')).status).toBe(204);
    const left = built.db.prepare('SELECT id FROM devices WHERE user_id = ?').all(users.id) as {
      id: string;
    }[];
    expect(left.map((d) => d.id)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });
});
