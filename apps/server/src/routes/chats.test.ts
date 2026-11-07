import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ChatListResponse, ChatSummary, MessagesResponse } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';

const ORIGIN = 'http://localhost:5173';
const model = (id: string): ResolvedChatModel => ({
  id,
  label: { en: id, de: id },
  engine: 'ollama',
  ollamaModel: `${id}:1b`,
  contextTokens: 4096,
  historyBudgetTokens: 2000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: false,
  vision: false,
  thinking: false,
});
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'quick' || id === 'smart' ? model(id) : null),
  imageModel: () => null,
  defaultChatModelId: () => 'quick',
};

let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
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
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

describe('chat routes', () => {
  it('creates chats with the default or a chosen model; rejects unknown models', async () => {
    const anna = await signUp('anna');
    const a = await call('POST', '/api/chats', anna, {});
    expect(a.statusCode).toBe(201);
    expect(ChatSummary.parse(a.json()).modelId).toBe('quick');
    expect(
      ChatSummary.parse((await call('POST', '/api/chats', anna, { modelId: 'smart' })).json())
        .modelId,
    ).toBe('smart');
    expect((await call('POST', '/api/chats', anna, { modelId: 'nope' })).statusCode).toBe(400);
  });

  it("uses the user's default model for new chats when set", async () => {
    const anna = await signUp('anna');
    await call('PATCH', '/api/me', anna, { defaultModelId: 'smart' });
    expect(ChatSummary.parse((await call('POST', '/api/chats', anna, {})).json()).modelId).toBe(
      'smart',
    );
  });

  it("lists, renames and deletes only the user's own chats", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const chat = ChatSummary.parse((await call('POST', '/api/chats', anna, {})).json());
    expect(ChatListResponse.parse((await call('GET', '/api/chats', ben)).json()).chats).toEqual([]);

    expect((await call('PATCH', `/api/chats/${chat.id}`, ben, { title: 'x' })).statusCode).toBe(
      404,
    );
    expect((await call('PATCH', `/api/chats/${chat.id}`, anna, {})).statusCode).toBe(400);
    const renamed = await call('PATCH', `/api/chats/${chat.id}`, anna, { title: 'Urlaub' });
    expect(ChatSummary.parse(renamed.json()).title).toBe('Urlaub');

    expect((await call('DELETE', `/api/chats/${chat.id}`, ben)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/chats/${chat.id}`, anna)).statusCode).toBe(204);
    expect((await call('GET', `/api/chats/${chat.id}/messages`, anna)).statusCode).toBe(404);
  });

  it('validates a new model before changing anything', async () => {
    const anna = await signUp('anna');
    const chat = ChatSummary.parse((await call('POST', '/api/chats', anna, {})).json());
    expect(
      (await call('PATCH', `/api/chats/${chat.id}`, anna, { modelId: 'nope' })).statusCode,
    ).toBe(400);
    const list = ChatListResponse.parse((await call('GET', '/api/chats', anna)).json());
    expect(list.chats[0]?.modelId).toBe('quick');
  });

  it('pages messages and validates the cursor', async () => {
    const anna = await signUp('anna');
    const chat = ChatSummary.parse((await call('POST', '/api/chats', anna, {})).json());
    const key = built.auth.resolveSession(anna.split('=')[1] ?? '');
    if (!key) throw new Error('no session');
    const repo = createChatRepo(built.db);
    for (const content of ['a', 'b', 'c']) {
      repo.addMessage(key, chat.id, { role: 'user', content, modelId: null, status: 'done' });
    }
    const page = MessagesResponse.parse(
      (await call('GET', `/api/chats/${chat.id}/messages?limit=2`, anna)).json(),
    );
    expect(page.messages.map((m) => m.content)).toEqual(['c', 'b']);
    expect(page.nextCursor).not.toBeNull();
    expect((await call('GET', `/api/chats/${chat.id}/messages?before=abc`, anna)).statusCode).toBe(
      400,
    );
    const ben = await signUp('ben');
    expect((await call('GET', `/api/chats/${chat.id}/messages`, ben)).statusCode).toBe(404);
  });

  it('requires a session', async () => {
    expect((await call('GET', '/api/chats', '')).statusCode).toBe(401);
  });
});
