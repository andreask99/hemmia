import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import {
  AdminEnginesResponse,
  AdminModelsResponse,
  ModelsResponse,
  StreamEvent,
} from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, LlmClient } from '../llm/types.ts';
import { createModelRegistry } from '../models/registry.ts';

const ORIGIN = 'http://localhost:5173';

/** A fake LM Studio: /v1/models and a streaming /v1/chat/completions. */
let server: http.Server;
let base = '';
const posted: unknown[] = [];
/** llama.cpp's sleep state at /props; null: no /props (like LM Studio). */
let sleeping: boolean | null = null;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'qwen3-14b-instruct' }, { id: 'llama-9b' }] }));
        return;
      }
      if (req.url === '/props' && sleeping !== null) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ is_sleeping: sleeping }));
        return;
      }
      if (req.url === '/v1/chat/completions') {
        posted.push(JSON.parse(body) as unknown);
        sleeping = sleeping === null ? null : false;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(
          'data: {"choices":[{"delta":{"content":"From LM Studio"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
});
afterAll(async () => {
  await new Promise<void>((r) =>
    server.close(() => {
      r();
    }),
  );
});

const ollamaCalls: string[] = [];
const llm: LlmClient = {
  async *chat(req): AsyncGenerator<ChatChunk> {
    await Promise.resolve();
    ollamaCalls.push(req.model);
    yield { type: 'done', promptTokens: 0, outputTokens: 0, loadMs: 0 };
  },
  loaded: () => Promise.resolve([]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;
beforeEach(async () => {
  posted.length = 0;
  ollamaCalls.length = 0;
  sleeping = null;
  const config = loadConfig({ NODE_ENV: 'test' });
  built = await buildApp(config, {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registryFactory: (overrides, cloudKeys, capabilities, custom) =>
      createModelRegistry({
        models: { ...config.models, chatModels: [], defaultChatModel: null },
        llm,
        overrides: () => overrides.get(),
        cloudKeys,
        imagesAvailable: () => capabilities.current().images,
        customEngines: custom.engines,
        customModels: custom.models,
      }),
  });
  app = built.app;
});
afterEach(async () => {
  await app.close();
});

async function signUp(username: string, role: 'admin' | 'member') {
  const invite = built.auth.createInvite({ role, restricted: false, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

const call = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie: string, body?: unknown) =>
  app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });

describe('custom local servers', () => {
  it('is admin only', async () => {
    const member = await signUp('ben', 'member');
    expect((await call('GET', '/api/admin/engines', member)).statusCode).toBe(403);
    expect(
      (await call('POST', '/api/admin/engines/custom', member, { label: 'x', baseUrl: base }))
        .statusCode,
    ).toBe(403);
  });

  it('refuses public addresses and servers that do not answer', async () => {
    const admin = await signUp('boss', 'admin');
    const pub = await call('POST', '/api/admin/engines/custom', admin, {
      label: 'Public',
      baseUrl: 'http://8.8.8.8/v1',
    });
    expect(pub.statusCode).toBe(400);
    expect(pub.json()).toEqual({ error: { code: 'address_not_allowed' } });
    const dead = await call('POST', '/api/admin/engines/custom', admin, {
      label: 'Dead',
      baseUrl: 'http://127.0.0.1:9/v1',
    });
    expect(dead.statusCode).toBe(400);
    expect(dead.json()).toEqual({ error: { code: 'unreachable' } });
  });

  it('adds a server, offers its models, chats through it, and removes it', async () => {
    const admin = await signUp('boss', 'admin');
    const added = await call('POST', '/api/admin/engines/custom', admin, {
      label: 'LM Studio',
      baseUrl: `${base}/`,
    });
    expect(added.statusCode).toBe(200);
    const engines = AdminEnginesResponse.parse(added.json());
    expect(engines.custom).toHaveLength(1);
    const engine = engines.custom[0];
    if (!engine) throw new Error('no engine');
    expect(engine).toMatchObject({
      label: 'LM Studio',
      baseUrl: base,
      reachable: true,
      models: ['qwen3-14b-instruct', 'llama-9b'],
    });

    const admins = AdminModelsResponse.parse(
      (await call('GET', '/api/admin/models', admin)).json(),
    );
    expect(admins.installedNotOffered).toContainEqual({
      engineModel: 'qwen3-14b-instruct',
      sizeGiB: 0,
      engine: `custom:${engine.id}`,
      engineLabel: 'LM Studio',
    });
    const offered = await call('POST', '/api/admin/models/extra', admin, {
      engineModel: 'qwen3-14b-instruct',
      label: 'Qwen 14B',
      engine: `custom:${engine.id}`,
      vision: false,
      tools: false,
    });
    expect(offered.statusCode).toBe(200);
    const models = ModelsResponse.parse((await call('GET', '/api/models', admin)).json());
    const model = models.chatModels[0];
    expect(model).toMatchObject({ label: { en: 'Qwen 14B' }, cloud: false, provider: null });
    expect(models.defaultChatModel).toBe(model?.id);

    const session = built.auth.resolveSession(admin.split('=')[1] ?? '');
    if (!session || !model) throw new Error('setup');
    const chat = createChatRepo(built.db).createChat(session, model.id);
    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/messages`,
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: admin },
      payload: JSON.stringify({ content: 'Hello' }),
    });
    const evs = res.body
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map((b) => StreamEvent.parse(JSON.parse(b.slice(b.indexOf('data: ') + 6))));
    const done = evs.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('From LM Studio');
    expect(evs.some((e) => e.type === 'loading')).toBe(false);
    expect(ollamaCalls).toEqual([]);
    expect(posted[0]).toMatchObject({ model: 'qwen3-14b-instruct', stream: true });

    const removed = await call('DELETE', `/api/admin/engines/custom/${engine.id}`, admin);
    expect(AdminEnginesResponse.parse(removed.json()).custom).toEqual([]);
    const after = ModelsResponse.parse((await call('GET', '/api/models', admin)).json());
    expect(after.chatModels).toEqual([]);
  });

  it('shows the loading bar while a sleeping server wakes its model', async () => {
    const admin = await signUp('boss', 'admin');
    const added = AdminEnginesResponse.parse(
      (
        await call('POST', '/api/admin/engines/custom', admin, { label: 'Kolibri', baseUrl: base })
      ).json(),
    );
    const engine = added.custom[0];
    if (!engine) throw new Error('no engine');
    await call('POST', '/api/admin/models/extra', admin, {
      engineModel: 'llama-9b',
      label: 'Llama',
      engine: `custom:${engine.id}`,
      vision: false,
      tools: false,
    });
    const model = ModelsResponse.parse((await call('GET', '/api/models', admin)).json())
      .chatModels[0];
    const session = built.auth.resolveSession(admin.split('=')[1] ?? '');
    if (!session || !model) throw new Error('setup');
    const chat = createChatRepo(built.db).createChat(session, model.id);
    sleeping = true;
    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/messages`,
      headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: admin },
      payload: JSON.stringify({ content: 'Hello' }),
    });
    const evs = res.body
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map((b) => StreamEvent.parse(JSON.parse(b.slice(b.indexOf('data: ') + 6))));
    expect(evs.find((e) => e.type === 'loading')).toMatchObject({
      modelId: model.id,
      expectedMs: 3000,
    });
    const done = evs.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('From LM Studio');
  });

  it('allows at most five servers', async () => {
    const admin = await signUp('boss', 'admin');
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/admin/engines/custom', admin, {
        label: `S${String(i)}`,
        baseUrl: base,
      });
      expect(r.statusCode).toBe(200);
    }
    const sixth = await call('POST', '/api/admin/engines/custom', admin, {
      label: 'S6',
      baseUrl: base,
    });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json()).toEqual({ error: { code: 'too_many' } });
  });
});
