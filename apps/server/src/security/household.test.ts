import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.ts';
import { createShoppingRepo } from '../db/shopping.ts';
import { randomKey } from './crypto.ts';
import { householdKeyFile } from './household.ts';

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('family key', () => {
  it('is created once with private permissions and then reused', () => {
    dir = mkdtempSync(join(tmpdir(), 'household-'));
    const key = householdKeyFile(dir)();
    expect(key).toHaveLength(32);
    const file = join(dir, 'household', 'shopping.key');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'household')).mode & 0o777).toBe(0o700);
    expect(householdKeyFile(dir)().equals(key)).toBe(true);
    expect(readFileSync(file, 'utf8')).not.toContain('\0');
  });

  it('refuses a damaged key file', () => {
    dir = mkdtempSync(join(tmpdir(), 'household-'));
    householdKeyFile(dir)();
    writeFileSync(join(dir, 'household', 'shopping.key'), 'short');
    expect(() => householdKeyFile(dir)()).toThrow('damaged');
  });

  it('starts an empty family list when the key no longer opens it', () => {
    const db = openDatabase(':memory:');
    const u = { userId: 'u1', dek: randomKey(), language: 'en' as const };
    const before = createShoppingRepo(db);
    before.addTyped(u, 'family', 'milk');
    let warned = 0;
    const after = createShoppingRepo(db, {
      onFamilyUnreadable: () => {
        warned += 1;
      },
    });
    expect(after.get(u, 'family').items).toEqual([]);
    expect(warned).toBe(1);
    after.addTyped(u, 'family', 'bread');
    expect(after.get(u, 'family').items.map((i) => i.key)).toEqual(['bread']);
  });
});
