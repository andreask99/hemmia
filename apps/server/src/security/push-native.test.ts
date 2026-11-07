import { describe, expect, it } from 'vitest';
import { AccountResponse } from '@hemmia/shared';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import { createPush } from './push.ts';
import { createPushRefs } from './pushref.ts';

const ORIGIN = 'http://localhost:5173';
const TOKEN = 'ab'.repeat(32);

function fakeRelay(sendAnswer: 'ok' | 'gone' = 'ok') {
  const calls: { op: string; body: unknown }[] = [];
  let n = 0;
  return {
    calls,
    client: {
      pushHandle: (body: unknown) => {
        calls.push({ op: 'handle', body });
        n++;
        return Promise.resolve(`h${String(n)}`.padEnd(43, 'x'));
      },
      deletePushHandle: (h: string) => {
        calls.push({ op: 'delete', body: h });
        return Promise.resolve();
      },
      pushSend: (body: unknown) => {
        calls.push({ op: 'send', body });
        return Promise.resolve(sendAnswer);
      },
    },
  };
}

async function withUser() {
  const built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
  });
  const invite = built.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
  const res = await built.app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({
      code: invite.code,
      username: 'anna',
      password: 'blue tractor sings loudly',
    }),
  });
  AccountResponse.parse(res.json());
  const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
  if (!session) throw new Error('no session');
  return { built, cookie, session };
}

describe('native push', () => {
  it('registers a token at the relay and sends content-free notifications with an opaque ref', async () => {
    const { built, session } = await withUser();
    const relay = fakeRelay();
    const refs = createPushRefs(built.db);
    const push = createPush({
      db: built.db,
      subject: 'https://example.test',
      log: { info: () => undefined, warn: () => undefined },
      native: { client: () => relay.client, refs, appId: 'app.hemmia.ios' },
    });
    await push.subscribeNative(session, { platform: 'ios', token: TOKEN, env: 'sandbox' });
    expect(relay.calls[0]).toEqual({
      op: 'handle',
      body: { platform: 'ios', token: TOKEN, env: 'sandbox', appId: 'app.hemmia.ios' },
    });
    const stored = built.db.prepare('SELECT kind, relay_handle FROM push_subscriptions').all();
    expect(stored).toEqual([
      { kind: 'native', relay_handle: expect.stringMatching(/^h1/) as string },
    ]);
    await push.notify(session.userId, { kind: 'reply', chatId: 'chat-123', lang: 'en' });
    const send = relay.calls.find((c) => c.op === 'send')?.body as { kind: string; ref: string };
    expect(send.kind).toBe('reply');
    expect(send.ref).not.toContain('chat-123');
    expect(refs.decryptRef(send.ref)).toBe('chat-123');
    await push.notify(session.userId, { kind: 'maintenance', chatId: '', lang: 'en', ok: false });
    expect((relay.calls.at(-1)?.body as { kind: string }).kind).toBe('maintenance_failed');
    // A new token for the same session replaces the old handle.
    await push.subscribeNative(session, { platform: 'ios', token: TOKEN, env: 'sandbox' });
    expect(relay.calls.filter((c) => c.op === 'delete')).toHaveLength(1);
    expect(built.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()).toEqual({
      n: 1,
    });
    await built.app.close();
  });

  it('deletes the subscription when the relay says the token is gone, and needs remote access', async () => {
    const { built, session } = await withUser();
    const relay = fakeRelay('gone');
    const push = createPush({
      db: built.db,
      subject: 'https://example.test',
      log: { info: () => undefined, warn: () => undefined },
      native: { client: () => relay.client, refs: createPushRefs(built.db), appId: 'a.b' },
    });
    await push.subscribeNative(session, { platform: 'android', token: 'fcm:token' });
    await push.notify(session.userId, { kind: 'daily', chatId: 'c', lang: 'de' });
    expect(built.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()).toEqual({
      n: 0,
    });
    const off = createPush({
      db: built.db,
      subject: 'https://example.test',
      log: { info: () => undefined, warn: () => undefined },
      native: { client: () => null, refs: createPushRefs(built.db), appId: 'a.b' },
    });
    await expect(
      off.subscribeNative(session, { platform: 'android', token: 'x' }),
    ).rejects.toThrow();
    await built.app.close();
  });

  it("resolves a ref only to the user's own chat", async () => {
    const { built, cookie, session } = await withUser();
    const chat = createChatRepo(built.db).createChat(session, 'quick');
    const refs = createPushRefs(built.db);
    const resolve = (ref: string, c = cookie) =>
      built.app.inject({
        method: 'POST',
        url: '/api/push/resolve',
        headers: { origin: ORIGIN, cookie: c, 'content-type': 'application/json' },
        payload: JSON.stringify({ ref }),
      });
    expect((await resolve(refs.encryptRef(chat.id))).json()).toEqual({ path: `/chats/${chat.id}` });
    expect((await resolve(refs.encryptRef(''))).json()).toEqual({ path: '/' });
    expect((await resolve('A'.repeat(60))).statusCode).toBe(404);
    // Another user's chat: 404.
    const invite = built.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    const ben = await built.app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({
        code: invite.code,
        username: 'ben',
        password: 'blue tractor sings loudly',
      }),
    });
    const benCookie = String(ben.headers['set-cookie']).split(';')[0] ?? '';
    expect((await resolve(refs.encryptRef(chat.id), benCookie)).statusCode).toBe(404);
    // No relay configured: native subscribe answers 409.
    const sub = await built.app.inject({
      method: 'POST',
      url: '/api/push/native',
      headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ platform: 'android', token: 'tok' }),
    });
    expect(sub.statusCode).toBe(409);
    await built.app.close();
  });
});
