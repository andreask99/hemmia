import { beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { StreamEvent } from '@hemmia/shared';
import type { ImageModelConfig } from '../config/schema.ts';
import { type ChatRepo, createChatRepo, type UserKey } from '../db/chats.ts';
import { type DB, openDatabase } from '../db/database.ts';
import type { ImageEngine, ImageRequest } from '../imagegen/types.ts';
import { createScheduler, type Scheduler } from '../jobs/scheduler.ts';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';
import type { ResolvedChatModel } from '../models/types.ts';
import { type AttachmentStore, createAttachmentStore } from '../security/attachments.ts';
import { randomKey } from '../security/crypto.ts';
import { type ImageToolDeps, startReply } from './reply.ts';

const MODEL: ResolvedChatModel = {
  id: 'gemma',
  label: { en: 'g', de: 'g' },
  engine: 'ollama',
  ollamaModel: 'gemma4:26b',
  contextTokens: 8192,
  historyBudgetTokens: 4000,
  think: true,
  unloadAfterUse: false,
  memoryGiB: 19,
  enabled: true,
  adultOnly: false,
  vision: true,
  thinking: true,
  tools: true,
};
const image = (id: string, mflux: string, goodAtText = false): ImageModelConfig => ({
  id,
  label: { en: id, de: id },
  mfluxModel: mflux,
  steps: 4,
  width: 256,
  height: 256,
  memoryGiB: 22,
  enabled: true,
  goodAtText,
});
const PLAIN = image('image', 'flux2-klein-4b');
const TEXT = image('image-text', 'z-image-turbo', true);

let db: DB;
let repo: ChatRepo;
let scheduler: Scheduler;
let attachments: AttachmentStore;
let anna: UserKey & { restricted: boolean; language: 'en' | 'de' };
let chatId: string;
let requests: ChatRequest[];
let engineCalls: ImageRequest[];
let memoryNeeds: string[];

const engine: ImageEngine = {
  async generate(req) {
    engineCalls.push(req);
    req.onProgress?.(1, req.steps);
    return sharp({ create: { width: 32, height: 32, channels: 3, background: '#336' } })
      .png()
      .toBuffer();
  },
  loaded: () => Promise.resolve([]),
  unload: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

function llmSaying(chunks: ChatChunk[]): LlmClient {
  return {
    async *chat(req) {
      requests.push(req);
      await Promise.resolve();
      yield* chunks;
    },
    loaded: () => Promise.resolve([{ model: 'gemma4:26b', memoryGiB: 19 }]),
    unload: () => Promise.resolve(),
    capabilities: () => Promise.resolve({ vision: true, thinking: true, tools: true }),
    installed: () => Promise.resolve([]),
  };
}

const done: ChatChunk = { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };

beforeEach(() => {
  db = openDatabase(':memory:');
  const b = Buffer.alloc(1);
  db.prepare(
    `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
       recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at, password_changed_at)
     VALUES ('u-anna', 'anna', 'member', ?, ?, '{}', ?, ?, '{}', ?, 0, 0)`,
  ).run(b, b, b, b, b);
  repo = createChatRepo(db);
  memoryNeeds = [];
  scheduler = createScheduler({
    memory: {
      prepare: (need) => {
        memoryNeeds.push(need.model);
        return Promise.resolve([]);
      },
      release: () => Promise.resolve(),
      releaseOwned: () => Promise.resolve([]),
    },
  });
  attachments = createAttachmentStore({ db, dataDir: ':memory:' });
  anna = { userId: 'u-anna', dek: randomKey(), restricted: false, language: 'en' };
  chatId = repo.createChat(anna, 'gemma').id;
  requests = [];
  engineCalls = [];
});

function tool(restricted = false): ImageToolDeps {
  return {
    engine,
    attachments,
    models: (viewer) =>
      viewer.restricted || restricted ? { plain: null, text: null } : { plain: PLAIN, text: TEXT },
  };
}

async function run(
  llm: LlmClient,
  content: string,
  attachmentIds: string[] = [],
  imageTool = tool(),
) {
  const events: StreamEvent[] = [];
  const reply = startReply(
    { repo, llm, scheduler, imageTool, loadImage: async () => Promise.resolve('aGk=') },
    { user: anna, chatId, model: MODEL, think: false, content, attachmentIds },
  );
  reply.start((e) => events.push(e));
  await reply.finished;
  return events;
}

describe('create_image tool', () => {
  it('offers the tool and turns a tool call into a picture on the reply', async () => {
    const llm = llmSaying([
      { type: 'content', text: 'Here you go.' },
      {
        type: 'tool_call',
        name: 'create_image',
        arguments: { prompt: 'a red dragon reading a book' },
      },
      done,
    ]);
    const events = await run(llm, 'Draw a dragon');
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual(['create_image']);
    expect(events.map((e) => e.type)).toEqual(['token', 'loading', 'progress', 'image', 'done']);
    const last = events.at(-1);
    expect(last?.type === 'done' && last.message.attachments[0]?.kind).toBe('generated');
    expect(last?.type === 'done' && last.message.content).toBe('Here you go.');
    expect(engineCalls[0]).toMatchObject({
      model: 'flux2-klein-4b',
      prompt: 'a red dragon reading a book',
    });
    expect(engineCalls[0]?.sourceImage).toBeUndefined();
    // The GPU switched from the chat model to the image model within the job.
    expect(memoryNeeds).toEqual(['gemma4:26b', 'flux2-klein-4b']);
  });

  it('edits the most recent photo when asked', async () => {
    const photo = await attachments.saveUpload(
      anna,
      await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a33' } })
        .jpeg()
        .toBuffer(),
    );
    const llm = llmSaying([
      {
        type: 'tool_call',
        name: 'create_image',
        arguments: { prompt: 'same scene at sunset', edit: true },
      },
      done,
    ]);
    await run(llm, 'Make the sky look like sunset', [photo.id]);
    expect(engineCalls[0]?.sourceImage?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('uses the text-capable model for pictures with words', async () => {
    const llm = llmSaying([
      {
        type: 'tool_call',
        name: 'create_image',
        arguments: { prompt: "card saying 'Alles Gute'", text: true },
      },
      done,
    ]);
    await run(llm, 'Make a birthday card');
    expect(engineCalls[0]?.model).toBe('z-image-turbo');
  });

  it('offers no tool when the account may not create images, and ignores bad calls', async () => {
    await run(llmSaying([{ type: 'content', text: 'ok' }, done]), 'hi', [], tool(true));
    expect(requests[0]?.tools).toBeUndefined();
    const events = await run(
      llmSaying([{ type: 'tool_call', name: 'create_image', arguments: { nope: 1 } }, done]),
      'draw',
    );
    expect(engineCalls).toHaveLength(0);
    expect(events.at(-1)?.type).toBe('done');
  });
});
