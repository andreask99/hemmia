/**
 * Relayed bytes per hub and calendar month (RELAY.md §9). Counted in memory and written to the
 * `usage` table every few seconds and on shutdown.
 */
import { monthUtc, type RelayDb } from '../db.ts';

export function createQuota(o: {
  db: RelayDb;
  limitBytes: number;
  now?: () => number;
  flushMs?: number;
}) {
  const now = o.now ?? Date.now;
  const pending = new Map<string, number>();
  const add = o.db.prepare(
    `INSERT INTO usage (hub_id, month, bytes) VALUES (?, ?, ?)
     ON CONFLICT(hub_id, month) DO UPDATE SET bytes = bytes + excluded.bytes`,
  );
  const read = o.db.prepare<[string, string], { bytes: number }>(
    'SELECT bytes FROM usage WHERE hub_id = ? AND month = ?',
  );
  function flush(): void {
    if (pending.size === 0) return;
    const month = monthUtc(now());
    o.db.transaction(() => {
      for (const [hubId, bytes] of pending) add.run(hubId, month, bytes);
    })();
    pending.clear();
  }
  const timer = setInterval(flush, o.flushMs ?? 10_000);
  timer.unref();
  return {
    count(hubId: string, bytes: number): void {
      if (bytes > 0) pending.set(hubId, (pending.get(hubId) ?? 0) + bytes);
    },
    used(hubId: string): number {
      return (read.get(hubId, monthUtc(now()))?.bytes ?? 0) + (pending.get(hubId) ?? 0);
    },
    exceeded(hubId: string): boolean {
      return this.used(hubId) >= o.limitBytes;
    },
    flush,
    close(): void {
      clearInterval(timer);
      flush();
    },
  };
}
export type Quota = ReturnType<typeof createQuota>;
