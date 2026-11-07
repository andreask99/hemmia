import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { ChatListResponse, MessagesResponse } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
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
  vision: true,
  thinking: false,
});
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'quick' || id === 'claude-sonnet' ? model(id) : null),
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

const call = (method: 'GET' | 'POST', url: string, cookie: string, body?: unknown) =>
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

const jpeg = async () =>
  (
    await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a33' } })
      .jpeg()
      .toBuffer()
  ).toString('base64');

const exportWith = (chats: unknown[]) => ({
  format: 'kchat-phone-export',
  version: 1,
  exportedAt: 1,
  aboutMe: '',
  chats,
});

describe('phone import', () => {
  it('adds the chats to the signed-in user only, through upload validation', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const body = exportWith([
      {
        id: 'p1',
        title: 'Trip to Sweden',
        createdAt: 1,
        model: 'claude-sonnet',
        messages: [
          {
            role: 'user',
            text: 'Where should we go?',
            createdAt: 2,
            photos: [await jpeg(), Buffer.from('not an image').toString('base64')],
          },
          {
            role: 'assistant',
            text: 'Try Gotland.',
            createdAt: 3,
            model: 'claude-sonnet',
            stopped: true,
          },
        ],
      },
      {
        id: 'p2',
        title: '',
        createdAt: 4,
        model: 'gpt-unknown',
        messages: [{ role: 'user', text: 'Hi', createdAt: 5 }],
      },
    ]);
    const res = await call('POST', '/api/import/phone', anna, body);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ chats: 2, messages: 3, photos: 1, photosSkipped: 1 });

    const list = ChatListResponse.parse((await call('GET', '/api/chats', anna)).json()).chats;
    const trip = list.find((c) => c.title === 'Trip to Sweden');
    expect(trip?.modelId).toBe('claude-sonnet');
    expect(list.find((c) => c.id !== trip?.id)?.modelId).toBe('quick');
    const msgs = MessagesResponse.parse(
      (await call('GET', `/api/chats/${trip?.id ?? ''}/messages`, anna)).json(),
    ).messages;
    // Newest first, as the API pages them.
    expect(msgs.map((m) => [m.role, m.content, m.status])).toEqual([
      ['assistant', 'Try Gotland.', 'cancelled'],
      ['user', 'Where should we go?', 'done'],
    ]);
    expect(msgs[1]?.attachments.length).toBe(1);

    expect(ChatListResponse.parse((await call('GET', '/api/chats', ben)).json()).chats).toEqual([]);
    expect((await call('GET', `/api/chats/${trip?.id ?? ''}/messages`, ben)).statusCode).toBe(404);
  });

  it('refuses other formats and oversized exports, and needs a session', async () => {
    const anna = await signUp('anna');
    expect(
      (await call('POST', '/api/import/phone', anna, { ...exportWith([]), version: 2 })).statusCode,
    ).toBe(400);
    const tooMany = Array.from({ length: 2001 }, () => ({ role: 'user', text: 'x', createdAt: 1 }));
    expect(
      (
        await call(
          'POST',
          '/api/import/phone',
          anna,
          exportWith([{ id: 'p', title: '', createdAt: 1, model: 'quick', messages: tooMany }]),
        )
      ).statusCode,
    ).toBe(400);
    expect((await call('POST', '/api/import/phone', '', exportWith([]))).statusCode).toBe(401);
  });

  it('allows three imports an hour per user', async () => {
    const anna = await signUp('anna');
    for (let i = 0; i < 3; i++)
      expect((await call('POST', '/api/import/phone', anna, exportWith([]))).statusCode).toBe(200);
    expect((await call('POST', '/api/import/phone', anna, exportWith([]))).statusCode).toBe(429);
  });
});
