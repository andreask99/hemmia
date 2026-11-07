/**
 * Model memory planning. The Mac has 32 GB of unified memory: one large model, or a small
 * chat model plus the image model, fits; two large models don't. Before a job runs, the
 * scheduler asks the engines what is loaded and unloads whatever doesn't fit next to the
 * model the job needs. Owned by Claude.
 */

/** A model in memory (or about to be), as the memory planner sees it. */
export interface Resident {
  /** Engine that holds it, e.g. 'ollama' or 'imagegen'. */
  engine: string;
  /** Engine-specific model name, e.g. 'qwen3-vl:8b' or 'z-image-turbo'. */
  model: string;
  memoryGiB: number;
  /** Last time a job used it (ms); older ones are unloaded first. */
  lastUsedAt: number;
}

export interface Need {
  engine: string;
  model: string;
  memoryGiB: number;
}

const same = (a: { engine: string; model: string }, b: { engine: string; model: string }) =>
  a.engine === b.engine && a.model === b.model;

/**
 * The model can't be loaded right now: kchat is paused by an admin, or models kchat doesn't
 * own (e.g. a coding model used by local-dev) leave too little room. Nothing was unloaded.
 */
export class MemoryUnavailableError extends Error {
  override name = 'MemoryUnavailableError';
  readonly code: 'paused' | 'machine_busy';
  constructor(code: 'paused' | 'machine_busy') {
    super(code);
    this.code = code;
  }
}

/**
 * Which residents to unload so `need` fits in `budgetGiB` next to what stays. Least
 * recently used first. The needed model itself is never unloaded, and neither are models
 * kchat doesn't own (`owns` false): they count against the budget, and if they alone
 * leave too little room, MemoryUnavailableError('machine_busy') is thrown. A model larger
 * than the budget still runs when kchat's own models are the only other residents.
 */
export function planUnloads(
  residents: readonly Resident[],
  need: Need,
  budgetGiB: number,
  owns: (r: Resident) => boolean = () => true,
): Resident[] {
  const others = residents
    .filter((r) => !same(r, need))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const foreignGiB = others.filter((r) => !owns(r)).reduce((sum, r) => sum + r.memoryGiB, 0);
  if (foreignGiB > 0 && need.memoryGiB + foreignGiB > budgetGiB) {
    throw new MemoryUnavailableError('machine_busy');
  }
  let total = need.memoryGiB + others.reduce((sum, r) => sum + r.memoryGiB, 0);
  const unload: Resident[] = [];
  for (const r of others) {
    if (total <= budgetGiB) break;
    if (!owns(r)) continue;
    unload.push(r);
    total -= r.memoryGiB;
  }
  return unload;
}

/** An engine that can report and drop its loaded models. */
export interface EngineControl {
  name: string;
  /** Models this engine currently holds in memory, with their real sizes if known. */
  loaded(): Promise<{ model: string; memoryGiB: number }[]>;
  unload(model: string): Promise<void>;
}

export interface MemoryManagerOptions {
  engines: readonly EngineControl[];
  budgetGiB: number;
  now?: () => number;
  /** Whether kchat may unload this model. Default: all (tests, single-purpose machines). */
  owns?: (engine: string, model: string) => boolean;
  /** True while an admin has paused kchat: no model is loaded. */
  paused?: () => boolean;
}

export function createMemoryManager(options: MemoryManagerOptions) {
  const now = options.now ?? Date.now;
  const lastUsed = new Map<string, number>();
  const key = (engine: string, model: string) => `${engine}\u0000${model}`;
  const owns = (r: { engine: string; model: string }) => options.owns?.(r.engine, r.model) ?? true;

  async function residents(): Promise<Resident[]> {
    const list: Resident[] = [];
    for (const engine of options.engines) {
      for (const m of await engine.loaded()) {
        list.push({
          engine: engine.name,
          model: m.model,
          memoryGiB: m.memoryGiB,
          lastUsedAt: lastUsed.get(key(engine.name, m.model)) ?? 0,
        });
      }
    }
    return list;
  }

  return {
    /**
     * Frees memory for `need` by unloading other models; returns what was unloaded.
     * Throws MemoryUnavailableError when paused or when foreign models leave no room.
     */
    async prepare(need: Need): Promise<Resident[]> {
      if (options.paused?.()) throw new MemoryUnavailableError('paused');
      const unload = planUnloads(await residents(), need, options.budgetGiB, owns);
      for (const r of unload) {
        const engine = options.engines.find((e) => e.name === r.engine);
        await engine?.unload(r.model);
      }
      lastUsed.set(key(need.engine, need.model), now());
      return unload;
    },

    /** Unloads every model kchat owns (pause); returns what was unloaded. */
    async releaseOwned(): Promise<Resident[]> {
      const mine = (await residents()).filter(owns);
      for (const r of mine) {
        await options.engines.find((e) => e.name === r.engine)?.unload(r.model);
      }
      return mine;
    },

    /** Unloads a model right away (for models that must not stay resident). */
    async release(need: Need): Promise<void> {
      const engine = options.engines.find((e) => e.name === need.engine);
      await engine?.unload(need.model);
    },
  };
}

export type MemoryManager = ReturnType<typeof createMemoryManager>;
