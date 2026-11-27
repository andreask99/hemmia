/**
 * The family key (P12.6, SECURITY.md "Family shopping list"): 32 random bytes that encrypt what
 * the whole family shares (the family shopping list). Kept in <dataDir>/household/shopping.key
 * (0600, directory 0700), created the first time it is needed, never logged or sent.
 *
 * Owner decision 2026-11-27: the key lives on the Mac rather than wrapped per member, so a copy
 * of the database alone can't be read, but the Mac, its disk or a backup can. Owned by Claude.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomKey } from './crypto.ts';
import { writePrivateFile } from './relay-identity.ts';

/** The AAD user component for family-owned values (user ids are UUIDs, so it can't clash). */
export const HOUSEHOLD = 'household';

export type HouseholdKey = () => Buffer;

/** The family key from the data folder, created on first use and then cached. */
export function householdKeyFile(dataDir: string): HouseholdKey {
  let key: Buffer | null = null;
  return () => {
    if (key) return key;
    const dir = join(dataDir, 'household');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const file = join(dir, 'shopping.key');
    if (existsSync(file)) {
      const loaded = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
      if (loaded.length !== 32) throw new Error('family key file is damaged');
      key = loaded;
    } else {
      const fresh = randomKey();
      writePrivateFile(file, `${fresh.toString('base64')}\n`);
      key = fresh;
    }
    return key;
  };
}

/** A family key in memory only (tests and an in-memory database). */
export function householdKeyInMemory(): HouseholdKey {
  const key = randomKey();
  return () => key;
}
