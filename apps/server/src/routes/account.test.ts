import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AdminInviteListResponse,
  AdminUserListResponse,
  CreateInviteResponse,
  MeResponse,
  SessionListResponse,
} from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';

const ORIGIN = 'http://localhost:5173';
let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  built = await buildApp(
    loadConfig({ NODE_ENV: 'test', HEMMIA_PUBLIC_HOSTNAMES: 'kchat.tail1234.ts.net' }),
    { db: openDatabase(':memory:'), kdfParams: { m: 1024, t: 1, p: 1 } },
  );
  app = built.app;
});

afterEach(async () => {
  await app.close();
});

async function signUp(username: string, role: 'admin' | 'member' = 'member') {
  const invite = built.auth.createInvite({ role, restricted: false, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

async function login(username: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (iPhone) Safari/605.1',
    },
    payload: JSON.stringify({ username, password: 'blue tractor sings loudly' }),
  });
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

const send = (
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  url: string,
  cookie: string,
  body?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: {
      origin: ORIGIN,
      cookie,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
  });

describe('sessions', () => {
  it("lists own sessions and ends one, but not other users' sessions", async () => {
    const first = await signUp('anna');
    const phone = await login('anna');
    const list = SessionListResponse.parse((await send('GET', '/api/me/sessions', first)).json());
    expect(list.sessions).toHaveLength(2);
    expect(list.sessions.filter((s) => s.current)).toHaveLength(1);
    expect(list.sessions.some((s) => s.deviceLabel === 'iPhone · Safari')).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/token|dek|wrapped/i);

    const ben = await signUp('ben');
    const phoneId = list.sessions.find((s) => !s.current)?.id ?? '';
    expect((await send('DELETE', `/api/me/sessions/${phoneId}`, ben)).statusCode).toBe(404);
    expect((await send('GET', '/api/me', phone)).statusCode).toBe(200);
    expect((await send('DELETE', `/api/me/sessions/${phoneId}`, first)).statusCode).toBe(204);
    expect((await send('GET', '/api/me', phone)).statusCode).toBe(401);
  });
});

describe('preferences', () => {
  it('updates language and default model', async () => {
    const anna = await signUp('anna');
    const res = await send('PATCH', '/api/me', anna, { language: 'de', defaultModelId: 'quick' });
    expect(MeResponse.parse(res.json())).toMatchObject({ language: 'de', defaultModelId: 'quick' });
    const me = MeResponse.parse((await send('GET', '/api/me', anna)).json());
    expect(me.language).toBe('de');
    expect((await send('PATCH', '/api/me', anna, { language: 'fr' })).statusCode).toBe(400);
  });
});

describe('admin', () => {
  it('is forbidden for members', async () => {
    const member = await signUp('anna');
    expect((await send('GET', '/api/admin/users', member)).statusCode).toBe(403);
    expect((await send('POST', '/api/admin/invites', member, {})).statusCode).toBe(403);
    expect((await send('PATCH', '/api/admin/users/x', member, { disabled: true })).statusCode).toBe(
      403,
    );
  });

  it('creates invite links, lists users, disables and restricts', async () => {
    const boss = await signUp('boss', 'admin');
    const invite = CreateInviteResponse.parse(
      (await send('POST', '/api/admin/invites', boss, { restricted: true })).json(),
    );
    expect(invite.link).toMatch(/^https:\/\/kchat\.tail1234\.ts\.net\/invite#[A-Za-z0-9_-]{43}$/);

    const anna = await signUp('anna');
    const users = AdminUserListResponse.parse(
      (await send('GET', '/api/admin/users', boss)).json(),
    ).users;
    expect(users.map((u) => u.username)).toEqual(['anna', 'boss']);
    expect(JSON.stringify(users)).not.toMatch(/hash|salt|wrapped|dek/i);
    const annaId = users.find((u) => u.username === 'anna')?.id ?? '';

    expect(
      (await send('PATCH', `/api/admin/users/${annaId}`, boss, { restricted: true })).statusCode,
    ).toBe(204);
    expect(MeResponse.parse((await send('GET', '/api/me', anna)).json()).restricted).toBe(true);
    expect(
      (await send('PATCH', `/api/admin/users/${annaId}`, boss, { disabled: true })).statusCode,
    ).toBe(204);
    expect((await send('GET', '/api/me', anna)).statusCode).toBe(401);
  });

  it('lists open invites and withdraws one (security review 2026-11-07)', async () => {
    const boss = await signUp('boss', 'admin');
    const created = CreateInviteResponse.parse(
      (await send('POST', '/api/admin/invites', boss, { role: 'admin' })).json(),
    );
    const listed = AdminInviteListResponse.parse(
      (await send('GET', '/api/admin/invites', boss)).json(),
    ).invites;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ role: 'admin', restricted: false, createdBy: 'boss' });
    expect(JSON.stringify(listed)).not.toMatch(/code|hash/i);

    const id = listed[0]?.id ?? '';
    expect((await send('DELETE', `/api/admin/invites/${id}`, boss)).statusCode).toBe(204);
    expect((await send('DELETE', `/api/admin/invites/${id}`, boss)).statusCode).toBe(404);
    expect(
      AdminInviteListResponse.parse((await send('GET', '/api/admin/invites', boss)).json()).invites,
    ).toEqual([]);
    // The withdrawn link no longer works.
    const code = created.link.split('#')[1] ?? '';
    const accept = await send('POST', '/api/auth/invite/accept', '', {
      code,
      username: 'mallory',
      password: 'blue tractor sings loudly',
    });
    expect(accept.statusCode).toBeGreaterThanOrEqual(400);

    const member = await signUp('anna');
    expect((await send('GET', '/api/admin/invites', member)).statusCode).toBe(403);
    expect((await send('DELETE', `/api/admin/invites/${id}`, member)).statusCode).toBe(403);
  });

  it("won't let an admin disable themselves", async () => {
    const boss = await signUp('boss', 'admin');
    const me = MeResponse.parse((await send('GET', '/api/me', boss)).json());
    expect(
      (await send('PATCH', `/api/admin/users/${me.id}`, boss, { disabled: true })).statusCode,
    ).toBe(400);
  });
});
