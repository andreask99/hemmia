/**
 * In-memory rate limiting (one server process, so no shared store needed).
 * Owned by Claude; see docs/SECURITY.md "Authentication and accounts".
 */

export interface RateLimitResult {
  allowed: boolean;
  /** When not allowed: milliseconds until the next attempt is allowed. */
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  /** Attempts allowed per window. */
  max: number;
  windowMs: number;
  /**
   * With backoff, reaching `max` blocks the key for windowMs, and each further time it
   * reaches `max` doubles the block (up to maxBlockMs). The escalation resets after a
   * quiet period of maxBlockMs, or on reset().
   */
  backoff?: boolean;
  maxBlockMs?: number;
  now?: () => number;
}

interface Entry {
  hits: number[];
  blockedUntil: number;
  /** How many times the key has been blocked (for backoff). */
  blocks: number;
  lastHit: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { max, windowMs } = options;
  const now = options.now ?? Date.now;
  const maxBlockMs = options.maxBlockMs ?? 24 * 60 * 60_000;
  const entries = new Map<string, Entry>();

  function entry(key: string, t: number): Entry {
    let e = entries.get(key);
    if (!e) {
      e = { hits: [], blockedUntil: 0, blocks: 0, lastHit: 0 };
      entries.set(key, e);
    }
    e.hits = e.hits.filter((h) => h > t - windowMs);
    if (
      e.blocks > 0 &&
      e.blockedUntil <= t &&
      t - Math.max(e.lastHit, e.blockedUntil) >= maxBlockMs
    ) {
      e.blocks = 0;
    }
    return e;
  }

  function status(e: Entry, t: number): RateLimitResult {
    if (e.blockedUntil > t) return { allowed: false, retryAfterMs: e.blockedUntil - t };
    if (e.hits.length >= max) {
      const oldest = e.hits[0] ?? t;
      return { allowed: false, retryAfterMs: oldest + windowMs - t };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  // Keep memory bounded: forget idle keys now and then.
  let lastSweep = 0;
  function sweep(t: number): void {
    if (t - lastSweep < windowMs) return;
    lastSweep = t;
    for (const [key, e] of entries) {
      const idle = e.blockedUntil <= t && e.hits.every((h) => h <= t - windowMs);
      if (idle && (e.blocks === 0 || t - Math.max(e.lastHit, e.blockedUntil) >= maxBlockMs)) {
        entries.delete(key);
      }
    }
  }

  return {
    /** Whether an attempt would be allowed now, without recording one. */
    check(key: string): RateLimitResult {
      const t = now();
      sweep(t);
      return status(entry(key, t), t);
    },

    /**
     * Records an attempt (or a failure, for failure-only limits) if allowed, and says
     * whether it was allowed. Attempts made while blocked are not recorded.
     */
    hit(key: string): RateLimitResult {
      const t = now();
      sweep(t);
      const e = entry(key, t);
      const before = status(e, t);
      if (!before.allowed) return before;
      e.hits.push(t);
      e.lastHit = t;
      if (options.backoff && e.hits.length >= max) {
        e.blockedUntil = t + Math.min(windowMs * 2 ** e.blocks, maxBlockMs);
        e.blocks++;
        e.hits = [];
      }
      return { allowed: true, retryAfterMs: 0 };
    },

    /** Clears a key, e.g. after a successful login. */
    reset(key: string): void {
      entries.delete(key);
    },

    size(): number {
      return entries.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
