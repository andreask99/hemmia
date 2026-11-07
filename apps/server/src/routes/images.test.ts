import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { StreamEvent } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import type { ImageModelConfig } from '../config/schema.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ImageEngine, ImageRequest } from '../imagegen/types.ts';
import type { LlmClient } from '../llm/types.ts';
import type { ModelRegistry } from '../models/types.ts';

const ORIGIN = 'http://localhost:5173';
const IMAGE: ImageModelConfig = {
  id: 'image',
  label: { en: 'Pictures', de: 'Bilder' },
  mfluxModel: 'z-image-turbo',
  quantize: 8,
  steps: 3,
  width: 256,
  height: 256,
  memoryGiB: 10,
  enabled: true,
  goodAtText: false,
};

const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: () => Promise.resolve(null),
  imageModel: (id, viewer) => (id === 'image' && !viewer.restricted ? IMAGE : null),
  defaultChatModelId: () => 'quick',
};

const unloaded: string[] = [];
const llm: LlmClient = {
  // eslint-disable-next-line require-yield
  async *chat() {
    await Promise.resolve();
    throw new Error('unused');
  },
  // A big chat model is resident; the image job must push it out.
  loaded: () =>
    Promise.resolve(
      unloaded.includes('gemma4:26b') ? [] : [{ model: 'gemma4:26b', memoryGiB: 20 }],
    ),
  unload: (model) => {
    unloaded.push(model);
    return Promise.resolve();
  },
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
  installed: () => Promise.resolve([]),
};

const requests: ImageRequest[] = [];
const engine: ImageEngine = {
  async generate(req) {
    requests.push(req);
    req.onLoading?.();
    for (let i = 1; i <= req.steps; i++) req.onProgress?.(i, req.steps);
    return sharp({
      create: { width: req.width, height: req.height, channels: 3, background: '#3366cc' },
    })
      .png()
      .toBuffer();
  },
  loaded: () => Promise.resolve([]),
  unload: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  unloaded.length = 0;
  requests.length = 0;
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
    imageEngine: engine,
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
  const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
  if (!session) throw new Error('no session');
  const chatId = createChatRepo(built.db).createChat(session, 'quick').id;
  return { cookie, chatId };
}

function generate(cookie: string, chatId: string, prompt: string) {
  return app.inject({
    method: 'POST',
    url: `/api/chats/${chatId}/images`,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie },
    payload: JSON.stringify({ prompt }),
  });
}

function events(body: string): StreamEvent[] {
  return body
    .split('\n\n')
    .filter((b) => b.includes('data: '))
    .map((b) => StreamEvent.parse(JSON.parse(b.slice(b.indexOf('data: ') + 6))));
}

describe('POST /api/chats/:chatId/images', () => {
  it('streams progress and returns an encrypted, owner-only image', async () => {
    const anna = await signUp('anna');
    const res = await generate(anna.cookie, anna.chatId, 'a blue square');
    expect(res.statusCode).toBe(200);
    const evs = events(res.body);
    expect(evs.map((e) => e.type)).toEqual([
      'started',
      'loading',
      'progress',
      'progress',
      'progress',
      'image',
      'done',
    ]);
    const image = evs.find((e) => e.type === 'image');
    if (image?.type !== 'image') throw new Error('no image');
    expect(image.attachment.kind).toBe('generated');

    const get = await app.inject({
      method: 'GET',
      url: `/api/attachments/${image.attachment.id}`,
      headers: { cookie: anna.cookie },
    });
    expect(get.headers['content-type']).toBe('image/png');
    const ben = await signUp('ben');
    const other = await app.inject({
      method: 'GET',
      url: `/api/attachments/${image.attachment.id}`,
      headers: { cookie: ben.cookie },
    });
    expect(other.statusCode).toBe(404);

    // The engine got the configured size/steps and the prompt.
    expect(requests[0]).toMatchObject({
      model: 'z-image-turbo',
      quantize: 8,
      steps: 3,
      width: 256,
      prompt: 'a blue square',
    });
  });

  it('unloads a large chat model before generating', async () => {
    const anna = await signUp('anna');
    await generate(anna.cookie, anna.chatId, 'x');
    expect(unloaded).toEqual(['gemma4:26b']);
  });

  it('limits images per user per hour', async () => {
    const anna = await signUp('anna');
    for (let i = 0; i < 40; i++) {
      expect((await generate(anna.cookie, anna.chatId, `p${String(i)}`)).statusCode).toBe(200);
    }
    const res = await generate(anna.cookie, anna.chatId, 'one more');
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('is off for restricted accounts', async () => {
    const teen = await signUp('teen', true);
    const res = await generate(teen.cookie, teen.chatId, 'x');
    expect(res.statusCode).toBe(403);
    expect(requests).toHaveLength(0);
  });

  it("returns 404 for another user's chat", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    expect((await generate(ben.cookie, anna.chatId, 'x')).statusCode).toBe(404);
  });
});
