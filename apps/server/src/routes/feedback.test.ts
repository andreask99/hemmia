import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';

const ORIGIN = 'http://localhost:5173';
let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

async function setup(relay: string | null, answer = 204) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: JSON.parse(init?.body ?? 'null') as unknown });
    return new Response(null, { status: answer });
  });
  const built = await buildApp(
    loadConfig({
      NODE_ENV: 'test',
      HEMMIA_PUBLIC_HOSTNAMES: 'kchat.tail1234.ts.net',
      ...(relay ? { HEMMIA_RELAY_DOMAIN: relay } : {}),
    }),
    {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      feedbackFetch: fetchFn as unknown as typeof fetch,
    },
  );
  app = built.app;
  const invite = built.auth.createInvite({ role: 'admin', restricted: false, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({
      code: invite.code,
      username: 'anna',
      password: 'blue tractor sings loudly',
    }),
  });
  const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  const send = (body: unknown, withCookie = true) =>
    app.inject({
      method: 'POST',
      url: '/api/feedback',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        ...(withCookie ? { cookie } : {}),
      },
      payload: JSON.stringify(body),
    });
  return { calls, send };
}

describe('feedback from the hub', () => {
  it('forwards to the relay with the version and language, nothing about the account', async () => {
    const s = await setup('relay.test');
    const res = await s.send({
      message: 'Where do models go?',
      email: 'a@example.com',
      page: 'settings/system',
    });
    expect(res.statusCode).toBe(204);
    expect(s.calls[0]?.url).toBe('https://api.relay.test/v1/feedback');
    const body = s.calls[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      message: 'Where do models go?',
      email: 'a@example.com',
      source: 'hub',
      lang: 'en',
      page: 'settings/system',
    });
    expect(Object.keys(body).sort()).toEqual([
      'email',
      'lang',
      'message',
      'page',
      'source',
      'version',
    ]);
    expect(JSON.stringify(body)).not.toContain('anna');
  });

  it('needs a signed-in user, a relay and a message, and says when the relay fails', async () => {
    expect((await (await setup('relay.test')).send({ message: 'hi' }, false)).statusCode).toBe(401);
    await app.close();
    expect((await (await setup(null)).send({ message: 'hi' })).statusCode).toBe(503);
    await app.close();
    const s = await setup('relay.test', 500);
    expect((await s.send({ message: '' })).statusCode).toBe(400);
    expect((await s.send({ message: 'hi' })).statusCode).toBe(502);
  });
});
