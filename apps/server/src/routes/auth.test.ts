import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { AccountResponse, ErrorResponse, MeResponse } from '@hemmia/shared';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import type { Auth } from '../security/auth.ts';

const PASSWORD = 'blue tractor sings loudly';
const ORIGIN = 'http://localhost:5173';

let app: FastifyInstance;
let auth: Auth;
let clock: number;

async function setup(env: Record<string, string> = {}) {
  clock = Date.UTC(2026, 9, 1);
  const config = loadConfig({
    NODE_ENV: 'test',
    HEMMIA_PUBLIC_HOSTNAMES: 'kchat.tail1234.ts.net',
    ...env,
  });
  const built = await buildApp(config, {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    now: () => clock,
  });
  app = built.app;
  auth = built.auth;
}

beforeEach(async () => {
  await setup();
});

afterEach(async () => {
  await app.close();
});

function post(url: string, body: unknown, extra: Partial<InjectOptions> = {}) {
  return app.inject({
    method: 'POST',
    url,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...(extra.headers ?? {}) },
    payload: JSON.stringify(body),
    ...(extra.remoteAddress ? { remoteAddress: extra.remoteAddress } : {}),
  });
}

function sessionCookie(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) throw new Error('no cookie');
  return first.split(';')[0] ?? '';
}

async function signUp(username = 'anna') {
  const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
  const res = await post('/api/auth/invite/accept', {
    code: invite.code,
    username,
    password: PASSWORD,
  });
  expect(res.statusCode).toBe(200);
  return { res, cookie: sessionCookie(res), body: AccountResponse.parse(res.json()) };
}

function errorCode(res: LightMyRequestResponse): string {
  return ErrorResponse.parse(res.json()).error.code;
}

describe('request checks', () => {
  it('rejects unknown Host headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'evil.example' },
    });
    expect(res.statusCode).toBe(421);
  });

  it('accepts localhost and the tailnet name', async () => {
    for (const host of [
      'localhost:8787',
      '127.0.0.1:8787',
      'kchat.tail1234.ts.net',
      'KCHAT.tail1234.ts.net',
    ]) {
      const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host } });
      expect(res.statusCode).toBe(200);
    }
  });

  it('requires a matching Origin on state-changing requests', async () => {
    const body = JSON.stringify({ username: 'anna', password: 'x' });
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expect(noOrigin.statusCode).toBe(403);
    for (const origin of ['https://evil.example', 'http://kchat.tail1234.ts.net', 'null']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json', origin },
        payload: body,
      });
      expect(res.statusCode).toBe(403);
    }
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json', origin: 'https://kchat.tail1234.ts.net' },
      payload: body,
    });
    expect(ok.statusCode).toBe(401);
  });

  it('rejects cross-site fetch metadata', async () => {
    const res = await post(
      '/api/auth/login',
      { username: 'anna', password: 'x' },
      {
        headers: { 'sec-fetch-site': 'cross-site' },
      },
    );
    expect(res.statusCode).toBe(403);
  });

  it('accepts only JSON bodies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'content-type': 'text/plain' },
      payload: 'username=anna&password=x',
    });
    expect(res.statusCode).toBe(415);
  });

  it('does not echo malformed input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{"username": "secret-marker-123", oops',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('secret-marker-123');
    expect(errorCode(res)).toBe('bad_request');
  });

  it('rejects oversized bodies', async () => {
    const res = await post('/api/auth/login', { username: 'anna', password: 'x'.repeat(300_000) });
    expect(res.statusCode).toBe(413);
  });

  it('sets security headers and no-store on API responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('not_found');
  });
});

describe('auth flow', () => {
  it('accepts an invite, signs in, reads /me, signs out', async () => {
    const { cookie, body } = await signUp();
    expect(body.me.username).toBe('anna');
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(MeResponse.parse(me.json()).username).toBe('anna');

    const out = await post('/api/auth/logout', {}, { headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('sets a strict, http-only cookie', async () => {
    const { res } = await signUp();
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/^hemmia_session=[A-Za-z0-9_-]{43};/);
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/');
  });

  it('accepts a session cookie from before the rename and moves it to the new name', async () => {
    const { res } = await signUp();
    const token = /hemmia_session=([A-Za-z0-9_-]{43})/.exec(String(res.headers['set-cookie']))?.[1];
    expect(token).toBeDefined();
    const old = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `kchat_session=${token ?? ''}` },
    });
    expect(old.statusCode).toBe(200);
    const set = String(old.headers['set-cookie']);
    expect(set).toContain(`hemmia_session=${token ?? ''};`);
    expect(set).toMatch(/kchat_session=; [^,]*Max-Age=0/);
    // The new name wins over the old one.
    const both = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `hemmia_session=${'A'.repeat(43)}; kchat_session=${token ?? ''}` },
    });
    expect(both.statusCode).toBe(401);
    // Logout clears both names.
    const out = await post(
      '/api/auth/logout',
      {},
      { headers: { cookie: `hemmia_session=${token ?? ''}` } },
    );
    expect(String(out.headers['set-cookie'])).toMatch(/hemmia_session=;.*kchat_session=;/);
  });

  it('uses a __Host- Secure cookie in production', async () => {
    await app.close();
    await setup({ NODE_ENV: 'production', HEMMIA_LOG_LEVEL: 'silent' });
    const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    const res = await post(
      '/api/auth/invite/accept',
      { code: invite.code, username: 'anna', password: PASSWORD },
      { headers: { host: 'kchat.tail1234.ts.net', origin: 'https://kchat.tail1234.ts.net' } },
    );
    expect(res.statusCode).toBe(200);
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/^__Host-hemmia_session=/);
    expect(raw).toContain('Secure');
  });

  it('uses a plain cookie in production on http://localhost, which Safari would drop if Secure', async () => {
    await app.close();
    await setup({ NODE_ENV: 'production', HEMMIA_LOG_LEVEL: 'silent' });
    const { res, cookie } = await signUp();
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/^hemmia_session=/);
    expect(raw).not.toContain('Secure');
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { host: 'localhost:8787', cookie },
    });
    expect(me.statusCode).toBe(200);
    // The plain cookie doesn't count on the hub's https name.
    const remote = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { host: 'kchat.tail1234.ts.net', cookie },
    });
    expect(remote.statusCode).toBe(401);
  });

  it('gives identical responses for wrong password and unknown user', async () => {
    await signUp();
    const wrong = await post('/api/auth/login', { username: 'anna', password: 'wrong password!!' });
    const unknown = await post('/api/auth/login', {
      username: 'nobody',
      password: 'wrong password!!',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);
  });

  it('rate-limits failed logins per username and network, then allows again later', async () => {
    await signUp();
    for (let i = 0; i < 5; i++) {
      const r = await post(
        '/api/auth/login',
        { username: 'anna', password: 'wrong password!!' },
        { remoteAddress: '10.0.0.1' },
      );
      expect(r.statusCode).toBe(401);
    }
    const blocked = await post(
      '/api/auth/login',
      { username: 'anna', password: PASSWORD },
      { remoteAddress: '10.0.0.1' },
    );
    expect(blocked.statusCode).toBe(429);
    expect(errorCode(blocked)).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Someone else's wrong guesses don't lock Anna out from her own network.
    const elsewhere = await post(
      '/api/auth/login',
      { username: 'anna', password: PASSWORD },
      { remoteAddress: '10.0.0.99' },
    );
    expect(elsewhere.statusCode).toBe(200);

    clock += 16 * 60_000;
    const ok = await post(
      '/api/auth/login',
      { username: 'anna', password: PASSWORD },
      { remoteAddress: '10.0.0.1' },
    );
    expect(ok.statusCode).toBe(200);
  });

  it('caps guesses for one username across many networks', async () => {
    await signUp();
    for (let i = 0; i < 30; i++) {
      const r = await post(
        '/api/auth/login',
        { username: 'anna', password: 'wrong password!!' },
        { remoteAddress: `10.0.${String(i)}.1` },
      );
      expect(r.statusCode).toBe(401);
    }
    const blocked = await post(
      '/api/auth/login',
      { username: 'anna', password: PASSWORD },
      { remoteAddress: '10.0.200.1' },
    );
    expect(blocked.statusCode).toBe(429);
  });

  it('counts parallel login attempts before checking the passphrase', async () => {
    await signUp();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        post(
          '/api/auth/login',
          { username: 'anna', password: 'wrong password!!' },
          { remoteAddress: '10.0.0.7' },
        ),
      ),
    );
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(3);
  });

  it('rate-limits per client address behind Tailscale serve', async () => {
    let n = 0;
    const attempt = (xff: string) =>
      post(
        '/api/auth/login',
        { username: `user${String(n++)}`, password: 'x' },
        { headers: { 'x-forwarded-for': xff } },
      );
    for (let i = 0; i < 20; i++) expect((await attempt('100.64.0.1')).statusCode).toBe(401);
    expect((await attempt('100.64.0.1')).statusCode).toBe(429);
    // Another family member's phone is unaffected.
    expect((await attempt('100.64.0.2')).statusCode).toBe(401);
  });

  it('change password ends other sessions', async () => {
    const { cookie } = await signUp();
    const other = sessionCookie(
      await post('/api/auth/login', { username: 'anna', password: PASSWORD }),
    );
    const res = await post(
      '/api/auth/password',
      {
        currentPassword: PASSWORD,
        newPassword: 'green bicycle dances twice',
      },
      { headers: { cookie } },
    );
    expect(res.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: other } })).statusCode,
    ).toBe(401);
  });

  it('logout-all ends every session', async () => {
    const { cookie } = await signUp();
    const other = sessionCookie(
      await post('/api/auth/login', { username: 'anna', password: PASSWORD }),
    );
    expect((await post('/api/auth/logout-all', {}, { headers: { cookie } })).statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: other } })).statusCode,
    ).toBe(401);
  });

  it('recovers with the recovery code', async () => {
    const { body } = await signUp();
    const res = await post('/api/auth/recover', {
      username: 'anna',
      recoveryCode: body.recoveryCode,
      newPassword: 'purple kettle whistles often',
    });
    expect(res.statusCode).toBe(200);
    expect(AccountResponse.parse(res.json()).recoveryCode).not.toBe(body.recoveryCode);
  });

  it('requires a session for /me and logout-all', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(401);
    expect((await post('/api/auth/logout-all', {})).statusCode).toBe(401);
    const bogus = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `hemmia_session=${'A'.repeat(43)}` },
    });
    expect(bogus.statusCode).toBe(401);
  });
});
