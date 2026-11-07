/** The relay's SQLite database: hubs, monthly usage, certificate orders, push handles. */
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { type Migration, MIGRATIONS } from './migrations.ts';

export type RelayDb = Database.Database;

export function openDb(dataDir: string): RelayDb {
  let db: RelayDb;
  if (dataDir === ':memory:') {
    db = new Database(':memory:');
  } else {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    chmodSync(dataDir, 0o700);
    const file = join(dataDir, 'relay.db');
    db = new Database(file);
    chmodSync(file, 0o600);
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: RelayDb, migrations: readonly Migration[] = MIGRATIONS): number[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT',
  );
  const done = new Set(
    db
      .prepare<[], { id: number }>('SELECT id FROM schema_migrations')
      .all()
      .map((r) => r.id),
  );
  const applied: number[] = [];
  let last = 0;
  for (const m of migrations) {
    if (m.id <= last) throw new Error('migration ids must be increasing');
    last = m.id;
    if (done.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        m.id,
        m.name,
        Date.now(),
      );
    })();
    applied.push(m.id);
  }
  return applied;
}

/** "YYYY-MM" in UTC (quotas are per calendar month, UTC). */
export function monthUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}
