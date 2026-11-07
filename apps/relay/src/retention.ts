/**
 * Deletion periods the privacy policy promises (hemmia.app/legal/privacy, RELAY.md §10), run
 * hourly: monthly byte counts after 3 months, hubs that haven't connected for 12 months (with
 * their certificate orders and push handles), idle push handles after 90 days, the push rate
 * log after a day. Blocked hubs stay, so a blocked key can't register again. Owned by Claude.
 */
import type { RelayDb } from './db.ts';

const DAY = 24 * 60 * 60_000;
export const HUB_IDLE_MS = 365 * DAY;
export const PUSH_HANDLE_IDLE_MS = 90 * DAY;
/** Byte counts are kept for the current month and the two before it. */
export const USAGE_MONTHS = 3;

/** The UTC month `n` months before the one containing `t`, as YYYY-MM. */
function monthsBefore(t: number, n: number): string {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1)).toISOString().slice(0, 7);
}

export function pruneRelay(db: RelayDb, now = Date.now()): { hubs: number; usage: number } {
  return db.transaction(() => {
    const usage = db
      .prepare('DELETE FROM usage WHERE month < ?')
      .run(monthsBefore(now, USAGE_MONTHS - 1)).changes;
    const idle = db
      .prepare<[number], { id: string }>(
        `SELECT id FROM hubs WHERE blocked_at IS NULL
         AND COALESCE(last_connected_at, created_at) < ?`,
      )
      .all(now - HUB_IDLE_MS);
    for (const h of idle) {
      db.prepare('DELETE FROM usage WHERE hub_id = ?').run(h.id);
      db.prepare('DELETE FROM push_handles WHERE hub_id = ?').run(h.id);
      db.prepare('DELETE FROM cert_orders WHERE hub_id = ?').run(h.id);
      db.prepare('DELETE FROM hubs WHERE id = ?').run(h.id);
    }
    db.prepare('DELETE FROM push_handles WHERE last_used_at < ?').run(now - PUSH_HANDLE_IDLE_MS);
    db.prepare('DELETE FROM push_log WHERE at < ?').run(now - DAY);
    return { hubs: idle.length, usage };
  })();
}
