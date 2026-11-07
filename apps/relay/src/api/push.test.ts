import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PushHandleResponse, signRequest } from '@hemmia/relay-protocol';
import { openDb, type RelayDb } from '../db.ts';
import { createFakeSender, type SendResult } from '../push/sender.ts';
import { newHubKey, registerInDb } from '../../test/fakehub.ts';
import { apiRequest, DOMAIN, silent } from '../../test/helpers.ts';
import { pushRoutes } from './push.ts';
import { createApiHandler } from './server.ts';

const TOKEN = 'ab'.repeat(32);
let db: RelayDb;
let server: http.Server;
let port = 0;
let clock = Date.now();
let answer: SendResult = 'ok';
let fake: ReturnType<typeof createFakeSender>;

beforeEach(async () => {
  db = openDb(':memory:');
  answer = 'ok';
  fake = createFakeSender(() => answer);
  const routes = pushRoutes({
    db,
    relayDomain: DOMAIN,
    dataKey: randomBytes(32),
    appId: 'app.hemmia.ios',
    sender: fake.sender,
    log: silent,
    now: () => clock,
  });
  server = http.createServer(
    createApiHandler({ db, relayDomain: DOMAIN, log: silent, routes, now: () => clock }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  await new Promise<void>((r) =>
    server.close(() => {
      r();
    }),
  );
});

function hub() {
  const h = newHubKey();
  registerInDb(db, h);
  const call = (method: string, path: string, body?: unknown) => {
    clock += 1000;
    const raw = body === undefined ? '' : JSON.stringify(body);
    return apiRequest(port, method, path, {
      headers: signRequest({
        privateKey: h.key,
        hubId: h.hubId,
        method,
        pathWithQuery: path,
        relayDomain: DOMAIN,
        time: Math.floor(clock / 1000),
        body: Buffer.from(raw),
      }),
      ...(raw ? { body: raw } : {}),
    });
  };
  return { ...h, call };
}

const ios = { platform: 'ios', token: TOKEN, env: 'sandbox', appId: 'app.hemmia.ios' };

describe('push handles', () => {
  it('registers a token as an opaque handle, stored encrypted', async () => {
    const h = hub();
    const res = await h.call('POST', '/v1/push/handles', ios);
    expect(res.status).toBe(201);
    const { handle } = PushHandleResponse.parse(res.body);
    const row = db.prepare('SELECT token, env FROM push_handles').get() as {
      token: Buffer;
      env: string;
    };
    expect(row.env).toBe('sandbox');
    expect(row.token.includes(Buffer.from(TOKEN))).toBe(false);
    expect(row.token.includes(Buffer.from(handle))).toBe(false);
  });

  it('refuses another app and more than 50 handles', async () => {
    const h = hub();
    expect(await h.call('POST', '/v1/push/handles', { ...ios, appId: 'evil.app' })).toMatchObject({
      status: 400,
      body: { error: { code: 'bad_app' } },
    });
    for (let i = 0; i < 50; i++)
      expect((await h.call('POST', '/v1/push/handles', ios)).status).toBe(201);
    expect((await h.call('POST', '/v1/push/handles', ios)).status).toBe(409);
  });
});

describe('push send', () => {
  it('delivers kind, ref and the hub host to the provider', async () => {
    const h = hub();
    const { handle } = PushHandleResponse.parse(
      (await h.call('POST', '/v1/push/handles', ios)).body,
    );
    const res = await h.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'abc' });
    expect(res.status).toBe(202);
    expect(fake.sent).toEqual([
      {
        platform: 'ios',
        env: 'sandbox',
        token: TOKEN,
        message: { kind: 'reply', ref: 'abc', hubHost: `${h.hubId}.h.${DOMAIN}`, hubId: h.hubId },
      },
    ]);
  });

  it("can't send to another hub's handle", async () => {
    const a = hub();
    const b = hub();
    const { handle } = PushHandleResponse.parse(
      (await a.call('POST', '/v1/push/handles', ios)).body,
    );
    expect(
      await b.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'x' }),
    ).toMatchObject({
      status: 404,
      body: { error: { code: 'unknown_handle' } },
    });
    expect(fake.sent).toEqual([]);
  });

  it('forgets handles whose token is gone', async () => {
    const h = hub();
    const { handle } = PushHandleResponse.parse(
      (await h.call('POST', '/v1/push/handles', ios)).body,
    );
    answer = 'gone';
    expect(
      (await h.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'x' })).status,
    ).toBe(410);
    expect(
      (await h.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'x' })).status,
    ).toBe(404);
  });

  it('reports provider errors and limits sends per handle', async () => {
    const h = hub();
    const { handle } = PushHandleResponse.parse(
      (await h.call('POST', '/v1/push/handles', ios)).body,
    );
    answer = 'error';
    expect(
      (await h.call('POST', '/v1/push/send', { handle, kind: 'daily', ref: 'x' })).status,
    ).toBe(502);
    answer = 'ok';
    const start = clock;
    for (let i = 0; i < 59; i++) {
      expect(
        (await h.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'x' })).status,
      ).toBe(202);
    }
    expect(
      (await h.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'x' })).status,
    ).toBe(429);
    clock = start + 61 * 60_000;
    expect(
      (await h.call('POST', '/v1/push/send', { handle, kind: 'reply', ref: 'x' })).status,
    ).toBe(202);
  });

  it('deletes a handle', async () => {
    const h = hub();
    const { handle } = PushHandleResponse.parse(
      (await h.call('POST', '/v1/push/handles', ios)).body,
    );
    expect((await h.call('DELETE', `/v1/push/handles/${handle}`)).status).toBe(204);
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_handles').get()).toEqual({ n: 0 });
  });
});
