/**
 * Model downloads into Ollama started from the admin UI (P1.8). One at a time; progress is
 * kept in memory and streamed to whoever watches (SSE). A finished pull is remembered for ten
 * minutes so a late watcher still sees how it ended.
 */
import { randomUUID } from 'node:crypto';
import type { PullEvent } from '@hemmia/shared';
import type { CatalogEntry } from '../config/schema.ts';
import { LlmError, type LlmClient } from '../llm/types.ts';

export type PullRefusal = 'busy' | 'paused' | 'disk_full' | 'unavailable';

export class PullRefusedError extends Error {
  override name = 'PullRefusedError';
  readonly code: PullRefusal;
  constructor(code: PullRefusal) {
    super(code);
    this.code = code;
  }
}

/** Free space kept after a download, GiB. */
const DISK_RESERVE_GIB = 5;
const KEEP_FINISHED_MS = 10 * 60_000;

interface Pull {
  id: string;
  model: string;
  controller: AbortController;
  last: PullEvent;
  finished: boolean;
  listeners: Set<(e: PullEvent) => void>;
}

export interface PullDeps {
  llm: Pick<LlmClient, 'pull'>;
  paused: () => boolean;
  /** Free GiB on the disk Ollama writes to (the data dir's volume as an estimate), or null. */
  diskFreeGiB: () => Promise<number | null>;
  catalog: readonly CatalogEntry[];
  /** Offers the downloaded model; returns its model id. */
  offer: (model: string, entry: CatalogEntry | undefined) => Promise<string> | string;
  now?: () => number;
}

export function createPullManager(deps: PullDeps) {
  const now = deps.now ?? Date.now;
  const pulls = new Map<string, Pull>();
  let active: Pull | null = null;
  const isBusy = (): boolean => active !== null;

  function emit(p: Pull, e: PullEvent): void {
    p.last = e;
    for (const l of p.listeners) l(e);
  }

  function finish(p: Pull, e: PullEvent): void {
    emit(p, e);
    p.finished = true;
    p.listeners.clear();
    if (active === p) active = null;
    setTimeout(() => pulls.delete(p.id), KEEP_FINISHED_MS).unref();
  }

  async function run(p: Pull, entry: CatalogEntry | undefined): Promise<void> {
    const pull = deps.llm.pull;
    if (!pull) {
      finish(p, { type: 'error', code: 'unavailable' });
      return;
    }
    let lastSent = 0;
    try {
      for await (const progress of pull(p.model, p.controller.signal)) {
        // At most a few updates a second.
        if (progress.total > 0 && now() - lastSent >= 250) {
          lastSent = now();
          emit(p, { type: 'progress', completed: progress.completed, total: progress.total });
        }
      }
      const modelId = await deps.offer(p.model, entry);
      finish(p, { type: 'done', modelId });
    } catch (err) {
      if (p.controller.signal.aborted) {
        finish(p, { type: 'error', code: 'cancelled' });
      } else if (err instanceof LlmError && err.code === 'model_not_found') {
        finish(p, { type: 'error', code: 'not_found' });
      } else if (err instanceof LlmError && err.code === 'unavailable') {
        finish(p, { type: 'error', code: 'unavailable' });
      } else {
        finish(p, { type: 'error', code: 'failed' });
      }
    }
  }

  return {
    /** Starts a download. Throws PullRefusedError. */
    async start(model: string): Promise<{ pullId: string }> {
      if (active) throw new PullRefusedError('busy');
      if (deps.paused()) throw new PullRefusedError('paused');
      if (!deps.llm.pull) throw new PullRefusedError('unavailable');
      const entry = deps.catalog.find((e) => e.ollamaModel === model);
      const free = await deps.diskFreeGiB().catch(() => null);
      if (free !== null && free < (entry?.downloadGiB ?? 0) + DISK_RESERVE_GIB) {
        throw new PullRefusedError('disk_full');
      }
      // Checked again after the await: two starts can race.
      if (isBusy()) throw new PullRefusedError('busy');
      const p: Pull = {
        id: randomUUID(),
        model,
        controller: new AbortController(),
        last: { type: 'progress', completed: 0, total: 0 },
        finished: false,
        listeners: new Set(),
      };
      pulls.set(p.id, p);
      active = p;
      void run(p, entry);
      return { pullId: p.id };
    },

    /** Calls `listener` with the latest event now and every later one; returns unsubscribe. */
    watch(id: string, listener: (e: PullEvent) => void): (() => void) | null {
      const p = pulls.get(id);
      if (!p) return null;
      listener(p.last);
      if (p.finished) return () => undefined;
      p.listeners.add(listener);
      return () => p.listeners.delete(listener);
    },

    cancel(id: string): boolean {
      const p = pulls.get(id);
      if (!p || p.finished) return false;
      p.controller.abort();
      return true;
    },

    /** The running download, if any. */
    active: () => (active ? { pullId: active.id, model: active.model } : null),
  };
}
export type PullManager = ReturnType<typeof createPullManager>;
