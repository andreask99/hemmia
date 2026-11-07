import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AdminModelsResponse, ModelsResponse } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { LlmError } from '../llm/types.ts';
import { createModelRegistry } from '../models/registry.ts';

const ORIGIN = 'http://localhost:5173';
let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  const config = loadConfig({ NODE_ENV: 'test' });
  built = await buildApp(config, {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    registryFactory: (overrides) =>
      createModelRegistry({
        models: config.models,
        llm: {
          capabilities: () => Promise.resolve({ vision: true, thinking: false, tools: false }),
          installed: () =>
            Promise.resolve([
              { model: 'gemma4:26b', sizeGiB: 17 },
              { model: 'llama9:8b', sizeGiB: 4.6 },
            ]),
        },
        overrides: () => overrides.get(),
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

const call = (method: 'GET' | 'PUT', url: string, cookie: string, body?: unknown) =>
  app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { payload: JSON.stringify(body) } : {}),
  });

describe('admin model settings', () => {
  it('is admin only', async () => {
    const member = await signUp('ben', 'member');
    expect((await call('GET', '/api/admin/models', member)).statusCode).toBe(403);
    expect(
      (
        await call('PUT', '/api/admin/models', member, {
          disabled: [],
          defaultChatModel: 'gemma4-26b',
          defaultImageModel: null,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('switches models off, changes defaults, and turns images off for everyone', async () => {
    const boss = await signUp('boss', 'admin');
    const member = await signUp('ben', 'member');
    const before = AdminModelsResponse.parse((await call('GET', '/api/admin/models', boss)).json());
    expect(before.defaultChatModel).toBe('gemma4-26b');

    const res = await call('PUT', '/api/admin/models', boss, {
      disabled: ['qwen3-coder-30b'],
      defaultChatModel: 'gemma4-12b',
      defaultImageModel: null,
    });
    expect(res.statusCode).toBe(200);
    const after = AdminModelsResponse.parse(res.json());
    expect(after.models.find((m) => m.id === 'qwen3-coder-30b')?.enabled).toBe(false);
    expect(after.defaultChatModel).toBe('gemma4-12b');
    expect(after.defaultImageModel).toBeNull();

    const seen = ModelsResponse.parse((await call('GET', '/api/models', member)).json());
    expect(seen.chatModels.map((m) => m.id)).not.toContain('qwen3-coder-30b');
    expect(seen.defaultChatModel).toBe('gemma4-12b');
    expect(seen.imageModels).toEqual([]);
  });

  it('rejects unknown models and a default that is switched off', async () => {
    const boss = await signUp('boss', 'admin');
    const put = (body: unknown) => call('PUT', '/api/admin/models', boss, body);
    expect(
      (await put({ disabled: ['nope'], defaultChatModel: 'gemma4-26b', defaultImageModel: null }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await put({
          disabled: ['gemma4-26b'],
          defaultChatModel: 'gemma4-26b',
          defaultImageModel: null,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await put({ disabled: [], defaultChatModel: 'gemma4-26b', defaultImageModel: 'nope' }))
        .statusCode,
    ).toBe(400);
  });
});

describe('adding installed models', () => {
  it('offers installed models and lets an admin add and remove them', async () => {
    const boss = await signUp('boss', 'admin');
    const member = await signUp('ben', 'member');
    const view = AdminModelsResponse.parse((await call('GET', '/api/admin/models', boss)).json());
    expect(view.installedNotOffered).toEqual([
      { engineModel: 'llama9:8b', sizeGiB: 4.6, engine: 'ollama', engineLabel: null },
    ]);

    const add = await app.inject({
      method: 'POST',
      url: '/api/admin/models/extra',
      headers: { origin: ORIGIN, cookie: boss, 'content-type': 'application/json' },
      payload: JSON.stringify({ engineModel: 'llama9:8b', label: 'Llama 9' }),
    });
    const added = AdminModelsResponse.parse(add.json());
    const extra = added.models.find((m) => m.custom);
    expect(extra?.label.en).toBe('Llama 9');
    expect(added.installedNotOffered).toEqual([]);
    const seen = ModelsResponse.parse((await call('GET', '/api/models', member)).json());
    expect(seen.chatModels.some((m) => m.engineModel === 'llama9:8b')).toBe(true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/models/extra/${extra?.id ?? 'x'}`,
      headers: { origin: ORIGIN, cookie: boss },
    });
    expect(AdminModelsResponse.parse(del.json()).models.some((m) => m.custom)).toBe(false);
  });

  it('refuses models that are not installed', async () => {
    const boss = await signUp('boss', 'admin');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/models/extra',
      headers: { origin: ORIGIN, cookie: boss, 'content-type': 'application/json' },
      payload: JSON.stringify({ engineModel: 'not-here:1b', label: 'X' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses a model Ollama cannot run, and offers it when the check fails otherwise', async () => {
    await app.close();
    const config = loadConfig({ NODE_ENV: 'test' });
    const checked: string[] = [];
    built = await buildApp(config, {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      llm: {
        chat: () => {
          throw new Error('unused');
        },
        loaded: () => Promise.resolve([]),
        unload: () => Promise.resolve(),
        capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
        installed: () => Promise.resolve([]),
        check: (model) => {
          checked.push(model);
          return Promise.reject(
            new LlmError(model === 'kolibri:78b' ? 'model_unsupported' : 'unavailable'),
          );
        },
      },
      registryFactory: (overrides) =>
        createModelRegistry({
          models: config.models,
          llm: {
            capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: false }),
            installed: () =>
              Promise.resolve([
                { model: 'kolibri:78b', sizeGiB: 23 },
                { model: 'llama9:8b', sizeGiB: 4.6 },
              ]),
          },
          overrides: () => overrides.get(),
        }),
    });
    app = built.app;
    const boss = await signUp('boss', 'admin');
    const add = (engineModel: string) =>
      app.inject({
        method: 'POST',
        url: '/api/admin/models/extra',
        headers: { origin: ORIGIN, cookie: boss, 'content-type': 'application/json' },
        payload: JSON.stringify({ engineModel, label: 'X' }),
      });

    const refused = await add('kolibri:78b');
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: { code: 'model_unsupported' } });
    const ok = await add('llama9:8b');
    expect(ok.statusCode).toBe(200);
    const view = AdminModelsResponse.parse(ok.json());
    expect(view.models.filter((m) => m.custom)).toHaveLength(1);
    expect(view.installedNotOffered.map((m) => m.engineModel)).toEqual(['kolibri:78b']);
    expect(checked).toEqual(['kolibri:78b', 'llama9:8b']);
  });
});

describe('pause', () => {
  it('lets only admins pause and resume, and members see it', async () => {
    const boss = await signUp('boss', 'admin');
    const member = await signUp('ben', 'member');
    const put = (cookie: string, body: unknown) =>
      app.inject({
        method: 'PUT',
        url: '/api/admin/pause',
        headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
        payload: JSON.stringify(body),
      });
    expect((await put(member, { paused: true })).statusCode).toBe(403);
    expect((await put(boss, { paused: 'yes' })).statusCode).toBe(400);

    const res = await put(boss, { paused: true });
    expect(res.json()).toEqual({ paused: true });
    expect(ModelsResponse.parse((await call('GET', '/api/models', member)).json()).paused).toBe(
      true,
    );

    await put(boss, { paused: false });
    expect(ModelsResponse.parse((await call('GET', '/api/models', member)).json()).paused).toBe(
      false,
    );
  });
});

describe('loaded models', () => {
  it('marks the models that are in memory as ready', async () => {
    await app.close();
    const config = loadConfig({ NODE_ENV: 'test' });
    built = await buildApp(config, {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      llm: {
        chat: () => {
          throw new Error('unused');
        },
        loaded: () => Promise.resolve([{ model: 'gemma4:26b', memoryGiB: 19 }]),
        unload: () => Promise.resolve(),
        capabilities: () => Promise.resolve({ vision: true, thinking: true, tools: true }),
        installed: () => Promise.resolve([]),
      },
      registryFactory: (overrides) =>
        createModelRegistry({
          models: config.models,
          llm: {
            capabilities: () => Promise.resolve({ vision: true, thinking: true, tools: true }),
          },
          overrides: () => overrides.get(),
        }),
    });
    app = built.app;
    const member = await signUp('ben', 'member');
    const seen = ModelsResponse.parse((await call('GET', '/api/models', member)).json());
    expect(seen.loaded).toEqual(['gemma4-26b']);
  });
});
