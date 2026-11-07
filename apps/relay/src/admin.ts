/**
 * Relay administration (RELAY.md §12): list, block and unblock hubs, and counts for `stats`.
 * Used by the CLI. Owned by Claude (blocking decides who may use the relay).
 */
import { isVersion } from '@hemmia/relay-protocol';
import { monthUtc, type RelayDb } from './db.ts';

export interface HubRow {
  id: string;
  createdAt: number;
  lastConnectedAt: number | null;
  blockedAt: number | null;
  blockedReason: string | null;
}

export function listHubs(db: RelayDb, o: { blocked?: boolean } = {}): HubRow[] {
  const rows = db
    .prepare<
      [],
      {
        id: string;
        created_at: number;
        last_connected_at: number | null;
        blocked_at: number | null;
        blocked_reason: string | null;
      }
    >(
      `SELECT id, created_at, last_connected_at, blocked_at, blocked_reason FROM hubs
       ${o.blocked ? 'WHERE blocked_at IS NOT NULL' : ''} ORDER BY created_at`,
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    lastConnectedAt: r.last_connected_at,
    blockedAt: r.blocked_at,
    blockedReason: r.blocked_reason,
  }));
}

/** Blocks a hub (its tunnel is refused from the next connection on). False when unknown. */
export function blockHub(db: RelayDb, id: string, reason: string, now = Date.now()): boolean {
  const clean =
    reason
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 200) || 'blocked';
  return (
    db
      .prepare('UPDATE hubs SET blocked_at = ?, blocked_reason = ? WHERE id = ?')
      .run(now, clean, id).changes === 1
  );
}

export function unblockHub(db: RelayDb, id: string): boolean {
  return (
    db.prepare('UPDATE hubs SET blocked_at = NULL, blocked_reason = NULL WHERE id = ?').run(id)
      .changes === 1
  );
}

export interface RelayStats {
  hubs: number;
  blockedHubs: number;
  /** Hubs seen on the tunnel in the last 24 hours. */
  activeHubs24h: number;
  bytesThisMonth: number;
  certificateOrders24h: number;
  failedOrders24h: number;
  pushes24h: number;
  pushHandles: number;
}

export function stats(db: RelayDb, now = Date.now()): RelayStats {
  const day = now - 24 * 60 * 60_000;
  const n = (sql: string, ...args: (string | number)[]) =>
    db.prepare<(string | number)[], { n: number | null }>(sql).get(...args)?.n ?? 0;
  return {
    hubs: n('SELECT COUNT(*) AS n FROM hubs'),
    blockedHubs: n('SELECT COUNT(*) AS n FROM hubs WHERE blocked_at IS NOT NULL'),
    activeHubs24h: n('SELECT COUNT(*) AS n FROM hubs WHERE last_connected_at > ?', day),
    bytesThisMonth: n('SELECT SUM(bytes) AS n FROM usage WHERE month = ?', monthUtc(now)),
    certificateOrders24h: n('SELECT COUNT(*) AS n FROM cert_orders WHERE created_at > ?', day),
    failedOrders24h: n(
      "SELECT COUNT(*) AS n FROM cert_orders WHERE created_at > ? AND status = 'failed'",
      day,
    ),
    pushes24h: n('SELECT COUNT(*) AS n FROM push_log WHERE at > ?', day),
    pushHandles: n('SELECT COUNT(*) AS n FROM push_handles'),
  };
}

/** The minimum hub version for Connect (P2.17), or null when there is none. */
export function getMinHubVersion(db: RelayDb): string | null {
  const row = db
    .prepare<[], { value: string }>("SELECT value FROM settings WHERE key = 'min_hub_version'")
    .get();
  return row && isVersion(row.value) ? row.value : null;
}

/** Sets (x.y.z) or clears (null) the minimum hub version. */
export function setMinHubVersion(db: RelayDb, version: string | null): void {
  if (version === null) {
    db.prepare("DELETE FROM settings WHERE key = 'min_hub_version'").run();
    return;
  }
  if (!isVersion(version)) throw new Error('not a version');
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('min_hub_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(version);
}
