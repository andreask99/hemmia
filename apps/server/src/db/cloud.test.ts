import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CLOUD_CAP_CENTS } from '@hemmia/shared';
import { randomKey } from '../security/crypto.ts';
import type { UserKey } from './chats.ts';
import { costMicros, createCloudRepo, type CloudRepo, monthOf } from './cloud.ts';
import Database from 'better-sqlite3';
import { type DB, migrate, openDatabase } from './database.ts';
import { MIGRATIONS } from './migrations.ts';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
let db: DB;
let repo: CloudRepo;
let clock: number;
let anna: UserKey;
let ben: UserKey;

function insertUser(id: string, username: string): void {
  const b = Buffer.alloc(1);
  db.prepare(
    `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
       recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at, password_changed_at)
     VALUES (?, ?, 'member', ?, ?, '{}', ?, ?, '{}', ?, 0, 0)`,
  ).run(id, username, b, b, b, b, b);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = new Date(2026, 9, 14, 12).getTime();
  repo = createCloudRepo(db, () => clock);
  insertUser('u-anna', 'anna');
  insertUser('u-ben', 'ben');
  anna = { userId: 'u-anna', dek: randomKey() };
  ben = { userId: 'u-ben', dek: randomKey() };
});

describe('cloud keys', () => {
  it('stores a key encrypted and gives it back only to its owner', () => {
    repo.save(anna, 'anthropic', KEY);
    expect(repo.providers('u-anna')).toEqual(new Set(['anthropic']));
    expect(repo.providers('u-ben').size).toBe(0);
    expect(repo.key(anna, 'anthropic')).toBe(KEY);
    expect(repo.key(anna, 'openai')).toBeNull();
    expect(repo.list(anna)).toEqual([{ provider: 'anthropic', hint: '6789', addedAt: clock }]);
    expect(repo.key(ben, 'anthropic')).toBeNull();

    const row = db.prepare('SELECT secret FROM cloud_keys').get() as { secret: Buffer };
    expect(row.secret.includes(Buffer.from(KEY))).toBe(false);
    expect(row.secret.includes(Buffer.from('6789'))).toBe(false);
  });

  it("can't be read with another user's data key or moved to another user", () => {
    repo.save(anna, 'anthropic', KEY);
    expect(() => repo.key({ userId: 'u-anna', dek: ben.dek }, 'anthropic')).toThrow();
    db.prepare("UPDATE cloud_keys SET user_id = 'u-ben'").run();
    expect(() => repo.key({ userId: 'u-ben', dek: anna.dek }, 'anthropic')).toThrow();
  });

  it('is bound to its provider', () => {
    repo.save(anna, 'anthropic', KEY);
    db.prepare("UPDATE cloud_keys SET provider = 'openai'").run();
    expect(() => repo.key(anna, 'openai')).toThrow();
  });

  it('replaces and removes keys', () => {
    repo.save(anna, 'openai', `${KEY}-old`);
    repo.save(anna, 'openai', KEY);
    expect(repo.key(anna, 'openai')).toBe(KEY);
    expect(repo.remove('u-ben', 'openai')).toBe(false);
    expect(repo.remove('u-anna', 'openai')).toBe(true);
    expect(repo.providers('u-anna').size).toBe(0);
  });
});

describe('cloud spending', () => {
  it('costs list prices per million tokens in millionths of a dollar', () => {
    expect(costMicros({ inputPerMTok: 2, outputPerMTok: 10 }, 1000, 500)).toBe(7000);
  });

  it('adds up per month and checks the cap (default, own, none)', () => {
    expect(repo.cap('u-anna')).toBe(DEFAULT_CLOUD_CAP_CENTS);
    repo.record('u-anna', 'anthropic', 'claude-sonnet-5-5', 1000, 200, 19_000_000);
    expect(repo.overBudget('u-anna')).toBe(false);
    repo.record('u-anna', 'anthropic', 'claude-sonnet-5-5', 10, 20, 1_000_000);
    expect(repo.thisMonth('u-anna')).toEqual({
      inputTokens: 1010,
      outputTokens: 220,
      costMicros: 20_000_000,
    });
    expect(repo.overBudget('u-anna')).toBe(true);
    expect(repo.overBudget('u-ben')).toBe(false);
    repo.setCap('u-anna', 5000);
    expect(repo.overBudget('u-anna')).toBe(false);
    repo.setCap('u-anna', null);
    expect(repo.cap('u-anna')).toBeNull();
    expect(repo.overBudget('u-anna')).toBe(false);

    const may = monthOf(clock);
    clock = new Date(2026, 10, 1, 9).getTime();
    expect(monthOf(clock)).not.toBe(may);
    expect(repo.thisMonth('u-anna').costMicros).toBe(0);
  });
});

describe('migration 20 (OpenRouter)', () => {
  it('keeps existing keys usable and accepts openrouter keys', () => {
    const raw: DB = new Database(':memory:');
    raw.pragma('foreign_keys = ON');
    migrate(
      raw,
      MIGRATIONS.filter((m) => m.id < 20),
    );
    db = raw;
    insertUser('u-anna', 'anna');
    const before = createCloudRepo(raw, () => clock);
    before.save(anna, 'openai', KEY);
    expect(() => {
      raw
        .prepare(
          "INSERT INTO cloud_keys (user_id, provider, secret, created_at) VALUES (?, 'openrouter', ?, 0)",
        )
        .run('u-anna', Buffer.alloc(1));
    }).toThrow();
    expect(
      migrate(
        raw,
        MIGRATIONS.filter((m) => m.id <= 20),
      ),
    ).toEqual([20]);
    const after = createCloudRepo(raw, () => clock);
    expect(after.key(anna, 'openai')).toBe(KEY);
    after.save(anna, 'openrouter', 'sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789');
    expect(after.providers('u-anna')).toEqual(new Set(['openai', 'openrouter']));
  });
});
