/**
 * Admin-added local model servers (P1.7): label and base URL, stored in the settings table
 * under `engines` ({ custom: [...] }). The address rule and the connection are in
 * security/localengine.ts; this file only stores and lists.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db/database.ts';
import type { FetchLike } from '@hemmia/providers';

export const CustomEngine = z.object({
  id: z.string().regex(/^[a-z0-9]{8}$/),
  label: z.string().min(1).max(40),
  baseUrl: z.string().min(8).max(200),
});
export type CustomEngine = z.infer<typeof CustomEngine>;

const EnginesSetting = z.object({ custom: z.array(CustomEngine).default([]) });

const KEY = 'engines';
// 32 characters, so each random byte maps evenly (no modulo bias).
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function newEngineId(): string {
  return [...randomBytes(8)].map((b) => ID_ALPHABET[b & 31]).join('');
}

export function createEngineStore(db: DB, now: () => number = Date.now) {
  function read(): CustomEngine[] {
    const row = db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(KEY);
    if (!row) return [];
    const parsed = EnginesSetting.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data.custom : [];
  }
  function write(custom: CustomEngine[]): void {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(KEY, JSON.stringify(EnginesSetting.parse({ custom })), now());
  }
  return {
    list: read,
    get: (id: string): CustomEngine | null => read().find((e) => e.id === id) ?? null,
    add(engine: Omit<CustomEngine, 'id'>): CustomEngine {
      const created = { id: newEngineId(), ...engine };
      write([...read(), created]);
      return created;
    },
    remove(id: string): boolean {
      const all = read();
      if (!all.some((e) => e.id === id)) return false;
      write(all.filter((e) => e.id !== id));
      return true;
    },
  };
}
export type EngineStore = ReturnType<typeof createEngineStore>;

const ModelList = z.object({
  data: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9._:/@-]{1,100}$/) }).loose()).max(500),
});

/** The model ids a Chat Completions server offers (GET <base>/models). Throws when it doesn't answer. */
export async function listEngineModels(
  fetchImpl: FetchLike,
  baseUrl: string,
  timeoutMs = 5000,
): Promise<string[]> {
  const res = await fetchImpl(`${baseUrl}/models`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error('engine answered with an error');
  }
  const body: unknown = await res.json();
  const parsed = ModelList.safeParse(body);
  if (!parsed.success) throw new Error('engine sent no model list');
  return [...new Set(parsed.data.data.map((m) => m.id))].slice(0, 200);
}

const Props = z.object({ is_sleeping: z.boolean().optional() }).loose();

/**
 * Whether a local server has unloaded its model to save memory (llama.cpp's
 * --sleep-idle-seconds, reported by GET <server>/props). False when it can't tell.
 */
export async function engineSleeping(
  fetchImpl: FetchLike,
  baseUrl: string,
  timeoutMs = 2000,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/v1$/, '')}/props`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return false;
    }
    const parsed = Props.safeParse(await res.json());
    return parsed.success && parsed.data.is_sleeping === true;
  } catch {
    return false;
  }
}
