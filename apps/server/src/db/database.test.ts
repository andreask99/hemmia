import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate, openDatabase } from './database.ts';
import { MIGRATIONS } from './migrations.ts';

describe('database', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('applies all migrations once', () => {
    const db = openDatabase(':memory:');
    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'sessions', 'invites', 'audit_log', 'schema_migrations']),
    );
    expect(migrate(db)).toEqual([]);
  });

  it('enables foreign keys and secure delete', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('secure_delete', { simple: true })).toBe(1);
  });

  it('creates the data dir and file with owner-only permissions', () => {
    const parent = mkdtempSync(join(tmpdir(), 'kchat-db-'));
    dirs.push(parent);
    const dataDir = join(parent, 'data');
    const db = openDatabase(dataDir);
    db.close();
    expect(statSync(dataDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dataDir, 'kchat.db')).mode & 0o777).toBe(0o600);
  });

  it('rolls back a failing migration', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      migrate(db, [
        { id: 1, name: 'auth', sql: '' },
        { id: 99, name: 'broken', sql: 'CREATE TABLE ok (x INTEGER); NOT SQL;' },
      ]),
    ).toThrow();
    const ok = db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").get();
    expect(ok).toBeUndefined();
  });

  it('rejects out-of-order migration ids', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      migrate(db, [
        { id: 2, name: 'b', sql: '' },
        { id: 1, name: 'a', sql: '' },
      ]),
    ).toThrow('increasing');
  });

  it('adds devices and link codes to an existing database without touching its rows (21)', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(
      db,
      MIGRATIONS.filter((m) => m.id <= 20),
    );
    const b = Buffer.alloc(1);
    db.prepare(
      `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
         recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at, password_changed_at)
       VALUES ('u1', 'anna', 'admin', ?, ?, '{}', ?, ?, '{}', ?, 1, 1)`,
    ).run(b, b, b, b, b);
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, wrapped_dek, created_at, last_seen_at,
         expires_at, absolute_expires_at, user_agent_label)
       VALUES ('s1', 'u1', ?, ?, 1, 2, 3, 4, 'iPhone')`,
    ).run(Buffer.from('t'), b);
    const before = db.prepare('SELECT * FROM sessions').all();
    expect(
      migrate(
        db,
        MIGRATIONS.filter((m) => m.id <= 21),
      ),
    ).toEqual([21]);
    const after = db.prepare('SELECT * FROM sessions').all() as Record<string, unknown>[];
    expect(after).toEqual(
      (before as Record<string, unknown>[]).map((r) => ({ ...r, device_id: null })),
    );
    // Removing a device ends its sessions.
    db.prepare(
      "INSERT INTO devices (id, user_id, token_hash, created_at, last_seen_at) VALUES ('d1', 'u1', ?, 1, 1)",
    ).run(Buffer.from('d'));
    db.prepare("UPDATE sessions SET device_id = 'd1' WHERE id = 's1'").run();
    db.prepare("DELETE FROM devices WHERE id = 'd1'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    expect(() =>
      db
        .prepare(
          "INSERT INTO link_codes (id, kind, user_id, code_hash, created_by, created_at, expires_at) VALUES ('l', 'other', 'u1', ?, 'u1', 1, 2)",
        )
        .run(b),
    ).toThrow();
  });
});
