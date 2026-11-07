import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations.ts';

export type DB = Database.Database;

/**
 * Opens (and creates) the database in `dataDir` with owner-only permissions, or an
 * in-memory database for tests when dataDir is ':memory:'. Applies pending migrations.
 */
export function openDatabase(dataDir: string): DB {
  let db: DB;
  if (dataDir === ':memory:') {
    db = new Database(':memory:');
  } else {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    chmodSync(dataDir, 0o700);
    const file = join(dataDir, 'kchat.db');
    db = new Database(file);
    chmodSync(file, 0o600);
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('secure_delete = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Applies migrations not yet recorded in schema_migrations, each in its own transaction. */
export function migrate(db: DB, migrations: readonly Migration[] = MIGRATIONS): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT`);
  const applied = new Set(
    db
      .prepare<[], { id: number }>('SELECT id FROM schema_migrations')
      .all()
      .map((r) => r.id),
  );
  const ids = migrations.map((m) => m.id);
  if (new Set(ids).size !== ids.length || ids.some((id, i) => i > 0 && id <= (ids[i - 1] ?? 0))) {
    throw new Error('Migration ids must be unique and increasing');
  }
  const done: number[] = [];
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        m.id,
        m.name,
        Date.now(),
      );
    })();
    done.push(m.id);
  }
  return done;
}
