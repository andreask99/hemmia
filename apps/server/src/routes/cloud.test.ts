import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AccountResponse,
  CloudSettingsResponse,
  ModelsResponse,
  StreamEvent,
} from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import type { ModelsFile } from '../config/schema.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import { createOverrideStore } from '../models/overrides.ts';
import { createModelRegistry } from '../models/registry.ts';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';

const ORIGIN = 'http://localhost:5173';
const GOOD_KEY = 'sk-ant-good-0123456789abcdefghijkl';
const BAD_KEY = 'sk-ant-bad-0123456789abcdefghijklm';

const MODELS: ModelsFile = {
  chatModels: [
    {
      id: 'quick',
      label: { en: 'Quick', de: 'Schnell' },
      ollamaModel: 'tiny:1b',
      contextTokens: 8192,
      historyBudgetTokens: 4000,
      think: false,
      unloadAfterUse: false,
      memoryGiB: 2,
      enabled: true,
      adultOnly: false,
    },
  ],
  cloudModels: [
    {
      id: 'orgemma',
      label: { en: 'Gemma (OpenRouter)', de: 'Gemma (OpenRouter)' },
      provider: 'openrouter',
      providerModel: 'google/gemma-4-26b-a4b-it',
      contextTokens: 262_144,
      historyBudgetTokens: 40_000,
      vision: true,
      thinking: true,
      tools: true,
      inputPerMTok: 1,
      outputPerMTok: 2,
      serverFallback: false,
      enabled: true,
      adultOnly: false,
    },
    {
      id: 'claude',
      label: { en: 'Claude', de: 'Claude' },
      provider: 'anthropic',
      providerModel: 'claude-sonnet-5-5',
      contextTokens: 1_000_000,
      historyBudgetTokens: 40_000,
      vision: true,
      thinking: true,
      tools: true,
      inputPerMTok: 2,
      outputPerMTok: 10,
      serverFallback: true,
      enabled: true,
      adultOnly: false,
    },
    {
      id: 'gpt',
      label: { en: 'GPT', de: 'GPT' },
      provider: 'openai',
      providerModel: 'gpt-6.1-sol',
      contextTokens: 1_000_000,
      historyBudgetTokens: 40_000,
      vision: true,
      thinking: true,
      tools: true,
      inputPerMTok: 2,
      outputPerMTok: 10,
      serverFallback: false,
      enabled: true,
      adultOnly: false,
    },
  ],
  imageModels: [],
  defaultChatModel: 'quick',
  defaultImageModel: null,
};

/** The local model: records every request it gets. */
const localCalls: ChatRequest[] = [];
const llm: LlmClient = {
  async *chat(req): AsyncGenerator<ChatChunk> {
    localCalls.push(req);
    await Promise.resolve();
    yield { type: 'content', text: 'local answer' };
    yield { type: 'done', promptTokens: 5, outputTokens: 2, loadMs: 0 };
  },
  loaded: () => Promise.resolve([]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: true }),
  installed: () => Promise.resolve([]),
};

function sse(events: readonly object[]): string {
  return events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
}
const textReply = (text: string, input = 100, output = 20) =>
  sse([
    { type: 'message_start', message: { usage: { input_tokens: input } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: output } },
    { type: 'message_stop' },
  ]);

/** Requests to the cloud and the answers for /v1/messages, in order. */
let cloudCalls: { url: string; headers: Record<string, string>; body: unknown }[];
let cloudAnswers: { status: number; body: string }[];

let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  localCalls.length = 0;
  cloudCalls = [];
  cloudAnswers = [];
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registryFactory: (overrides, cloudKeys) =>
      createModelRegistry({ models: MODELS, llm, overrides: () => overrides.get(), cloudKeys }),
    cloudFetch: async (url, init) => {
      const headers = init.headers as Record<string, string>;
      cloudCalls.push({
        url,
        headers,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      });
      if (url.includes('/v1/models') || url.endsWith('/api/v1/key')) {
        const key = headers['x-api-key'] ?? headers.authorization ?? '';
        return new Response('{}', { status: key.includes('bad') ? 401 : 200 });
      }
      const next = cloudAnswers.shift() ?? { status: 500, body: '' };
      return new Response(next.body, { status: next.status });
    },
  });
  app = built.app;
});

afterEach(async () => {
  await app.close();
});

async function signUp(username: string, restricted = false) {
  const invite = built.auth.createInvite({ role: 'member', restricted, createdBy: null });
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

function request(
  cookie: string,
  method: 'GET' | 'PUT' | 'PATCH' | 'DELETE' | 'POST',
  url: string,
  body?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: {
      origin: ORIGIN,
      cookie,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
  });
}

const addKey = (cookie: string, key = GOOD_KEY, provider = 'anthropic') =>
  request(cookie, 'PUT', `/api/cloud/keys/${provider}`, { key });
const send = (cookie: string, chatId: string, body: unknown) =>
  request(cookie, 'POST', `/api/chats/${chatId}/messages`, body);
const modelIds = async (cookie: string) =>
  ModelsResponse.parse((await request(cookie, 'GET', '/api/models')).json()).chatModels.map(
    (m) => m.id,
  );

function events(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .filter((block) => block.includes('data: '))
    .map((block) => StreamEvent.parse(JSON.parse(block.slice(block.indexOf('data: ') + 6))));
}

describe('cloud keys', () => {
  it('offers cloud models only after the user adds a key that works', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    expect(await modelIds(anna.cookie)).toEqual(['quick']);

    const bad = await addKey(anna.cookie, BAD_KEY);
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: { code: 'cloud_key' } });
    expect(await modelIds(anna.cookie)).toEqual(['quick']);

    const ok = await addKey(anna.cookie);
    expect(ok.statusCode).toBe(200);
    const settings = CloudSettingsResponse.parse(ok.json());
    expect(settings.keys).toEqual([
      { provider: 'anthropic', hint: GOOD_KEY.slice(-4), addedAt: expect.any(Number) as number },
    ]);
    expect(ok.body).not.toContain(GOOD_KEY);
    const models = ModelsResponse.parse((await request(anna.cookie, 'GET', '/api/models')).json());
    expect(models.chatModels.map((m) => [m.id, m.cloud, m.provider])).toEqual([
      ['quick', false, null],
      ['claude', true, 'anthropic'],
    ]);
    // The family default stays local.
    expect(models.defaultChatModel).toBe('quick');
    // Ben has no key: no cloud models for him.
    expect(await modelIds(ben.cookie)).toEqual(['quick']);
    // The key check sends no content.
    expect(cloudCalls.every((c) => c.body === null)).toBe(true);

    const row = built.db.prepare('SELECT secret FROM cloud_keys').get() as { secret: Buffer };
    expect(row.secret.includes(Buffer.from(GOOD_KEY))).toBe(false);

    expect((await request(anna.cookie, 'DELETE', '/api/cloud/keys/anthropic')).statusCode).toBe(
      204,
    );
    expect(await modelIds(anna.cookie)).toEqual(['quick']);
    expect((await request(anna.cookie, 'DELETE', '/api/cloud/keys/anthropic')).statusCode).toBe(
      404,
    );
  });

  it('follows the family switch (off, adults only) and needs a signed-in user', async () => {
    const anna = await signUp('anna');
    const teen = await signUp('teen', true);
    await addKey(anna.cookie);
    const overrides = createOverrideStore(built.db);
    overrides.set({ ...overrides.get(), cloud: 'adults' });
    expect((await addKey(teen.cookie)).statusCode).toBe(403);
    expect(await modelIds(anna.cookie)).toContain('claude');
    overrides.set({ ...overrides.get(), cloud: 'off' });
    expect(await modelIds(anna.cookie)).toEqual(['quick']);
    const settings = CloudSettingsResponse.parse(
      (await request(anna.cookie, 'GET', '/api/cloud')).json(),
    );
    expect(settings.allowed).toBe(false);
    expect((await request('', 'GET', '/api/cloud')).statusCode).toBe(401);
  });

  it('sets and clears the monthly cap', async () => {
    const anna = await signUp('anna');
    const res = await request(anna.cookie, 'PUT', '/api/cloud/cap', { capCents: 500 });
    expect(CloudSettingsResponse.parse(res.json()).capCents).toBe(500);
    const none = await request(anna.cookie, 'PUT', '/api/cloud/cap', { capCents: null });
    expect(CloudSettingsResponse.parse(none.json()).capCents).toBeNull();
    expect((await request(anna.cookie, 'PUT', '/api/cloud/cap', { capCents: 0 })).statusCode).toBe(
      400,
    );
  });
});

describe('chatting with cloud models', () => {
  it('never sends anything to the cloud when a local model is chosen', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    cloudCalls = [];
    const res = await send(anna.cookie, anna.chatId, { content: 'private question' });
    const done = events(res.body).at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('local answer');
    expect(cloudCalls).toEqual([]);
    expect(localCalls).toHaveLength(1);
  });

  it('uses OpenRouter like the other providers: key check, request, spending', async () => {
    const anna = await signUp('anna');
    const OR_KEY = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789';
    expect((await addKey(anna.cookie, OR_KEY, 'openrouter')).statusCode).toBe(200);
    expect(await modelIds(anna.cookie)).toEqual(['quick', 'orgemma']);
    cloudCalls = [];
    cloudAnswers.push({
      status: 200,
      body:
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\n' +
        'data: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":500}}\n\n' +
        'data: [DONE]\n\n',
    });
    const res = await send(anna.cookie, anna.chatId, { content: 'Hi', modelId: 'orgemma' });
    const done = events(res.body).at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('Hello');
    expect(localCalls).toEqual([]);
    expect(cloudCalls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(cloudCalls[0]?.headers.authorization).toBe(`Bearer ${OR_KEY}`);
    const settings = CloudSettingsResponse.parse(
      (await request(anna.cookie, 'GET', '/api/cloud')).json(),
    );
    // 1000 × $1 + 500 × $2 per million tokens = $0.002
    expect(settings.month).toEqual({ costCents: 0.2, inputTokens: 1000, outputTokens: 500 });
  });

  it('sends the chat to the chosen cloud model with the key, and records the use', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    cloudCalls = [];
    cloudAnswers.push({ status: 200, body: textReply('Hello from the cloud', 1000, 500) });
    const res = await send(anna.cookie, anna.chatId, { content: 'Hi Claude', modelId: 'claude' });
    const evs = events(res.body);
    expect(evs.map((e) => e.type)).toEqual(['started', 'token', 'done']);
    const done = evs.at(-1);
    expect(done?.type === 'done' && done.message).toMatchObject({
      content: 'Hello from the cloud',
      modelId: 'claude',
      status: 'done',
    });
    expect(localCalls).toEqual([]);
    expect(cloudCalls).toHaveLength(1);
    const call = cloudCalls[0];
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call?.headers['x-api-key']).toBe(GOOD_KEY);
    expect(call?.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      fallbacks: 'default',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi Claude' }] }],
    });

    const settings = CloudSettingsResponse.parse(
      (await request(anna.cookie, 'GET', '/api/cloud')).json(),
    );
    // 1000 × $2 + 500 × $10 per million tokens = $0.007
    expect(settings.month).toEqual({ costCents: 0.7, inputTokens: 1000, outputTokens: 500 });
  });

  it('runs tools with the cloud model and sends its output back with the results', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    cloudCalls = [];
    cloudAnswers.push({
      status: 200,
      body: sse([
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: 'SIG' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_9', name: 'list_goals', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{}' },
        },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ]),
    });
    cloudAnswers.push({ status: 200, body: textReply('No goals yet.') });
    const res = await send(anna.cookie, anna.chatId, { content: 'My goals?', modelId: 'claude' });
    const done = events(res.body).at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('No goals yet.');
    expect(cloudCalls).toHaveLength(2);
    const second = cloudCalls[1]?.body as { messages: { role: string; content: unknown[] }[] };
    expect(second.messages.at(-2)).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', signature: 'SIG' },
        { type: 'tool_use', id: 'toolu_9', name: 'list_goals', input: {} },
      ],
    });
    const results = second.messages.at(-1);
    expect(results?.role).toBe('user');
    expect(results?.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_9' });
    // Same tools in both rounds (reasoning from round one stays valid).
    const tools = (n: number) => JSON.stringify((cloudCalls[n]?.body as { tools: unknown }).tools);
    expect(tools(1)).toBe(tools(0));
  });

  it('tells the user when the provider rejects the key, without logging it as a bug', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    cloudAnswers.push({ status: 401, body: '{"error":{"message":"invalid x-api-key"}}' });
    const res = await send(anna.cookie, anna.chatId, { content: 'Hi', modelId: 'claude' });
    const evs = events(res.body);
    expect(evs.at(-1)).toEqual({ type: 'error', code: 'cloud_key' });
    const saved = built.db
      .prepare("SELECT status FROM messages WHERE role = 'assistant'")
      .get() as {
      status: string;
    };
    expect(saved.status).toBe('error');
  });

  it('stops at the monthly cap', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    await request(anna.cookie, 'PUT', '/api/cloud/cap', { capCents: 1 });
    cloudAnswers.push({ status: 200, body: textReply('Expensive', 1000, 1000) });
    await send(anna.cookie, anna.chatId, { content: 'Hi', modelId: 'claude' });
    const res = await send(anna.cookie, anna.chatId, { content: 'Again' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'over_budget' } });
    // Local models still answer.
    const local = await send(anna.cookie, anna.chatId, { content: 'Local', modelId: 'quick' });
    expect(local.statusCode).toBe(200);
  });

  it('answers with cloud models while kchat is paused, but not with local ones', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    const overrides = createOverrideStore(built.db);
    overrides.set({ ...overrides.get(), paused: true });
    const local = await send(anna.cookie, anna.chatId, { content: 'Hi' });
    expect(local.statusCode).toBe(409);
    expect(local.json()).toEqual({ error: { code: 'paused' } });
    cloudAnswers.push({ status: 200, body: textReply('Still here') });
    const res = await send(anna.cookie, anna.chatId, { content: 'Hi', modelId: 'claude' });
    const done = events(res.body).at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('Still here');
  });

  it('falls back to a local model, never to the cloud, when a chat loses its model', async () => {
    const anna = await signUp('anna');
    await addKey(anna.cookie);
    // Anna's default is the cloud model; her chat's model goes away.
    await request(anna.cookie, 'PATCH', '/api/me', { defaultModelId: 'claude' });
    built.db.prepare("UPDATE chats SET model_id = 'gone'").run();
    cloudCalls = [];
    const res = await send(anna.cookie, anna.chatId, { content: 'Hi' });
    const done = events(res.body).at(-1);
    expect(done?.type === 'done' && done.message.modelId).toBe('quick');
    expect(cloudCalls).toEqual([]);
  });
});
