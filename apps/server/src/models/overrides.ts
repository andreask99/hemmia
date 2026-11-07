/**
 * Admin choices that override config/models.json at runtime: models switched off and the
 * family defaults. Stored in the settings table. They can't switch on a model the config
 * file disables.
 */
import { z } from 'zod';
import { WebSearchMode } from '@hemmia/shared';
import type { DB } from '../db/database.ts';

export const ModelOverrides = z.object({
  disabled: z.array(z.string()).default([]),
  defaultChatModel: z.string().nullable().default(null),
  defaultImageModel: z.string().nullable().default(null),
  /** True when the admin turned image generation off entirely. */
  imagesOff: z.boolean().default(false),
  /** Who may use web search (SearXNG on this Mac). */
  webSearch: WebSearchMode.default('all'),
  /** Who may use cloud models with their own API key (the family switch). */
  cloud: WebSearchMode.default('all'),
  /** An admin paused kchat: no model loads, own models are freed (Mac free for other work). */
  paused: z.boolean().default(false),
  /** Models installed in Ollama that an admin added to the offer. */
  extraModels: z
    .array(
      z.object({
        id: z.string(),
        engineModel: z.string(),
        label: z.string(),
        memoryGiB: z.number(),
        /** "ollama", or "custom:<id>" for a local server (P1.7). */
        engine: z.string().default('ollama'),
        /** Custom engines only (Ollama reports its own). */
        vision: z.boolean().default(false),
        tools: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type ModelOverrides = z.infer<typeof ModelOverrides>;

const KEY = 'models';

export function createOverrideStore(db: DB, now: () => number = Date.now) {
  return {
    get(): ModelOverrides {
      const row = db
        .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
        .get(KEY);
      if (!row) return ModelOverrides.parse({});
      const parsed = ModelOverrides.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : ModelOverrides.parse({});
    },
    set(value: ModelOverrides): void {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(KEY, JSON.stringify(ModelOverrides.parse(value)), now());
    },
  };
}

export type OverrideStore = ReturnType<typeof createOverrideStore>;
