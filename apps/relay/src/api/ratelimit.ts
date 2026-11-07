/** In-memory fixed-window counters (the relay is one process). */
export function createLimiter(o: { max: number; windowMs: number; now?: () => number }) {
  const now = o.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return {
    /** Counts one hit; false when the key is over its limit (the hit is not counted). */
    hit(key: string): boolean {
      const t = now();
      const list = (hits.get(key) ?? []).filter((at) => t - at < o.windowMs);
      if (list.length >= o.max) {
        hits.set(key, list);
        return false;
      }
      list.push(t);
      hits.set(key, list);
      return true;
    },
    /** Whether one more hit would pass, without counting it. */
    allows(key: string): boolean {
      const t = now();
      return (hits.get(key) ?? []).filter((at) => t - at < o.windowMs).length < o.max;
    },
    sweep(): void {
      const t = now();
      for (const [k, list] of hits) {
        const keep = list.filter((at) => t - at < o.windowMs);
        if (keep.length === 0) hits.delete(k);
        else hits.set(k, keep);
      }
    },
  };
}
export type Limiter = ReturnType<typeof createLimiter>;
