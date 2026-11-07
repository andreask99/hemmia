import { describe, expect, it } from 'vitest';
import { blockHub, listHubs, stats, unblockHub } from './admin.ts';
import { monthUtc, openDb } from './db.ts';

function db() {
  const d = openDb(':memory:');
  const add = d.prepare(
    'INSERT INTO hubs (id, public_key, created_at, created_ip, last_connected_at) VALUES (?, ?, ?, ?, ?)',
  );
  add.run('aaaaaaaaaaaa', Buffer.alloc(32, 1), 1000, '203.0.113.0/24', null);
  add.run('bbbbbbbbbbbb', Buffer.alloc(32, 2), 2000, '203.0.113.0/24', Date.now());
  return d;
}

describe('relay admin', () => {
  it('lists, blocks and unblocks hubs', () => {
    const d = db();
    expect(listHubs(d).map((h) => h.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(blockHub(d, 'aaaaaaaaaaaa', 'spam\nmore', 5)).toBe(true);
    expect(blockHub(d, 'zzzzzzzzzzzz', 'x')).toBe(false);
    expect(listHubs(d, { blocked: true })).toEqual([
      {
        id: 'aaaaaaaaaaaa',
        createdAt: 1000,
        lastConnectedAt: null,
        blockedAt: 5,
        blockedReason: 'spam more',
      },
    ]);
    expect(unblockHub(d, 'aaaaaaaaaaaa')).toBe(true);
    expect(unblockHub(d, 'zzzzzzzzzzzz')).toBe(false);
    expect(listHubs(d, { blocked: true })).toEqual([]);
  });

  it('counts for stats', () => {
    const d = db();
    d.prepare('INSERT INTO usage (hub_id, month, bytes) VALUES (?, ?, ?)').run(
      'aaaaaaaaaaaa',
      monthUtc(Date.now()),
      500,
    );
    d.prepare('INSERT INTO usage (hub_id, month, bytes) VALUES (?, ?, ?)').run(
      'bbbbbbbbbbbb',
      monthUtc(Date.now()),
      250,
    );
    blockHub(d, 'bbbbbbbbbbbb', 'x');
    expect(stats(d)).toEqual({
      hubs: 2,
      blockedHubs: 1,
      activeHubs24h: 1,
      bytesThisMonth: 750,
      certificateOrders24h: 0,
      failedOrders24h: 0,
      pushes24h: 0,
      pushHandles: 0,
    });
  });
});
