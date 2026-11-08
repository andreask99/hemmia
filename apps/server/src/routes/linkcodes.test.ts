import { afterEach, describe, expect, it } from 'vitest';
import { CreateInviteResponse, CreateLinkResponse, RedeemLinkResponse } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';

const ORIGIN = 'https://homehub.example.ts.net';
let built: App | undefined;
let clock = 1_800_000_000_000;
afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

async function setup() {
  clock = 1_800_000_000_000;
  const b = await buildApp(
    loadConfig({ NODE_ENV: 'test', HEMMIA_PUBLIC_HOSTNAMES: 'homehub.example.ts.net' }),
    { db: openDatabase(':memory:'), kdfParams: { m: 1024, t: 1, p: 1 }, now: () => clock },
  );
  built = b;
  const invite = b.auth.createInvite({ role: 'admin', restricted: false, createdBy: null });
  const res = await b.app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, host: 'homehub.example.ts.net', 'content-type': 'application/json' },
    payload: JSON.stringify({
      code: invite.code,
      username: 'boss',
      password: 'blue tractor sings loudly',
    }),
  });
  const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  const post = (url: string, body: unknown, cookies = cookie) =>
    b.app.inject({
      method: 'POST',
      url,
      headers: {
        origin: ORIGIN,
        host: 'homehub.example.ts.net',
        'content-type': 'application/json',
        ...(cookies ? { cookie: cookies } : {}),
      },
      payload: JSON.stringify(body),
    });
  return { b, cookie, post };
}

const setCookies = (h: string | string[] | number | undefined) =>
  (Array.isArray(h) ? h : [String(h)]).map((c) => c.split(';')[0] ?? '');

describe('sign-in links', () => {
  it('creates a link with a direct address and signs in another device with it', async () => {
    const { b, post } = await setup();
    const created = await post('/api/links', { kind: 'signin' });
    expect(created.statusCode).toBe(201);
    const link = CreateLinkResponse.parse(created.json());
    expect(link.shareLink).toBeNull();
    expect(link.directLink).toBe(`https://homehub.example.ts.net/join#l~${link.code}`);
    expect(link.expiresAt).toBe(clock + 10 * 60_000);

    const redeemed = await post('/api/links/redeem', { kind: 'l', code: link.code }, '');
    expect(redeemed.statusCode).toBe(200);
    expect(RedeemLinkResponse.parse(redeemed.json())).toEqual({ next: 'app' });
    const cookies = setCookies(redeemed.headers['set-cookie']);
    expect(cookies.some((c) => c.startsWith('hemmia_session='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('hemmia_device='))).toBe(true);
    // The new session works and can read data encrypted with the user's key.
    const me = await b.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { host: 'homehub.example.ts.net', cookie: cookies.join('; ') },
    });
    expect(me.statusCode).toBe(200);
    // The device is bound to the user and the session to the device.
    const device = b.db.prepare('SELECT user_id FROM devices').get() as { user_id: string };
    expect(device.user_id).toBeTruthy();
    expect(
      b.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE device_id IS NOT NULL').get(),
    ).toEqual({ n: 1 });
  });

  it('fails the same way for used, expired, wrong-kind and malformed codes', async () => {
    const { post } = await setup();
    const signin = CreateLinkResponse.parse((await post('/api/links', { kind: 'signin' })).json());
    const device = CreateLinkResponse.parse((await post('/api/links', { kind: 'device' })).json());
    const old = CreateLinkResponse.parse((await post('/api/links', { kind: 'signin' })).json());
    expect((await post('/api/links/redeem', { kind: 'l', code: signin.code }, '')).statusCode).toBe(
      200,
    );
    clock += 11 * 60_000;
    const answers = await Promise.all([
      post('/api/links/redeem', { kind: 'l', code: signin.code }, ''), // used
      post('/api/links/redeem', { kind: 'l', code: old.code }, ''), // expired
      post('/api/links/redeem', { kind: 'l', code: device.code }, ''), // wrong kind
      post('/api/links/redeem', { kind: 'd', code: 'short' }, ''), // malformed
      post('/api/links/redeem', { kind: 'x', code: device.code }, ''), // unknown kind
    ]);
    for (const a of answers) {
      expect([a.statusCode, a.body]).toEqual([400, '{"error":{"code":"link_invalid"}}']);
    }
  });

  it('drops unused links and device codes when the user signs out everywhere or changes the passphrase', async () => {
    const { b, cookie, post } = await setup();
    const before = CreateLinkResponse.parse((await post('/api/links', { kind: 'signin' })).json());
    const device = CreateLinkResponse.parse((await post('/api/links', { kind: 'device' })).json());
    expect((await post('/api/auth/logout-all', {})).statusCode).toBe(204);
    for (const [kind, code] of [
      ['l', before.code],
      ['d', device.code],
    ] as const) {
      const r = await post('/api/links/redeem', { kind, code }, '');
      expect([r.statusCode, r.body]).toEqual([400, '{"error":{"code":"link_invalid"}}']);
    }

    // The same after a passphrase change (with a fresh session, since logout-all ended ours).
    const login = await post(
      '/api/auth/login',
      { username: 'boss', password: 'blue tractor sings loudly' },
      '',
    );
    const fresh = setCookies(login.headers['set-cookie']).join('; ');
    const link = CreateLinkResponse.parse(
      (await post('/api/links', { kind: 'signin' }, fresh)).json(),
    );
    const changed = await post(
      '/api/auth/password',
      { currentPassword: 'blue tractor sings loudly', newPassword: 'green lantern hums softly' },
      fresh,
    );
    expect(changed.statusCode).toBe(204);
    const r = await post('/api/links/redeem', { kind: 'l', code: link.code }, '');
    expect(r.statusCode).toBe(400);
    expect(
      b.db.prepare('SELECT COUNT(*) AS n FROM link_codes WHERE used_at IS NULL').get(),
    ).toEqual({ n: 0 });
    expect(cookie).not.toBe('');
  });

  it('can be redeemed only once, also concurrently', async () => {
    const { post } = await setup();
    const link = CreateLinkResponse.parse((await post('/api/links', { kind: 'signin' })).json());
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post('/api/links/redeem', { kind: 'l', code: link.code }, ''),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it('never stores the data key unwrapped', async () => {
    const { b, cookie, post } = await setup();
    const user = b.auth.resolveSession(cookie.split('=')[1] ?? '');
    if (!user) throw new Error('no session');
    const dek = Buffer.from(user.dek);
    await post('/api/links', { kind: 'signin' });
    const tables = b.db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    for (const { name } of tables) {
      for (const row of b.db.prepare(`SELECT * FROM "${name}"`).all() as Record<
        string,
        unknown
      >[]) {
        for (const v of Object.values(row)) {
          if (Buffer.isBuffer(v)) expect(v.includes(dek)).toBe(false);
        }
      }
    }
    // After redeeming, the wrapped key is gone too.
    const link = b.db.prepare("SELECT wrapped_dek FROM link_codes WHERE kind = 'signin'").get() as {
      wrapped_dek: Buffer | null;
    };
    expect(link.wrapped_dek).not.toBeNull();
  });

  it('needs the passphrase when the session is older than 15 minutes, and keeps 3 unused links', async () => {
    const { b, post } = await setup();
    clock += 16 * 60_000;
    expect((await post('/api/links', { kind: 'signin' })).statusCode).toBe(401);
    expect(
      (await post('/api/links', { kind: 'signin', password: 'wrong wrong wrong' })).statusCode,
    ).toBe(401);
    for (let i = 0; i < 4; i++) {
      expect(
        (await post('/api/links', { kind: 'signin', password: 'blue tractor sings loudly' }))
          .statusCode,
      ).toBe(201);
    }
    expect(
      b.db
        .prepare("SELECT COUNT(*) AS n FROM link_codes WHERE kind = 'signin' AND used_at IS NULL")
        .get(),
    ).toEqual({ n: 3 });
  });
});

describe('sessions from sign-in links (security review 2026-11-07)', () => {
  async function linkedDevice(post: Awaited<ReturnType<typeof setup>>['post']) {
    const link = CreateLinkResponse.parse((await post('/api/links', { kind: 'signin' })).json());
    const redeemed = await post('/api/links/redeem', { kind: 'l', code: link.code }, '');
    return setCookies(redeemed.headers['set-cookie']).join('; ');
  }

  it('needs the passphrase to make more links, even right after signing in with one', async () => {
    const { post } = await setup();
    const cookies = await linkedDevice(post);
    expect((await post('/api/links', { kind: 'signin' }, cookies)).statusCode).toBe(401);
    expect(
      (await post('/api/links', { kind: 'signin', password: 'blue tractor sings loudly' }, cookies))
        .statusCode,
    ).toBe(201);
  });

  it("ends the previous owner's sessions when a device code moves their device", async () => {
    const { b, post } = await setup();
    const cookies = await linkedDevice(post);
    const deviceCookie = cookies.split('; ').find((c) => c.startsWith('hemmia_device=')) ?? '';
    const invite = b.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    await post(
      '/api/auth/invite/accept',
      { code: invite.code, username: 'ben', password: 'blue tractor sings loudly' },
      '',
    );
    const ben = b.db.prepare("SELECT id FROM users WHERE username = 'ben'").get() as { id: string };
    const code = CreateLinkResponse.parse(
      (await post('/api/links', { kind: 'device', userId: ben.id })).json(),
    ).code;

    const device = b.db
      .prepare('SELECT d.id FROM devices d JOIN sessions s ON s.device_id = d.id')
      .get() as { id: string };
    const redeemed = await post('/api/links/redeem', { kind: 'd', code }, deviceCookie);
    expect(redeemed.statusCode).toBe(200);
    expect(b.db.prepare('SELECT user_id FROM devices WHERE id = ?').get(device.id)).toEqual({
      user_id: ben.id,
    });
    expect(
      b.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE device_id = ?').get(device.id),
    ).toEqual({ n: 0 });
    // The old session cookie no longer works.
    const me = await b.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { host: 'homehub.example.ts.net', cookie: cookies },
    });
    expect(me.statusCode).toBe(401);
  });
});

describe('passphrase checks for lasting access (security review 2026-11-08)', () => {
  it('asks for the passphrase for an admin invite unless the session is fresh from it', async () => {
    const { post } = await setup();
    expect((await post('/api/admin/invites', { role: 'admin' })).statusCode).toBe(201);
    clock += 16 * 60_000;
    expect((await post('/api/admin/invites', { role: 'member' })).statusCode).toBe(201);
    expect((await post('/api/admin/invites', { role: 'admin' })).statusCode).toBe(401);
    expect(
      (await post('/api/admin/invites', { role: 'admin', password: 'wrong wrong wrong' }))
        .statusCode,
    ).toBe(401);
    expect(
      (await post('/api/admin/invites', { role: 'admin', password: 'blue tractor sings loudly' }))
        .statusCode,
    ).toBe(201);
  });

  it('never treats a sign-in link session as fresh for an admin invite', async () => {
    const { post } = await setup();
    const link = CreateLinkResponse.parse((await post('/api/links', { kind: 'signin' })).json());
    const redeemed = await post('/api/links/redeem', { kind: 'l', code: link.code }, '');
    const cookies = setCookies(redeemed.headers['set-cookie']).join('; ');
    expect((await post('/api/admin/invites', { role: 'admin' }, cookies)).statusCode).toBe(401);
  });

  it('lets the person sign in on their own device while their username is capped elsewhere', async () => {
    const { b, post } = await setup();
    const code = CreateLinkResponse.parse(
      (await post('/api/links', { kind: 'device' })).json(),
    ).code;
    const paired = await post('/api/links/redeem', { kind: 'd', code }, '');
    const device = setCookies(paired.headers['set-cookie']).find((c) =>
      c.startsWith('hemmia_device='),
    );
    const login = (password: string, ip: string, cookies = '') =>
      b.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: ip,
        headers: {
          origin: ORIGIN,
          host: 'homehub.example.ts.net',
          'content-type': 'application/json',
          ...(cookies ? { cookie: cookies } : {}),
        },
        payload: JSON.stringify({ username: 'boss', password }),
      });
    for (let i = 0; i < 30; i++) {
      expect((await login('wrong wrong wrong', `10.9.${String(i)}.1`)).statusCode).toBe(401);
    }
    expect((await login('blue tractor sings loudly', '10.9.200.1')).statusCode).toBe(429);
    expect((await login('blue tractor sings loudly', '10.9.200.1', device ?? '')).statusCode).toBe(
      200,
    );
  });
});

describe('device codes and invites', () => {
  it('pairs a device for an existing user, who then signs in', async () => {
    const { b, post } = await setup();
    const link = CreateLinkResponse.parse((await post('/api/links', { kind: 'device' })).json());
    expect(link.expiresAt).toBe(clock + 24 * 60 * 60_000);
    const res = await post('/api/links/redeem', { kind: 'd', code: link.code }, '');
    expect(RedeemLinkResponse.parse(res.json())).toEqual({ next: 'login' });
    expect(setCookies(res.headers['set-cookie']).some((c) => c.startsWith('hemmia_session='))).toBe(
      false,
    );
    expect(
      b.db.prepare('SELECT COUNT(*) AS n FROM devices WHERE user_id IS NOT NULL').get(),
    ).toEqual({ n: 1 });
  });

  it('lets only admins create device codes for others', async () => {
    const { b, post } = await setup();
    const invite = b.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    const member = await post(
      '/api/auth/invite/accept',
      {
        code: invite.code,
        username: 'ben',
        password: 'blue tractor sings loudly',
      },
      '',
    );
    const memberCookie = String(member.headers['set-cookie']).split(';')[0] ?? '';
    const ben = b.db.prepare("SELECT id FROM users WHERE username = 'ben'").get() as { id: string };
    const boss = b.db.prepare("SELECT id FROM users WHERE username = 'boss'").get() as {
      id: string;
    };
    expect((await post('/api/links', { kind: 'device', userId: ben.id })).statusCode).toBe(201);
    expect(
      (await post('/api/links', { kind: 'device', userId: boss.id }, memberCookie)).statusCode,
    ).toBe(403);
  });

  it('pairs a device with an invite without using the invite up, and returns invite links', async () => {
    const { b, cookie, post } = await setup();
    const created = await post('/api/admin/invites', { role: 'member', restricted: false }, cookie);
    const invite = CreateInviteResponse.parse(created.json());
    const code = invite.link.split('#')[1] ?? '';
    expect(invite.directLink).toBe(`https://homehub.example.ts.net/join#i~${code}`);
    expect(invite.shareLink).toBeNull();
    const res = await post('/api/links/redeem', { kind: 'i', code }, '');
    expect(RedeemLinkResponse.parse(res.json())).toEqual({ next: 'invite' });
    expect(b.auth.inviteUsable(code)).toBe(true);
  });
});
