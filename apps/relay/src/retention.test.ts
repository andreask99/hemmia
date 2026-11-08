import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { HUB_IDLE_MS, pruneRelay } from './retention.ts';

const NOW = Date.UTC(2026, 10, 7, 12);
const DAY = 24 * 60 * 60_000;

function setup() {
  const db = openDb(':memory:');
  const hub = db.prepare(
    'INSERT INTO hubs (id, public_key, created_at, created_ip, last_connected_at, blocked_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  hub.run('activehub000', Buffer.alloc(32, 1), NOW - 400 * DAY, '203.0.113.0/24', NOW - DAY, null);
  hub.run(
    'idlehub00000',
    Buffer.alloc(32, 2),
    NOW - 800 * DAY,
    '203.0.113.0/24',
    NOW - HUB_IDLE_MS - DAY,
    null,
  );
  hub.run(
    'neverconnect',
    Buffer.alloc(32, 3),
    NOW - HUB_IDLE_MS - DAY,
    '203.0.113.0/24',
    null,
    null,
  );
  hub.run(
    'blockedhub00',
    Buffer.alloc(32, 4),
    NOW - 800 * DAY,
    '203.0.113.0/24',
    null,
    NOW - 700 * DAY,
  );
  const usage = db.prepare('INSERT INTO usage (hub_id, month, bytes) VALUES (?, ?, ?)');
  for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) usage.run('activehub000', m, 100);
  usage.run('idlehub00000', '2026-11', 5);
  const order = db.prepare(
    "INSERT INTO cert_orders (id, hub_id, status, csr, created_at) VALUES (?, 'activehub000', 'ready', ?, ?)",
  );
  order.run('old-order', Buffer.alloc(1), NOW - 8 * DAY);
  order.run('new-order', Buffer.alloc(1), NOW - DAY);
  return db;
}

describe('relay retention', () => {
  it('keeps three months of byte counts and deletes hubs idle for a year, but not blocked ones', () => {
    const db = setup();
    expect(pruneRelay(db, NOW)).toEqual({ hubs: 2, usage: 1 });
    const hubs = db.prepare('SELECT id FROM hubs ORDER BY id').all() as { id: string }[];
    expect(hubs.map((h) => h.id)).toEqual(['activehub000', 'blockedhub00']);
    const months = db
      .prepare("SELECT month FROM usage WHERE hub_id = 'activehub000' ORDER BY month")
      .all() as { month: string }[];
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM usage WHERE hub_id = 'idlehub00000'").get(),
    ).toEqual({ n: 0 });
  });

  it('deletes certificate orders after 7 days', () => {
    const db = setup();
    pruneRelay(db, NOW);
    const ids = db.prepare<[], { id: string }>('SELECT id FROM cert_orders').all();
    expect(ids.map((r) => r.id)).toEqual(['new-order']);
  });

  it('crosses the year boundary', () => {
    const db = setup();
    const jan = Date.UTC(2027, 0, 15);
    db.prepare(
      "INSERT INTO usage (hub_id, month, bytes) VALUES ('activehub000', '2026-12', 1), ('activehub000', '2027-01', 1)",
    ).run();
    db.prepare("UPDATE hubs SET last_connected_at = ? WHERE id = 'activehub000'").run(jan);
    pruneRelay(db, jan);
    const months = db.prepare('SELECT month FROM usage ORDER BY month').all() as {
      month: string;
    }[];
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});
