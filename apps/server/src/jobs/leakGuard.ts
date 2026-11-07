/**
 * Leak guard: some engine builds leak memory per request (Ollama's MLX runner, issue
 * #18620: about 0.5 GB per reply that ends in a tool call). The engine's reported size
 * grows with it, so kchat watches each loaded model against its size right after loading
 * and unloads it when it grew too much and nothing is running. The next request reloads
 * it cleanly. Owned by Claude.
 */

export interface LeakGuardOptions {
  /** Models in memory with their sizes as the engine reports them (not padded). */
  loaded: () => Promise<{ model: string; memoryGiB: number }[]>;
  unload: (model: string) => Promise<void>;
  /** True when no job is running or waiting. */
  idle: () => boolean;
  /** Whether kchat may unload this model. */
  owns: (model: string) => boolean;
  /** Growth over the size after loading that triggers an unload. */
  growthGiB?: number;
}

export function createLeakGuard(options: LeakGuardOptions) {
  const growth = options.growthGiB ?? 3;
  /** Smallest size seen since each model was loaded (its clean size). */
  const base = new Map<string, number>();

  return {
    /** Checks once; returns the models unloaded with their growth. */
    async check(): Promise<{ model: string; baseGiB: number; nowGiB: number }[]> {
      const loaded = await options.loaded();
      for (const model of [...base.keys()]) {
        if (!loaded.some((m) => m.model === model)) base.delete(model);
      }
      const unloaded: { model: string; baseGiB: number; nowGiB: number }[] = [];
      for (const m of loaded) {
        if (!options.owns(m.model)) continue;
        const clean = Math.min(base.get(m.model) ?? m.memoryGiB, m.memoryGiB);
        base.set(m.model, clean);
        if (m.memoryGiB - clean > growth && options.idle()) {
          await options.unload(m.model);
          base.delete(m.model);
          unloaded.push({ model: m.model, baseGiB: clean, nowGiB: m.memoryGiB });
        }
      }
      return unloaded;
    },
  };
}

export type LeakGuard = ReturnType<typeof createLeakGuard>;
