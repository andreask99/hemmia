import { describe, expect, it } from 'vitest';
import type { ChatModelConfig } from '../config/schema.ts';
import { openDatabase } from '../db/database.ts';
import { createModelLifecycle, LifecycleError } from './lifecycle.ts';
import { createOverrideStore } from './overrides.ts';
import { createUpdateStateStore } from './updates.ts';

const CONFIG = [
  { id: 'smart', ollamaModel: 'qwen3.8:27b', enabled: true, adultOnly: true },
  { id: 'quick', ollamaModel: 'gemma4:e4b', enabled: true, adultOnly: false },
] as unknown as ChatModelConfig[];

function setup(o: { installed?: string[]; idle?: boolean } = {}) {
  const db = openDatabase(':memory:');
  const overrides = createOverrideStore(db);
  const updateState = createUpdateStateStore(db);
  let installed = o.installed ?? ['qwen3.8:27b', 'gemma4:e4b', 'qwen3.9:27b'];
  const removed: string[] = [];
  const user = (id: string, model: string | null) =>
    db
      .prepare(
        `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
           recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at,
           password_changed_at, default_model_id)
         VALUES (?, ?, 'member', x'00', x'00', '{}', x'00', x'00', '{}', x'00', 1, 1, ?)`,
      )
      .run(id, id, model);
  user('anna', 'smart');
  user('ben', 'quick');
  for (const [id, uid, model] of [
    ['c1', 'anna', 'smart'],
    ['c2', 'ben', 'smart'],
    ['c3', 'ben', 'quick'],
  ] as const) {
    db.prepare(
      'INSERT INTO chats (id, user_id, model_id, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
    ).run(id, uid, model);
  }
  db.prepare(
    `INSERT INTO agents (id, scope, owner_id, data, model_id, created_at, updated_at)
     VALUES ('a1', 'family', NULL, x'00', 'smart', 1, 1)`,
  ).run();
  overrides.set({ ...overrides.get(), defaultChatModel: 'smart' });

  const lifecycle = createModelLifecycle({
    db,
    overrides,
    configModels: CONFIG,
    llm: {
      installed: () => Promise.resolve(installed.map((model) => ({ model, sizeGiB: 1 }))),
      unload: () => Promise.resolve(),
      remove: (m) => {
        removed.push(m);
        installed = installed.filter((x) => x !== m);
        return Promise.resolve();
      },
    },
    offer: (model) => {
      const cur = overrides.get();
      const id = `x-${model.replace(/[^a-z0-9]+/g, '-')}`;
      overrides.set({
        ...cur,
        extraModels: [
          ...cur.extraModels,
          {
            id,
            engineModel: model,
            label: model,
            memoryGiB: 20,
            engine: 'ollama',
            vision: false,
            tools: false,
            adultOnly: false,
          },
        ],
      });
      return Promise.resolve(id);
    },
    idle: () => o.idle ?? true,
    updateState,
    catalogDigest: (m) => (m === 'qwen3.9:27b' ? 'sha256:new' : null),
  });
  const col = (sql: string) =>
    db
      .prepare<[], { v: string | null }>(sql)
      .all()
      .map((r) => r.v);
  return { db, overrides, updateState, lifecycle, removed, col };
}

describe('replace', () => {
  it('moves every reference to the new model and stops offering the old one', async () => {
    const s = setup();
    const r = await s.lifecycle.replace('qwen3.8:27b', 'qwen3.9:27b');
    expect(r.toId).toBe('x-qwen3-9-27b');
    expect(r.moved).toBe(4); // anna's default, two chats, the family agent
    expect(s.col('SELECT default_model_id AS v FROM users ORDER BY id')).toEqual([
      'x-qwen3-9-27b',
      'quick',
    ]);
    expect(s.col('SELECT model_id AS v FROM chats ORDER BY id')).toEqual([
      'x-qwen3-9-27b',
      'x-qwen3-9-27b',
      'quick',
    ]);
    expect(s.col('SELECT model_id AS v FROM agents')).toEqual(['x-qwen3-9-27b']);
    const o = s.overrides.get();
    expect(o.defaultChatModel).toBe('x-qwen3-9-27b');
    expect(o.disabled).toContain('smart');
    expect(s.updateState.get().baselines['qwen3.9:27b']).toBe('sha256:new');
    expect(s.removed).toEqual([]);
  });

  it('keeps an adults-only model out of teen accounts after the update', async () => {
    const s = setup();
    await s.lifecycle.replace('qwen3.8:27b', 'qwen3.9:27b');
    expect(s.overrides.get().extraModels.find((m) => m.id === 'x-qwen3-9-27b')?.adultOnly).toBe(
      true,
    );
  });

  it('needs the new model downloaded and the old one offered', async () => {
    const s = setup({ installed: ['qwen3.8:27b', 'gemma4:e4b'] });
    await expect(s.lifecycle.replace('qwen3.8:27b', 'qwen3.9:27b')).rejects.toEqual(
      new LifecycleError('not_installed'),
    );
    const t = setup();
    await expect(t.lifecycle.replace('llama3:8b', 'qwen3.9:27b')).rejects.toEqual(
      new LifecycleError('not_offered'),
    );
  });

  it('only moves the baseline for new weights of the same tag', async () => {
    const s = setup();
    const r = await s.lifecycle.replace('qwen3.8:27b', 'qwen3.8:27b');
    expect(r).toEqual({ toId: 'smart', moved: 0 });
    expect(s.col("SELECT model_id AS v FROM chats WHERE id = 'c1'")).toEqual(['smart']);
  });
});

describe('remove', () => {
  it('deletes the model and sends its users to the family default', async () => {
    const s = setup();
    await s.lifecycle.remove('qwen3.8:27b');
    expect(s.removed).toEqual(['qwen3.8:27b']);
    expect(s.col('SELECT default_model_id AS v FROM users ORDER BY id')).toEqual([null, 'quick']);
    expect(s.col('SELECT model_id AS v FROM agents')).toEqual([null]);
    expect(s.overrides.get().defaultChatModel).toBeNull();
    expect(s.overrides.get().disabled).toContain('smart');
  });

  it('refuses while a job runs and for the last local model', async () => {
    const busy = setup({ idle: false });
    await expect(busy.lifecycle.remove('qwen3.8:27b')).rejects.toEqual(new LifecycleError('busy'));
    const s = setup();
    await s.lifecycle.remove('qwen3.8:27b');
    await expect(s.lifecycle.remove('gemma4:e4b')).rejects.toEqual(
      new LifecycleError('last_model'),
    );
    expect(s.removed).toEqual(['qwen3.8:27b']);
  });

  it('deletes a downloaded model nobody was offered', async () => {
    const s = setup();
    await s.lifecycle.remove('qwen3.9:27b');
    expect(s.removed).toEqual(['qwen3.9:27b']);
  });
});
