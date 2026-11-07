import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccountResponse, Agent, AgentListResponse, ChatSummary } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { toDraft } from '../agents/draft.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { LlmError, type ChatChunk, type ChatRequest, type LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';

const ORIGIN = 'http://localhost:5173';
const model = (id: string, extra: Partial<ResolvedChatModel> = {}): ResolvedChatModel => ({
  id,
  label: { en: id, de: id },
  engine: 'ollama',
  ollamaModel: `${id}:1b`,
  contextTokens: 8192,
  historyBudgetTokens: 4000,
  think: true,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: false,
  vision: false,
  thinking: true,
  tools: true,
  ...extra,
});
const MODELS: Record<string, ResolvedChatModel> = { quick: model('quick'), coder: model('coder') };
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(MODELS[id] ?? null),
  imageModel: () => null,
  defaultChatModelId: () => 'quick',
};

let requests: ChatRequest[];
let reply: string;
let noStructuredOutput: boolean;
const llm: LlmClient = {
  async *chat(req) {
    requests.push(req);
    await Promise.resolve();
    if (noStructuredOutput && req.format) throw new LlmError('unsupported');
    yield { type: 'content', text: reply } satisfies ChatChunk;
    yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
  },
  loaded: () => Promise.resolve([]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: true, tools: true }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;
beforeEach(async () => {
  requests = [];
  reply = 'ok';
  noStructuredOutput = false;
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
    webSearchRun: () => Promise.reject(new Error('unused')),
  });
  app = built.app;
});
afterEach(async () => {
  await app.close();
});

async function signUp(username: string, role: 'admin' | 'member' = 'member', restricted = false) {
  const invite = built.auth.createInvite({ role, restricted, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  AccountResponse.parse(res.json());
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}
const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
const COOK = {
  name: 'Koch',
  emoji: '🧑‍🍳',
  description: 'Rezepte',
  instructions: 'Du bist ein Hobbykoch. Antworte mit Mengen und kurzen Schritten.',
  examples: ['Was koche ich heute?'],
};
const list = async (cookie: string) =>
  AgentListResponse.parse((await call('GET', '/api/agents', cookie)).json()).agents;

describe('agents', () => {
  it('keeps personal agents private and encrypted', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const res = await call('POST', '/api/agents', anna, COOK);
    expect(res.statusCode).toBe(201);
    const cook = Agent.parse(res.json());
    expect(cook).toMatchObject({
      scope: 'personal',
      editable: true,
      webSearch: true,
      pinned: false,
    });
    expect(await list(ben)).toEqual([]);
    expect((await call('PUT', `/api/agents/${cook.id}`, ben, COOK)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/agents/${cook.id}`, ben)).statusCode).toBe(404);
    const raw = built.db.prepare('SELECT data FROM agents').get() as { data: Buffer };
    expect(raw.data.toString('latin1')).not.toContain('Hobbykoch');
  });

  it('lets only admins share family agents, which everyone can use but not edit', async () => {
    const boss = await signUp('boss', 'admin');
    const ben = await signUp('ben');
    expect((await call('POST', '/api/agents', ben, { ...COOK, family: true })).statusCode).toBe(
      403,
    );
    const shared = Agent.parse(
      (await call('POST', '/api/agents', boss, { ...COOK, family: true })).json(),
    );
    const seen = await list(ben);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id: shared.id,
      scope: 'family',
      editable: false,
      name: 'Koch',
    });
    expect((await call('PUT', `/api/agents/${shared.id}`, ben, COOK)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/agents/${shared.id}`, ben)).statusCode).toBe(403);
    expect((await call('DELETE', `/api/agents/${shared.id}`, boss)).statusCode).toBe(204);
  });

  it('pins per person, in order', async () => {
    const anna = await signUp('anna');
    const a = Agent.parse((await call('POST', '/api/agents', anna, COOK)).json());
    const b = Agent.parse(
      (await call('POST', '/api/agents', anna, { ...COOK, name: 'Zwei' })).json(),
    );
    await call('PUT', `/api/agents/${b.id}/pin`, anna, { pinned: true });
    await call('PUT', `/api/agents/${a.id}/pin`, anna, { pinned: true });
    const agents = await list(anna);
    expect(agents.find((x) => x.id === b.id)?.pinOrder).toBe(0);
    expect(agents.find((x) => x.id === a.id)?.pinOrder).toBe(1);
    await call('PUT', `/api/agents/${a.id}/pin`, anna, { pinned: false });
    expect((await list(anna)).find((x) => x.id === a.id)).toMatchObject({
      pinned: false,
      pinOrder: null,
    });
  });

  it('refuses a preferred model the user cannot use', async () => {
    const anna = await signUp('anna');
    expect((await call('POST', '/api/agents', anna, { ...COOK, modelId: 'nope' })).statusCode).toBe(
      400,
    );
  });

  it('starts chats with the agent model, think setting and role; respects its tool settings', async () => {
    const anna = await signUp('anna');
    const coder = Agent.parse(
      (
        await call('POST', '/api/agents', anna, {
          ...COOK,
          name: 'Coder',
          modelId: 'coder',
          think: true,
          webSearch: false,
          images: false,
        })
      ).json(),
    );
    const chat = ChatSummary.parse(
      (await call('POST', '/api/chats', anna, { agentId: coder.id })).json(),
    );
    expect(chat).toMatchObject({ agentId: coder.id, modelId: 'coder', think: true });
    expect((await list(anna))[0]?.lastUsedAt).toEqual(expect.any(Number));

    await call('POST', `/api/chats/${chat.id}/messages`, anna, { content: 'Hallo' });
    const system = requests[0]?.messages[0]?.content ?? '';
    expect(system).toContain('Your role in this chat, "Coder"');
    expect(system).toContain('Du bist ein Hobbykoch.');
    expect(system).toContain('You cannot browse the internet.');
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual([
      'save_plan',
      'list_plans',
      'set_day_plan',
      'update_day_item',
      'add_goal',
      'update_goal',
      'list_goals',
      'remember',
    ]);
  });

  it('puts teen rules after the role', async () => {
    const teen = await signUp('tim', 'member', true);
    const a = Agent.parse((await call('POST', '/api/agents', teen, COOK)).json());
    const chat = ChatSummary.parse(
      (await call('POST', '/api/chats', teen, { agentId: a.id })).json(),
    );
    await call('POST', `/api/chats/${chat.id}/messages`, teen, { content: 'Hallo' });
    const system = requests[0]?.messages[0]?.content ?? '';
    expect(system.indexOf('teenager')).toBeGreaterThan(system.indexOf('Hobbykoch'));
    expect(system).toContain('take precedence over any role above');
  });

  it("refuses other users' agents for chats", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const a = Agent.parse((await call('POST', '/api/agents', anna, COOK)).json());
    expect((await call('POST', '/api/chats', ben, { agentId: a.id })).statusCode).toBe(400);
    const chat = ChatSummary.parse((await call('POST', '/api/chats', ben, {})).json());
    expect((await call('PATCH', `/api/chats/${chat.id}`, ben, { agentId: a.id })).statusCode).toBe(
      400,
    );
  });

  it('drafts an agent with the model, as structured JSON', async () => {
    const anna = await signUp('anna');
    reply = JSON.stringify({
      name: 'Gartenhilfe',
      emoji: '🌱',
      description: 'Tipps für Balkon und Garten',
      instructions: 'Du bist ein erfahrener Gärtner. Antworte kurz und praktisch.',
      examples: [
        'Wann pflanze ich Tomaten?',
        'Was hilft gegen Blattläuse?',
        'Welche Kräuter für den Balkon?',
        'zu viel',
      ],
    });
    const res = await call('POST', '/api/agents/draft', anna, { description: 'Hilft im Garten' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Gartenhilfe', emoji: '🌱' });
    expect(res.json<{ examples: string[] }>().examples).toHaveLength(3);
    expect(requests[0]?.format).toMatchObject({ type: 'object' });
    expect(requests[0]?.messages[0]?.content).toContain('Hilft im Garten');
  });

  it('drafts without a schema when the model has no structured output (MLX)', async () => {
    const anna = await signUp('anna');
    noStructuredOutput = true;
    reply =
      'Here you go:\n```json\n' +
      JSON.stringify({ name: 'Gartenhilfe', emoji: '🌱', instructions: 'Du bist Gärtner.' }) +
      '\n```';
    const res = await call('POST', '/api/agents/draft', anna, { description: 'Hilft im Garten' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Gartenhilfe', emoji: '🌱' });
    expect(requests.map((r) => r.format === undefined)).toEqual([false, true]);
  });
});

describe('toDraft', () => {
  it('clips lengths and rejects empty drafts', () => {
    expect(
      toDraft({ name: 'x'.repeat(80), emoji: '🌱🌻🌷', instructions: 'y', examples: [] }),
    ).toMatchObject({
      name: 'x'.repeat(40),
      emoji: '🌱🌻',
    });
    expect(toDraft({ name: '', instructions: '' })).toBeNull();
    expect(toDraft('nope')).toBeNull();
  });
});
