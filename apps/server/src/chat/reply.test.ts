import { beforeEach, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@hemmia/shared';
import { type ChatRepo, createChatRepo, type UserKey } from '../db/chats.ts';
import { type DB, openDatabase } from '../db/database.ts';
import { createMemoryManager } from '../jobs/memory.ts';
import { BusyError, createScheduler, type Scheduler } from '../jobs/scheduler.ts';
import { type ChatChunk, type ChatRequest, LlmError, type LlmClient } from '../llm/types.ts';
import type { ResolvedChatModel } from '../models/types.ts';
import { randomKey } from '../security/crypto.ts';
import { pickAnswer, startReply } from './reply.ts';

const MODEL: ResolvedChatModel = {
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
  vision: true,
  thinking: false,
};

type Script = (req: ChatRequest) => AsyncGenerator<ChatChunk>;

function fakeLlm(script: Script) {
  const requests: ChatRequest[] = [];
  const llm: LlmClient = {
    chat: (req) => {
      requests.push(req);
      return script(req);
    },
    loaded: () => Promise.resolve([]),
    unload: () => Promise.resolve(),
    capabilities: () => Promise.resolve({ vision: true, thinking: false, tools: false }),
    installed: () => Promise.resolve([]),
  };
  return { llm, requests };
}

async function* say(...parts: string[]): AsyncGenerator<ChatChunk> {
  await Promise.resolve();
  for (const text of parts) yield { type: 'content', text };
  yield { type: 'done', promptTokens: 10, outputTokens: parts.length, loadMs: 0 };
}

let db: DB;
let repo: ChatRepo;
let scheduler: Scheduler;
let anna: UserKey & { restricted: boolean; language: 'en' | 'de' };
let chatId: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  const b = Buffer.alloc(1);
  db.prepare(
    `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
       recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at, password_changed_at)
     VALUES ('u-anna', 'anna', 'member', ?, ?, '{}', ?, ?, '{}', ?, 0, 0)`,
  ).run(b, b, b, b, b);
  repo = createChatRepo(db);
  scheduler = createScheduler({ memory: createMemoryManager({ engines: [], budgetGiB: 22 }) });
  anna = { userId: 'u-anna', dek: randomKey(), restricted: false, language: 'en' };
  chatId = repo.createChat(anna, 'quick').id;
});

function run(llm: LlmClient, content = 'Hallo?') {
  const events: StreamEvent[] = [];
  const reply = startReply(
    { repo, llm, scheduler },
    { user: anna, chatId, model: MODEL, think: false, content, attachmentIds: [] },
  );
  reply.start((e) => events.push(e));
  return { reply, events };
}

describe('startReply', () => {
  it('streams tokens and saves both messages', async () => {
    const { llm, requests } = fakeLlm(() => say('Hal', 'lo!'));
    const { reply, events } = run(llm);
    await reply.finished;
    expect(events.map((e) => e.type)).toEqual(['loading', 'token', 'token', 'done']);
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('Hallo!');
    const stored = repo
      .listMessages(anna, chatId, { limit: 10 })
      ?.messages.map((m) => `${m.role}:${m.status}:${m.content}`);
    expect(stored).toEqual(['assistant:done:Hallo!', 'user:done:Hallo?']);
    // The model saw the system prompt and the user's message.
    expect(requests[0]?.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(requests[0]?.keepAliveSeconds).toBe(300);
  });

  it('reports thinking without sending its text', async () => {
    const { llm } = fakeLlm(async function* () {
      await Promise.resolve();
      yield { type: 'thinking', text: 'hmm, secret reasoning' };
      yield { type: 'thinking', text: 'more' };
      yield { type: 'content', text: 'Answer' };
      yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
    });
    const { reply, events } = run(llm);
    await reply.finished;
    expect(events.map((e) => e.type)).toEqual(['loading', 'thinking', 'thinking', 'token', 'done']);
    expect(JSON.stringify(events)).not.toContain('secret reasoning');
  });

  it('drops a draft the model wrote before </think> in the reply', async () => {
    const { llm } = fakeLlm(() =>
      say('Sunny. Go hiking.', '\n</th', 'ink>\n\n', 'Sunny. ', 'Hike!'),
    );
    const { reply, events } = run(llm);
    await reply.finished;
    expect(events.map((e) => e.type)).toEqual([
      'loading',
      'token',
      'token',
      'replace',
      'replace',
      'done',
    ]);
    // The draft stays until the answer is at least half as long, then replaces it.
    expect(events[3]).toEqual({ type: 'replace', text: 'Sunny. Go hiking.' });
    expect(events[4]).toEqual({ type: 'replace', text: 'Sunny. Hike!' });
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('Sunny. Hike!');
  });

  it('keeps the answer when a stray </think> and a short line follow it', async () => {
    const { llm } = fakeLlm(() =>
      say('Sunny, 16 °C. Hike up the Zugerberg.', '\n</think>\n', 'Enjoy!'),
    );
    const { reply, events } = run(llm);
    await reply.finished;
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe(
      'Sunny, 16 °C. Hike up the Zugerberg.',
    );
  });

  it('picks the answer around </think>', () => {
    expect(pickAnswer('draft one\n</think>\nthe answer')).toBe('the answer');
    expect(pickAnswer('a long full answer here</think>bye')).toBe('a long full answer here');
    expect(pickAnswer('answer</think>')).toBe('answer');
    expect(pickAnswer('a</think>bb</think>ccc')).toBe('ccc');
  });

  it('refuses a second message while a reply is running', async () => {
    const { llm } = fakeLlm(() => say('ok'));
    const first = startReply(
      { repo, llm, scheduler },
      { user: anna, chatId, model: MODEL, think: false, content: 'a', attachmentIds: [] },
    );
    expect(() =>
      startReply(
        { repo, llm, scheduler },
        { user: anna, chatId, model: MODEL, think: false, content: 'b', attachmentIds: [] },
      ),
    ).toThrow(BusyError);
    // Nothing was saved for the refused message.
    expect(repo.listMessages(anna, chatId, { limit: 10 })?.messages.map((m) => m.content)).toEqual([
      'a',
    ]);
    first.start(() => undefined);
    await first.finished;
  });

  it('saves a partial reply as cancelled when stopped', async () => {
    const { llm } = fakeLlm(async function* (req) {
      yield { type: 'content', text: 'Part' };
      await new Promise((_, reject) => {
        req.signal.addEventListener('abort', () => {
          reject(new LlmError('aborted'));
        });
      });
    });
    const { reply, events } = run(llm);
    while (!events.some((e) => e.type === 'token')) await new Promise((r) => setTimeout(r, 1));
    reply.cancel();
    await reply.finished;
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    expect(done?.type === 'done' && done.message.status).toBe('cancelled');
    expect(done?.type === 'done' && done.message.content).toBe('Part');
  });

  it('reports model errors and saves the reply as failed', async () => {
    const { llm } = fakeLlm(async function* () {
      await Promise.resolve();
      yield { type: 'content', text: 'x' };
      throw new LlmError('unavailable');
    });
    const { reply, events } = run(llm);
    await reply.finished;
    expect(events.at(-1)).toEqual({ type: 'error', code: 'model_error' });
    expect(repo.listMessages(anna, chatId, { limit: 1 })?.messages[0]?.status).toBe('error');
  });

  it('wipes its key copy when done and leaves the caller key intact', async () => {
    const callerDek = Buffer.from(anna.dek);
    const { llm } = fakeLlm(() => say('ok'));
    const { reply } = run(llm);
    await reply.finished;
    expect(anna.dek.equals(callerDek)).toBe(true);
  });

  it('buffers queue events until the stream starts', async () => {
    const blocker = fakeLlm(async function* (req) {
      await new Promise((resolve) => {
        req.signal.addEventListener('abort', resolve);
      });
      yield { type: 'done', promptTokens: 0, outputTokens: 0, loadMs: 0 };
    });
    const other = scheduler.submit({
      userId: 'someone-else',
      kind: 'chat',
      need: { engine: 'ollama', model: 'x', memoryGiB: 1 },
      timeoutMs: 60_000,
      run: async (ctx) => {
        for await (const _ of blocker.llm.chat({ signal: ctx.signal } as ChatRequest)) {
          // wait
        }
      },
    });
    const { llm } = fakeLlm(() => say('ok'));
    const reply = startReply(
      { repo, llm, scheduler },
      { user: anna, chatId, model: MODEL, think: false, content: 'q', attachmentIds: [] },
    );
    const events: StreamEvent[] = [];
    reply.start((e) => events.push(e));
    expect(events[0]).toEqual({ type: 'queued', position: 1 });
    scheduler.cancel(other.id, 'someone-else');
    await reply.finished;
    expect(events.at(-1)?.type).toBe('done');
  });
});
