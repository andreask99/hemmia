import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccountResponse, PushKeyResponse, PushPayload } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';
import { decryptAsBrowser, fakeSubscription } from '../security/webpush-fixtures.ts';

const ORIGIN = 'http://localhost:5173';

const model: ResolvedChatModel = {
  id: 'quick',
  label: { en: 'Quick', de: 'Schnell' },
  engine: 'ollama',
  ollamaModel: 'tiny:1b',
  contextTokens: 4096,
  historyBudgetTokens: 2000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: false,
  vision: false,
  thinking: false,
};
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'quick' ? model : null),
  imageModel: () => null,
  defaultChatModelId: () => 'quick',
};

/** The reply waits for `release()` so a test can disconnect mid-reply. */
let release: () => void = () => undefined;
const llm: LlmClient = {
  async *chat(req): AsyncGenerator<ChatChunk> {
    yield { type: 'content', text: 'Hallo' };
    await new Promise<void>((resolve) => {
      release = resolve;
      req.signal.addEventListener('abort', () => {
        resolve();
      });
    });
    yield { type: 'content', text: ' Welt' };
    yield { type: 'done', promptTokens: 1, outputTokens: 2, loadMs: 0 };
  },
  loaded: () => Promise.resolve([{ model: 'tiny:1b', memoryGiB: 2 }]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;
let pushed: { url: string; headers: Record<string, string>; body: Buffer }[];
let pushStatus: number;

beforeEach(async () => {
  pushed = [];
  pushStatus = 201;
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
    pushFetch: (url, init) => {
      pushed.push({
        url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
        headers: init?.headers as Record<string, string>,
        body: Buffer.from(init?.body as Uint8Array),
      });
      return Promise.resolve(new Response(null, { status: pushStatus }));
    },
  });
  app = built.app;
});

afterEach(async () => {
  release();
  await app.close();
});

async function signUp(username: string) {
  const invite = built.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  const me = AccountResponse.parse(res.json()).me;
  const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
  if (!session) throw new Error('no session');
  const chat = createChatRepo(built.db).createChat(session, 'quick');
  return { cookie, userId: me.id, chatId: chat.id };
}

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie: string, body?: unknown) =>
  app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });

const subscriptions = () =>
  built.db.prepare('SELECT user_id FROM push_subscriptions').all() as { user_id: string }[];

describe('push subscriptions', () => {
  it('serves a stable public key to signed-in users only', async () => {
    const anna = await signUp('anna');
    const a = PushKeyResponse.parse((await call('GET', '/api/push/key', anna.cookie)).json());
    const b = PushKeyResponse.parse((await call('GET', '/api/push/key', anna.cookie)).json());
    expect(a.publicKey).toBe(b.publicKey);
    expect(Buffer.from(a.publicKey, 'base64url')).toHaveLength(65);
    expect((await call('GET', '/api/push/key', '')).statusCode).toBe(401);
  });

  it('accepts real push services only, with well-formed keys', async () => {
    const anna = await signUp('anna');
    const ok = fakeSubscription();
    expect((await call('POST', '/api/push/subscription', anna.cookie, ok.body)).statusCode).toBe(
      204,
    );
    const evil = fakeSubscription('https://attacker.example/collect');
    expect((await call('POST', '/api/push/subscription', anna.cookie, evil.body)).statusCode).toBe(
      400,
    );
    const badKey = { ...ok.body, keys: { ...ok.body.keys, p256dh: 'AAAA' } };
    expect((await call('POST', '/api/push/subscription', anna.cookie, badKey)).statusCode).toBe(
      400,
    );
    expect(subscriptions()).toHaveLength(1);
  });

  it('moves a device to whoever signs in on it last, and only removes your own', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const device = fakeSubscription();
    await call('POST', '/api/push/subscription', anna.cookie, device.body);
    await call('POST', '/api/push/subscription', ben.cookie, device.body);
    expect(subscriptions()).toEqual([{ user_id: ben.userId }]);
    await call('DELETE', '/api/push/subscription', anna.cookie, { endpoint: device.body.endpoint });
    expect(subscriptions()).toHaveLength(1);
    await call('DELETE', '/api/push/subscription', ben.cookie, { endpoint: device.body.endpoint });
    expect(subscriptions()).toHaveLength(0);
  });

  it('stops when the session ends (sign out)', async () => {
    const anna = await signUp('anna');
    await call('POST', '/api/push/subscription', anna.cookie, fakeSubscription().body);
    await call('POST', '/api/auth/logout', anna.cookie, {});
    expect(subscriptions()).toHaveLength(0);
  });
});

describe('replies after the app went away', () => {
  async function startReply(cookie: string, chatId: string) {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const res = await fetch(`${address}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { origin: ORIGIN, host: 'localhost', cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Hi' }),
      signal: controller.signal,
    });
    const reader = res.body?.getReader();
    await reader?.read(); // "started" has arrived
    return () => {
      controller.abort();
    };
  }

  async function waitFor(check: () => boolean) {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  }

  it('keep running, are saved, and notify the devices with an encrypted payload', async () => {
    const anna = await signUp('anna');
    const device = fakeSubscription();
    await call('POST', '/api/push/subscription', anna.cookie, device.body);

    const disconnect = await startReply(anna.cookie, anna.chatId);
    const active = await call('GET', `/api/chats/${anna.chatId}/job`, anna.cookie);
    expect(active.json<{ jobId: string | null }>().jobId).toEqual(expect.any(String));
    disconnect();
    await new Promise((r) => setTimeout(r, 50));
    release();
    await waitFor(() => pushed.length > 0);

    const messages = await call('GET', `/api/chats/${anna.chatId}/messages?limit=10`, anna.cookie);
    const saved = messages.json<{
      messages: { role: string; content: string; status: string }[];
    }>();
    expect(saved.messages[0]).toMatchObject({ role: 'assistant', status: 'done' });
    expect(pushed).toHaveLength(1);
    const sent = pushed[0];
    expect(sent?.url).toBe(device.body.endpoint);
    expect(sent?.headers['content-encoding']).toBe('aes128gcm');
    expect(sent?.headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    const payload = PushPayload.parse(
      JSON.parse(
        decryptAsBrowser(sent?.body ?? Buffer.alloc(0), device.privateKey, device.auth).toString(),
      ),
    );
    expect(payload).toEqual({ kind: 'reply', chatId: anna.chatId, lang: 'en' });
    expect((await call('GET', `/api/chats/${anna.chatId}/job`, anna.cookie)).json()).toEqual({
      jobId: null,
    });
  });

  it('do not notify when the app was still watching', async () => {
    const anna = await signUp('anna');
    await call('POST', '/api/push/subscription', anna.cookie, fakeSubscription().body);
    const pending = call('POST', `/api/chats/${anna.chatId}/messages`, anna.cookie, {
      content: 'Hi',
    });
    await waitFor(() => built.scheduler.activeJobIn(anna.userId, anna.chatId) !== null);
    await new Promise((r) => setTimeout(r, 20));
    release();
    expect((await pending).statusCode).toBe(200);
    expect(pushed).toHaveLength(0);
  });

  it('drop subscriptions the push service says are gone', async () => {
    const anna = await signUp('anna');
    await call('POST', '/api/push/subscription', anna.cookie, fakeSubscription().body);
    pushStatus = 410;
    const disconnect = await startReply(anna.cookie, anna.chatId);
    disconnect();
    await new Promise((r) => setTimeout(r, 50));
    release();
    await waitFor(() => pushed.length > 0);
    await waitFor(() => subscriptions().length === 0);
    expect(subscriptions()).toHaveLength(0);
  });

  it("hide other users' chats from the job lookup", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    expect((await call('GET', `/api/chats/${anna.chatId}/job`, ben.cookie)).statusCode).toBe(404);
  });
});
