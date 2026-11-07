import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccountResponse, StreamEvent } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import { createOverrideStore } from '../models/overrides.ts';
import { tinyPdf } from '../security/document-fixtures.ts';
import sharp from 'sharp';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';

const ORIGIN = 'http://localhost:5173';

const base: ResolvedChatModel = {
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
  chatModel: (id) =>
    Promise.resolve(
      id === 'quick' ? base : id === 'vision' ? { ...base, id: 'vision', vision: true } : null,
    ),
  imageModel: () => null,
  defaultChatModelId: () => 'quick',
};

const llm: LlmClient = {
  async *chat(): AsyncGenerator<ChatChunk> {
    await Promise.resolve();
    yield { type: 'content', text: 'Hi ' };
    yield { type: 'content', text: 'there' };
    yield { type: 'done', promptTokens: 5, outputTokens: 2, loadMs: 0 };
  },
  loaded: () => Promise.resolve([{ model: 'tiny:1b', memoryGiB: 2 }]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
  });
  app = built.app;
});

afterEach(async () => {
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

function send(cookie: string, chatId: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/chats/${chatId}/messages`,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie },
    payload: JSON.stringify(body),
  });
}

function events(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.includes('data: '))
    .map((block) => StreamEvent.parse(JSON.parse(block.slice(block.indexOf('data: ') + 6))));
}

describe('POST /api/chats/:chatId/messages', () => {
  it('streams the reply as server-sent events with security headers', async () => {
    const anna = await signUp('anna');
    const res = await send(anna.cookie, anna.chatId, { content: 'Hello' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    const evs = events(res.body);
    expect(evs.map((e) => e.type)).toEqual(['started', 'token', 'token', 'done']);
    const done = evs.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('Hi there');
  });

  it("returns 404 for another user's chat without saving anything", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const res = await send(ben.cookie, anna.chatId, { content: 'let me in' });
    expect(res.statusCode).toBe(404);
    const count = built.db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('returns 409 while the user already has a reply running', async () => {
    const anna = await signUp('anna');
    let release: () => void = () => undefined;
    built.scheduler.submit({
      userId: anna.userId,
      kind: 'chat',
      need: { engine: 'ollama', model: 'x', memoryGiB: 1 },
      timeoutMs: 60_000,
      run: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const res = await send(anna.cookie, anna.chatId, { content: 'again' });
    expect(res.statusCode).toBe(409);
    release();
  });

  it('rejects unknown models, and photos (not text documents) for models without vision', async () => {
    const anna = await signUp('anna');
    const session = built.auth.resolveSession(anna.cookie.split('=')[1] ?? '');
    if (!session) throw new Error('no session');
    expect(
      (await send(anna.cookie, anna.chatId, { content: 'x', modelId: 'nope' })).statusCode,
    ).toBe(400);
    const photo = await built.attachments.saveUpload(
      session,
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
        .jpeg()
        .toBuffer(),
    );
    expect(
      (await send(anna.cookie, anna.chatId, { content: 'x', attachmentIds: [photo.id] }))
        .statusCode,
    ).toBe(400);
    // Text documents work with any model.
    const doc = await built.attachments.saveDocument(session, tinyPdf('Abschlag 86 EUR'), 'R.pdf');
    expect(
      (await send(anna.cookie, anna.chatId, { content: 'x', attachmentIds: [doc.id] })).statusCode,
    ).toBe(200);
    // Only the user's own unsent uploads (a1 doesn't exist).
    expect(
      (
        await send(anna.cookie, anna.chatId, {
          content: 'x',
          modelId: 'vision',
          attachmentIds: ['a1'],
        })
      ).statusCode,
    ).toBe(404);
  });

  it('requires a session and a valid body', async () => {
    const anna = await signUp('anna');
    expect((await send('', anna.chatId, { content: 'x' })).statusCode).toBe(401);
    expect((await send(anna.cookie, anna.chatId, { content: '   ' })).statusCode).toBe(400);
  });
});

describe('POST /api/jobs/:jobId/cancel', () => {
  it("can't cancel another user's job", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    let release: () => void = () => undefined;
    const job = built.scheduler.submit({
      userId: anna.userId,
      kind: 'chat',
      need: { engine: 'ollama', model: 'x', memoryGiB: 1 },
      timeoutMs: 60_000,
      run: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    const cancel = (cookie: string) =>
      app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/cancel`,
        headers: { origin: ORIGIN, cookie },
      });
    expect((await cancel(ben.cookie)).statusCode).toBe(404);
    expect((await cancel(anna.cookie)).statusCode).toBe(204);
    release();
  });
});

describe('think switch and model fallback', () => {
  it('passes "think" only when the chat asks for it and the model can think', async () => {
    const seen: ChatRequest[] = [];
    const recording: LlmClient = {
      ...llm,
      chat: (req) => {
        seen.push(req);
        return llm.chat(req);
      },
    };
    const thinker: ModelRegistry = {
      ...registry,
      chatModel: (id) =>
        Promise.resolve(id === 'quick' ? { ...base, think: 'low', thinking: true } : null),
    };
    await app.close();
    built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      llm: recording,
      registry: thinker,
    });
    app = built.app;
    const anna = await signUp('anna');
    await send(anna.cookie, anna.chatId, { content: 'one' });
    await app.inject({
      method: 'PATCH',
      url: `/api/chats/${anna.chatId}`,
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: anna.cookie },
      payload: JSON.stringify({ think: true }),
    });
    await send(anna.cookie, anna.chatId, { content: 'two' });
    expect(seen.map((r) => r.think)).toEqual([false, 'low']);
  });

  it("falls back to the default model when the chat's model is gone", async () => {
    const anna = await signUp('anna');
    built.db.prepare("UPDATE chats SET model_id = 'removed-model'").run();
    const res = await send(anna.cookie, anna.chatId, { content: 'still works?' });
    expect(res.statusCode).toBe(200);
    expect(events(res.body).at(-1)?.type).toBe('done');
  });
});

describe('pause and other work on the Mac', () => {
  it('refuses messages while paused, before anything is saved', async () => {
    const anna = await signUp('anna');
    const store = createOverrideStore(built.db);
    store.set({ ...store.get(), paused: true });
    const res = await send(anna.cookie, anna.chatId, { content: 'Hello' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'paused' } });
    const count = built.db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('reports machine_busy when a model kchat does not own leaves no room, and keeps it loaded', async () => {
    await app.close();
    const unloaded: string[] = [];
    let chatCalls = 0;
    const busyLlm: LlmClient = {
      ...llm,
      async *chat(): AsyncGenerator<ChatChunk> {
        chatCalls++;
        await Promise.resolve();
        yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
      },
      // A coding model (not in config/models.json) holds most of the memory.
      loaded: () => Promise.resolve([{ model: 'qwen3-coder-dev:latest', memoryGiB: 21 }]),
      unload: (model) => {
        unloaded.push(model);
        return Promise.resolve();
      },
    };
    built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      llm: busyLlm,
      registry,
    });
    app = built.app;
    const anna = await signUp('anna');
    const res = await send(anna.cookie, anna.chatId, { content: 'Hello' });
    const evs = events(res.body);
    expect(evs.map((e) => e.type)).toEqual(['started', 'error']);
    expect(evs[1]).toEqual({ type: 'error', code: 'machine_busy' });
    expect(chatCalls).toBe(0);
    expect(unloaded).toEqual([]);
  });
});

describe('long messages', () => {
  it('refuse texts longer than the chosen model can read, before saving anything', async () => {
    const anna = await signUp('anna');
    // The test model has a 4096-token window: its limit is the minimum (1000 characters).
    const res = await send(anna.cookie, anna.chatId, { content: 'x'.repeat(1001) });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'too_long' } });
    const count = built.db.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number };
    expect(count.n).toBe(0);
    expect((await send(anna.cookie, anna.chatId, { content: 'x'.repeat(1000) })).statusCode).toBe(
      200,
    );
  });
});

describe('a hub without models', () => {
  it('answers no_model when the chat has no usable model and there is no default', async () => {
    await app.close();
    built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      llm,
      registry: {
        ...registry,
        chatModel: () => Promise.resolve(null),
        defaultChatModelId: () => null,
      },
    });
    app = built.app;
    const anna = await signUp('anna');
    const res = await send(anna.cookie, anna.chatId, { content: 'Hello' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'no_model' } });
    const created = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: anna.cookie },
      payload: '{}',
    });
    expect(created.statusCode).toBe(409);
    expect(created.json()).toEqual({ error: { code: 'no_model' } });
  });
});
