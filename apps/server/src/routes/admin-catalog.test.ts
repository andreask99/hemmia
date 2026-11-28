import { afterEach, describe, expect, it } from 'vitest';
import {
  AdminModelsResponse,
  CatalogResponse,
  InstalledModelsResponse,
  ModelUpdatesResponse,
  PullEvent,
  StartPullResponse,
} from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, LlmClient, PullProgress } from '../llm/types.ts';
import { remoteModel } from '../models/catalog-fixtures.ts';
import { createCatalogStore } from '../models/catalog.ts';
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
    remove: (model: string) => {
      installed.splice(
        installed.findIndex((m) => m.model === model),
        1,
      );
      return Promise.resolve();
    },
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
  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) =>
    b.app.inject({
      method,
      url,
      headers: { origin: ORIGIN, cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { payload: JSON.stringify(body) } : {}),
    });
  /** Downloads a model through the API and waits until it is done. */
  const download = async (model: string) => {
    const started = await call('POST', '/api/admin/models/pulls', { model });
    const { pullId } = StartPullResponse.parse(started.json());
    await call('GET', `/api/admin/models/pulls/${pullId}/events`);
  };
  return { call, download, built: b, installed };
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
      label: { en: 'Gemma 4 E2B' },
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

describe('model updates', () => {
  async function withCatalogue() {
    const t = await setup(32);
    createCatalogStore(t.built.db).set({
      v: 1,
      signedAt: 1,
      entries: [
        remoteModel('qwen3.9:27b', { minTotalMemoryGiB: 32 }),
        remoteModel('qwen3.8:27b', { minTotalMemoryGiB: 32, version: '3.8' }),
      ],
    });
    return t;
  }

  it('lists remote catalogue models with popularity and newness', async () => {
    const { call } = await withCatalogue();
    const cat = CatalogResponse.parse((await call('GET', '/api/admin/catalog')).json());
    const q = cat.entries.find((e) => e.ollamaModel === 'qwen3.9:27b');
    expect(q).toMatchObject({ fits: true, popularRank: 1, releasedAt: '2026-11-01' });
    expect(cat.entries.find((e) => e.ollamaModel === 'gemma4:26b')?.popularRank).toBeNull();
  });

  it('offers the newer version, switches over and deletes the old one', async () => {
    const { call, download, installed } = await withCatalogue();
    await download('qwen3.8:27b');
    let u = ModelUpdatesResponse.parse((await call('GET', '/api/admin/models/updates')).json());
    expect(u.updates.map((x) => [x.from, x.to, x.kind, x.installed])).toEqual([
      ['qwen3.8:27b', 'qwen3.9:27b', 'version', false],
    ]);

    await download('qwen3.9:27b');
    const r = await call('POST', '/api/admin/models/replace', {
      from: 'qwen3.8:27b',
      to: 'qwen3.9:27b',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ modelId: 'x-qwen3-9-27b' });
    u = ModelUpdatesResponse.parse((await call('GET', '/api/admin/models/updates')).json());
    expect(u.updates).toEqual([]);

    const list = InstalledModelsResponse.parse(
      (await call('GET', '/api/admin/models/installed')).json(),
    );
    expect(list.models.find((m) => m.model === 'qwen3.8:27b')?.offeredId).toBeNull();
    expect(
      (await call('POST', '/api/admin/models/remove', { model: 'qwen3.8:27b' })).statusCode,
    ).toBe(204);
    expect(installed.map((m) => m.model)).toEqual(['qwen3.9:27b']);
    // The last local model stays.
    const last = await call('POST', '/api/admin/models/remove', { model: 'qwen3.9:27b' });
    expect(last.json()).toEqual({ error: { code: 'last_model' } });
  });

  it('puts an update off and switches the daily check', async () => {
    const { call, download } = await withCatalogue();
    await download('qwen3.8:27b');
    const u = ModelUpdatesResponse.parse((await call('GET', '/api/admin/models/updates')).json());
    expect(u.catalogCheck).toBe(true);
    const key = u.updates[0]?.key ?? '';
    expect((await call('POST', '/api/admin/models/updates/dismiss', { key })).statusCode).toBe(204);
    expect((await call('PUT', '/api/admin/models/catalog-check', { on: false })).statusCode).toBe(
      204,
    );
    const after = ModelUpdatesResponse.parse(
      (await call('GET', '/api/admin/models/updates')).json(),
    );
    expect(after.updates).toEqual([]);
    expect(after.catalogCheck).toBe(false);
  });

  it('downloads library models only', async () => {
    const { call } = await setup(32);
    for (const model of ['someone/model:latest', 'gpt-oss:120b-cloud']) {
      const res = await call('POST', '/api/admin/models/pulls', { model });
      expect(res.statusCode).toBe(400);
    }
  });
});
