import { afterEach, describe, expect, it } from 'vitest';
import { AdminModelsResponse, CatalogResponse, PullEvent, StartPullResponse } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, LlmClient, PullProgress } from '../llm/types.ts';
import { createModelRegistry } from '../models/registry.ts';
import { optimisticCapabilities, staticCapabilities } from '../system/capabilities.ts';

const ORIGIN = 'http://localhost:5173';
let built: App | undefined;
afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

async function setup(memoryGiB: number, diskFreeGiB = 500) {
  const installed: { model: string; sizeGiB: number }[] = [];
  const llm: LlmClient = {
    async *chat(): AsyncGenerator<ChatChunk> {
      await Promise.resolve();
      yield { type: 'done', promptTokens: 0, outputTokens: 0, loadMs: 0 };
    },
    loaded: () => Promise.resolve([]),
    unload: () => Promise.resolve(),
    capabilities: () => Promise.resolve({ vision: true, thinking: true, tools: true }),
    installed: () => Promise.resolve(installed),
    async *pull(model: string): AsyncGenerator<PullProgress> {
      await Promise.resolve();
      yield { status: 'pulling', completed: 10, total: 100 };
      installed.push({ model, sizeGiB: 4 });
      yield { status: 'success', completed: 100, total: 100 };
    },
  };
  const config = loadConfig({ NODE_ENV: 'test' });
  const b = await buildApp(config, {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    capabilities: staticCapabilities({
      ...optimisticCapabilities('darwin', 'arm64'),
      memoryGiB,
      diskFreeGiB,
    }),
    registryFactory: (overrides) =>
      createModelRegistry({
        models: { ...config.models, chatModels: [], defaultChatModel: null },
        llm,
        overrides: () => overrides.get(),
      }),
  });
  built = b;
  const invite = b.auth.createInvite({ role: 'admin', restricted: false, createdBy: null });
  const res = await b.app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({
      code: invite.code,
      username: 'boss',
      password: 'blue tractor sings loudly',
    }),
  });
  const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) =>
    b.app.inject({
      method,
      url,
      headers: { origin: ORIGIN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { payload: JSON.stringify(body) } : {}),
    });
  return { call };
}

describe('model catalogue', () => {
  it.each([
    [32, 'gemma4:26b'],
    [24, 'gemma4:12b'],
    [16, 'gemma4:12b'],
    [12, 'gemma4:e2b'],
    [8, 'qwen3:4b-instruct'],
  ])('recommends one model for %i GB', async (memoryGiB, model) => {
    const { call } = await setup(memoryGiB);
    const cat = CatalogResponse.parse((await call('GET', '/api/admin/catalog')).json());
    expect(cat.entries.filter((e) => e.recommended).map((e) => e.ollamaModel)).toEqual([model]);
    for (const e of cat.entries) expect(e.fits).toBe(e.minTotalMemoryGiB <= memoryGiB);
  });
});

describe('model downloads', () => {
  it('downloads a model with progress and offers it', async () => {
    const { call } = await setup(16);
    const bad = await call('POST', '/api/admin/models/pulls', { model: 'Bad Name!' });
    expect(bad.statusCode).toBe(400);
    const started = await call('POST', '/api/admin/models/pulls', { model: 'gemma4:e2b' });
    expect(started.statusCode).toBe(202);
    const { pullId } = StartPullResponse.parse(started.json());
    const res = await call('GET', `/api/admin/models/pulls/${pullId}/events`);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = res.body
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map((b) => PullEvent.parse(JSON.parse(b.slice(b.indexOf('data: ') + 6))));
    expect(events.at(-1)).toEqual({ type: 'done', modelId: 'x-gemma4-e2b' });
    const admin = AdminModelsResponse.parse((await call('GET', '/api/admin/models')).json());
    expect(admin.models.find((m) => m.id === 'x-gemma4-e2b')).toMatchObject({
      label: { en: 'gemma4 E2B' },
      enabled: true,
      custom: true,
    });
    const cat = CatalogResponse.parse((await call('GET', '/api/admin/catalog')).json());
    expect(cat.entries.find((e) => e.ollamaModel === 'gemma4:e2b')?.installed).toBe(true);
  });

  it('refuses a download when the disk is too full', async () => {
    const { call } = await setup(16, 6);
    const res = await call('POST', '/api/admin/models/pulls', { model: 'gemma4:e2b' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'disk_full' } });
  });

  it('answers 404 for unknown pulls', async () => {
    const { call } = await setup(16);
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await call('GET', `/api/admin/models/pulls/${id}/events`)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/admin/models/pulls/${id}`)).statusCode).toBe(404);
  });
});
