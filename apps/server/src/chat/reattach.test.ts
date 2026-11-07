import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccountResponse, ActiveJobResponse, StreamEvent } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';

const ORIGIN = 'http://localhost:5173';
const model: ResolvedChatModel = {
  id: 'smart',
  label: { en: 'Smart', de: 'Smart' },
  engine: 'ollama',
  ollamaModel: 'smart:1b',
  contextTokens: 8192,
  historyBudgetTokens: 4000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: false,
  vision: false,
  thinking: false,
  tools: false,
};
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'smart' ? model : null),
  imageModel: () => null,
  defaultChatModelId: () => 'smart',
};

/** The model writes the first part, then waits for the test to let it finish. */
let halfway: () => void;
let reachedHalfway: Promise<void>;
let release: () => void;
let released: Promise<void>;
const llm: LlmClient = {
  async *chat() {
    yield { type: 'content', text: 'Teil eins. ' };
    halfway();
    await released;
    yield { type: 'content', text: 'Teil zwei.' };
    yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
  },
  loaded: () => Promise.resolve([{ model: 'smart:1b', memoryGiB: 2 }]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  reachedHalfway = new Promise((r) => {
    halfway = r;
  });
  released = new Promise((r) => {
    release = r;
  });
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
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
  AccountResponse.parse(res.json());
  const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
  if (!session) throw new Error('no session');
  return { cookie, chatId: createChatRepo(built.db).createChat(session, 'smart').id };
}

const events = (body: string) =>
  body
    .split('\n\n')
    .filter((b) => b.includes('data: '))
    .map((b) => StreamEvent.parse(JSON.parse(b.slice(b.indexOf('data: ') + 6))));

describe('attaching to a running reply', () => {
  it('gives the reply so far, then the rest, to the owner only', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const first = app.inject({
      method: 'POST',
      url: `/api/chats/${anna.chatId}/messages`,
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: anna.cookie },
      payload: JSON.stringify({ content: 'Erzähl eine lange Geschichte' }),
    });
    await reachedHalfway;
    const job = ActiveJobResponse.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/chats/${anna.chatId}/job`,
          headers: { origin: ORIGIN, cookie: anna.cookie },
        })
      ).json(),
    );
    const jobId = job.jobId ?? '';
    expect(jobId).not.toBe('');

    const stranger = await app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/events`,
      headers: { origin: ORIGIN, cookie: ben.cookie },
    });
    expect(stranger.statusCode).toBe(404);

    const again = app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/events`,
      headers: { origin: ORIGIN, cookie: anna.cookie },
    });
    // Let the attach happen before the model goes on.
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [, attached] = await Promise.all([first, again]);
    const got = events(attached.body);
    expect(got.map((e) => e.type)).toEqual(['started', 'replace', 'token', 'done']);
    expect(got[1]).toEqual({ type: 'replace', text: 'Teil eins. ' });
    const done = got.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('Teil eins. Teil zwei.');

    const after = await app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/events`,
      headers: { origin: ORIGIN, cookie: anna.cookie },
    });
    expect(after.statusCode).toBe(404);
  });
});
