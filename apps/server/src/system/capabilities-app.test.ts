import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccountResponse, SystemCapabilities } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';
import { staticCapabilities } from './capabilities.ts';

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
  tools: true,
};

const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'quick' ? model : null),
  imageModel: () => null,
  defaultChatModelId: () => 'quick',
};

const CAPS: SystemCapabilities = {
  platform: 'linux',
  arch: 'x64',
  memoryGiB: 16,
  diskFreeGiB: 100,
  ollama: { reachable: true, version: '0.40.5' },
  images: false,
  webSearch: false,
};

let built: App | undefined;
afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

async function setup(webSearch: boolean): Promise<{ app: FastifyInstance; seen: string[][] }> {
  const seen: string[][] = [];
  const llm: LlmClient = {
    async *chat(req: ChatRequest): AsyncGenerator<ChatChunk> {
      await Promise.resolve();
      seen.push((req.tools ?? []).map((t) => t.name));
      yield { type: 'content', text: 'ok' };
      yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
    },
    loaded: () => Promise.resolve([]),
    unload: () => Promise.resolve(),
    capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: true }),
    installed: () => Promise.resolve([]),
  };
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
    capabilities: staticCapabilities({ ...CAPS, webSearch }),
    webSearchRun: (query) =>
      Promise.resolve({ search: { query, sources: [] }, toolResult: 'No results.' }),
  });
  return { app: built.app, seen };
}

async function signUp(b: App) {
  const invite = b.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
  const res = await b.app.inject({
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
  const session = b.auth.resolveSession(cookie.split('=')[1] ?? '');
  if (!session) throw new Error('no session');
  return { cookie, chatId: createChatRepo(b.db).createChat(session, 'quick').id };
}

describe('capabilities in the app', () => {
  it('serves GET /api/capabilities to signed-in users only', async () => {
    const { app } = await setup(false);
    expect((await app.inject({ method: 'GET', url: '/api/capabilities' })).statusCode).toBe(401);
    if (!built) throw new Error('no app');
    const anna = await signUp(built);
    const res = await app.inject({
      method: 'GET',
      url: '/api/capabilities',
      headers: { cookie: anna.cookie },
    });
    expect(SystemCapabilities.parse(res.json())).toEqual(CAPS);
  });

  it('offers web_search only when SearXNG is available', async () => {
    for (const webSearch of [false, true]) {
      const { app, seen } = await setup(webSearch);
      if (!built) throw new Error('no app');
      const anna = await signUp(built);
      const res = await app.inject({
        method: 'POST',
        url: `/api/chats/${anna.chatId}/messages`,
        headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: anna.cookie },
        payload: JSON.stringify({ content: 'Hello' }),
      });
      expect(res.statusCode).toBe(200);
      expect(seen[0]?.includes('web_search')).toBe(webSearch);
      await built.app.close();
      built = undefined;
    }
  });
});
