import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type RelayDb } from './db.ts';
import { run } from './cli.ts';

describe('cli', () => {
  let db: RelayDb;

  beforeEach(() => {
    db = openDb(':memory:');
    // Insert two hubs as specified in the task
    const insertHub = db.prepare(
      'INSERT INTO hubs (id, public_key, created_at, created_ip, last_connected_at) VALUES (?, ?, ?, ?, ?)',
    );
    insertHub.run(
      'aaaaaaaaaaaa',
      Buffer.alloc(32, 1),
      Date.UTC(2026, 9, 1),
      '203.0.113.0/24',
      null,
    );
    insertHub.run(
      'bbbbbbbbbbbb',
      Buffer.alloc(32, 2),
      Date.UTC(2026, 9, 2),
      '203.0.113.0/24',
      Date.UTC(2026, 9, 20),
    );
  });

  test('list-hubs prints both hubs with correct format', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (l: string) => {
        out.push(l);
      },
      err: (l: string) => {
        err.push(l);
      },
    };

    const code = run(['list-hubs'], io, db);

    expect(code).toBe(0);
    expect(out).toEqual([
      'aaaaaaaaaaaa  created 2026-10-01  last never',
      'bbbbbbbbbbbb  created 2026-10-02  last 2026-10-20',
    ]);
    expect(err).toEqual([]);
  });

  test('block-hub blocks a hub and list-hubs --blocked shows blocked hub', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (l: string) => {
        out.push(l);
      },
      err: (l: string) => {
        err.push(l);
      },
    };

    // Block a hub
    const code1 = run(['block-hub', 'bbbbbbbbbbbb', 'spam', 'and', 'more'], io, db);

    expect(code1).toBe(0);
    expect(out).toEqual(['blocked bbbbbbbbbbbb']);
    expect(err).toEqual([]);

    // Verify it's blocked
    const out2: string[] = [];
    const io2 = {
      out: (l: string) => {
        out2.push(l);
      },
      err: (l: string) => {
        out2.push(l);
      },
    };

    const code2 = run(['list-hubs', '--blocked'], io2, db);

    expect(code2).toBe(0);
    expect(out2).toEqual([
      'bbbbbbbbbbbb  created 2026-10-02  last 2026-10-20  blocked: spam and more',
    ]);
  });

  test('block-hub with unknown hub returns error', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (l: string) => {
        out.push(l);
      },
      err: (l: string) => {
        err.push(l);
      },
    };

    const code = run(['block-hub', 'zzzzzzzzzzzz', 'x'], io, db);

    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(['unknown hub']);
  });

  test('unblock-hub unblocks a hub', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (l: string) => {
        out.push(l);
      },
      err: (l: string) => {
        err.push(l);
      },
    };

    // First block the hub
    run(['block-hub', 'bbbbbbbbbbbb', 'spam'], io, db);

    // Then unblock it
    const code = run(['unblock-hub', 'bbbbbbbbbbbb'], io, db);

    expect(code).toBe(0);
    expect(out).toEqual(['blocked bbbbbbbbbbbb', 'unblocked bbbbbbbbbbbb']);

    // Verify it's no longer blocked
    const out2: string[] = [];
    const io2 = {
      out: (l: string) => {
        out2.push(l);
      },
      err: (l: string) => {
        out2.push(l);
      },
    };

    const code2 = run(['list-hubs', '--blocked'], io2, db);

    expect(code2).toBe(0);
    expect(out2).toEqual(['no hubs']);
  });

  test('min-hub-version shows, sets and clears the minimum', () => {
    const lines: string[] = [];
    const errs: string[] = [];
    const io = { out: (l: string) => lines.push(l), err: (l: string) => errs.push(l) };
    expect(run(['min-hub-version'], io, db)).toBe(0);
    expect(run(['min-hub-version', '0.2.0'], io, db)).toBe(0);
    expect(run(['min-hub-version'], io, db)).toBe(0);
    expect(run(['min-hub-version', '1.2'], io, db)).toBe(2);
    expect(run(['min-hub-version', 'none'], io, db)).toBe(0);
    expect(run(['min-hub-version'], io, db)).toBe(0);
    expect(lines[0]).toBe('none');
    expect(lines[2]).toBe('0.2.0');
    expect(lines.at(-1)).toBe('none');
    expect(errs).toEqual(['min-hub-version needs x.y.z or none']);
  });

  test('stats command returns correct output', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (l: string) => {
        out.push(l);
      },
      err: (l: string) => {
        err.push(l);
      },
    };

    const code = run(['stats'], io, db);

    expect(code).toBe(0);
    expect(out[0]).toBe('hubs: 2');
    expect(err).toEqual([]);
  });

  test('various invalid commands return usage error', () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = {
      out: (l: string) => {
        out.push(l);
      },
      err: (l: string) => {
        err.push(l);
      },
    };

    // Empty args
    const code1 = run([], io, db);
    expect(code1).toBe(2);
    expect(err[0]).toBe(
      'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
    );

    // Unknown command
    const code2 = run(['nope'], io, db);
    expect(code2).toBe(2);
    expect(err[1]).toBe(
      'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
    );

    // Missing arguments for block-hub
    const code3 = run(['block-hub', 'aaaaaaaaaaaa'], io, db);
    expect(code3).toBe(2);
    expect(err[2]).toBe(
      'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
    );

    // Missing arguments for unblock-hub
    const code4 = run(['unblock-hub'], io, db);
    expect(code4).toBe(2);
    expect(err[3]).toBe(
      'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
    );
  });
});
