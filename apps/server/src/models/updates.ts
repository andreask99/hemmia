/**
 * New versions of the models a family uses (P11.5, DECISIONS.md 2026-11-21).
 *
 * - **Newer version:** the catalogue has a tag of the same family with a higher version that
 *   fits this computer (qwen3.9:27b for qwen3.8:27b), with the closest parameter count; or a
 *   catalogue entry names the model in `supersedes`.
 * - **New weights:** Ollama re-published the same tag. The registry serves different builds of
 *   a tag to different platforms, so we never compare our own download's digest with the
 *   catalogue's: we remember the catalogue digest we first saw for each model we offer (the
 *   baseline) and report when the catalogue's digest moves away from it.
 *
 * State (baselines, what was announced, what the admin put off) lives in the settings table.
 * Owned by Claude.
 */
import { compareModelVersions, parseModelName } from '@hemmia/relay-protocol';
import { z } from 'zod';
import type { CatalogEntry } from '../config/schema.ts';
import type { DB } from '../db/database.ts';

const KEY = 'model-updates';

const UpdateState = z.object({
  /** Catalogue digest per offered model when we first saw it, or after updating it. */
  baselines: z.record(z.string(), z.string()).default({}),
  /** Update keys already announced (push and notice), so each is announced once. */
  announced: z.array(z.string()).default([]),
  /** Update keys the admin put off with "Later". */
  dismissed: z.array(z.string()).default([]),
  /** An admin hasn't looked at Settings → Models since the last announcement. */
  unseen: z.boolean().default(false),
});
export type UpdateState = z.infer<typeof UpdateState>;

export function createUpdateStateStore(db: DB, now: () => number = Date.now) {
  return {
    get(): UpdateState {
      const row = db
        .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
        .get(KEY);
      try {
        const parsed = UpdateState.safeParse(row ? JSON.parse(row.value) : {});
        return parsed.success ? parsed.data : UpdateState.parse({});
      } catch {
        return UpdateState.parse({});
      }
    },
    set(s: UpdateState): void {
      // Keep the lists bounded: only the latest few hundred keys matter.
      const trimmed = {
        ...s,
        announced: s.announced.slice(-300),
        dismissed: s.dismissed.slice(-300),
      };
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(KEY, JSON.stringify(UpdateState.parse(trimmed)), now());
    },
  };
}
export type UpdateStateStore = ReturnType<typeof createUpdateStateStore>;

export interface ModelUpdate {
  /** The Ollama model in use now. */
  from: string;
  /** The model to download (the same tag for new weights). */
  to: string;
  kind: 'version' | 'weights';
  /** Identifies this update for "announced once" and "Later". */
  key: string;
  entry: CatalogEntry;
  /**
   * The family is offered the new version already (downloaded, but not switched over yet, e.g.
   * an update cut short): listed, so the switch can finish, but not announced.
   */
  alreadyOffered: boolean;
}

/** Normalises "qwen3.8" to "qwen3.8:latest" so names compare. */
export function withTag(model: string): string {
  return model.includes(':') ? model : `${model}:latest`;
}

function closeness(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0;
  return Math.abs(Math.log(a / b));
}

/** The newest catalogue tag that replaces `model` on a computer with `memoryGiB`, or null. */
export function successorOf(
  model: string,
  catalog: readonly CatalogEntry[],
  memoryGiB: number,
): CatalogEntry | null {
  const name = withTag(model);
  const p = parseModelName(name);
  const fits = catalog.filter((e) => e.minTotalMemoryGiB <= memoryGiB);
  const named = fits.filter((e) => e.remote?.supersedes.some((s) => withTag(s) === name));
  const newer = p.version.length
    ? fits.filter((e) => {
        const q = parseModelName(e.ollamaModel);
        return q.family === p.family && compareModelVersions(q.version, p.version) > 0;
      })
    : [];
  const all = [...named, ...newer];
  if (all.length === 0) return null;
  // The highest version, then the closest size (or, size unknown, the biggest that fits).
  let best: CatalogEntry | null = null;
  for (const e of all) {
    if (!best) {
      best = e;
      continue;
    }
    const v = compareModelVersions(
      parseModelName(e.ollamaModel).version,
      parseModelName(best.ollamaModel).version,
    );
    if (v > 0) {
      best = e;
    } else if (v === 0) {
      const de = closeness(parseModelName(e.ollamaModel).paramsB, p.paramsB);
      const db = closeness(parseModelName(best.ollamaModel).paramsB, p.paramsB);
      if (de < db || (de === db && e.minTotalMemoryGiB > best.minTotalMemoryGiB)) best = e;
    }
  }
  return best && withTag(best.ollamaModel) !== name ? best : null;
}

/**
 * Updates for the Ollama models Hemmia offers. Also records baselines for offered models that
 * have none yet (so a model first seen today isn't reported as "new weights").
 */
export function findUpdates(o: {
  offered: readonly string[];
  catalog: readonly CatalogEntry[];
  memoryGiB: number;
  state: UpdateState;
}): { updates: ModelUpdate[]; baselines: Record<string, string> } {
  const baselines = { ...o.state.baselines };
  const updates: ModelUpdate[] = [];
  const offered = new Set(o.offered.map(withTag));
  for (const model of offered) {
    const next = successorOf(model, o.catalog, o.memoryGiB);
    if (next) {
      updates.push({
        from: model,
        to: next.ollamaModel,
        kind: 'version',
        key: `v:${model}>${next.ollamaModel}`,
        entry: next,
        alreadyOffered: offered.has(withTag(next.ollamaModel)),
      });
      continue;
    }
    const same = o.catalog.find((e) => withTag(e.ollamaModel) === model && e.remote);
    const digest = same?.remote?.digest;
    if (!same || !digest) continue;
    const base = baselines[model];
    if (base === undefined) {
      baselines[model] = digest;
    } else if (base !== digest) {
      updates.push({
        from: model,
        to: same.ollamaModel,
        kind: 'weights',
        key: `w:${model}@${digest}`,
        entry: same,
        alreadyOffered: false,
      });
    }
  }
  return { updates, baselines };
}

/**
 * Keeps the update state current and announces each new update once (P11.7): one push to
 * every admin (no content; the app words it) and a dot on Settings until an admin opens
 * Settings → Models. Updates the admin put off ("Later") stay quiet.
 */
export function createUpdateNotices(deps: {
  catalog: () => readonly CatalogEntry[];
  /** Ollama models the family is offered now. */
  offered: () => readonly string[];
  /** Models on disk in Ollama, or null when Ollama can't be asked. */
  installed: () => Promise<readonly string[] | null>;
  memoryGiB: () => number;
  state: UpdateStateStore;
  notifyAdmins: () => Promise<void>;
}) {
  return {
    /** Current updates (not put off). With `announce`, tells the admins about new ones. */
    async refresh(announce: boolean): Promise<ModelUpdate[]> {
      // Only models the family has: a config model that was never downloaded isn't in use.
      const onDisk = await deps.installed().catch(() => null);
      if (onDisk === null) return [];
      const have = new Set(onDisk.map(withTag));
      const s = deps.state.get();
      const { updates, baselines } = findUpdates({
        offered: deps.offered().filter((m) => have.has(withTag(m))),
        catalog: deps.catalog(),
        memoryGiB: deps.memoryGiB(),
        state: s,
      });
      const open = updates.filter((u) => !s.dismissed.includes(u.key));
      const fresh = announce
        ? open.filter((u) => !u.alreadyOffered && !s.announced.includes(u.key))
        : [];
      deps.state.set({
        ...s,
        baselines,
        announced: [...s.announced, ...fresh.map((u) => u.key)],
        unseen: s.unseen || fresh.length > 0,
      });
      if (fresh.length > 0) await deps.notifyAdmins().catch(() => undefined);
      return open;
    },
    /** An admin opened Settings → Models. */
    seen(): void {
      const s = deps.state.get();
      if (s.unseen) deps.state.set({ ...s, unseen: false });
    },
    /** "Later": quiet until a newer update comes. */
    dismiss(key: string): void {
      const s = deps.state.get();
      if (!s.dismissed.includes(key)) deps.state.set({ ...s, dismissed: [...s.dismissed, key] });
    },
    unseen: () => deps.state.get().unseen,
  };
}
export type UpdateNotices = ReturnType<typeof createUpdateNotices>;
