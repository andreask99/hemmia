/**
 * Setup mode (SECURITY.md §6.1): while the hub has no users, a setup code unlocks the wizard
 * that creates the first admin. The code (20 characters of the recovery alphabet, 100 bits) is
 * stored as SHA-256 in settings.setup, written to <dataDir>/setup-code.txt (0600) and printed
 * once to stderr by main.ts. It is replaced after 24 hours. Owned by Claude.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { DB } from '../db/database.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_CHARS = 20;
const MAX_AGE_MS = 24 * 60 * 60_000;
const KEY = 'setup';

const SetupSetting = z.object({
  codeHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.number(),
});

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function generateSetupCode(): string {
  const bytes = randomBytes(CODE_CHARS);
  let out = '';
  for (const b of bytes) out += CROCKFORD.charAt(b & 31);
  bytes.fill(0);
  return out;
}

/** Upper-cases and drops spaces and dashes; null if it can't be a setup code. */
export function normalizeSetupCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_CHARS) return null;
  for (const ch of s) if (!CROCKFORD.includes(ch)) return null;
  return s;
}

export function createSetup(o: {
  db: DB;
  dataDir: string;
  needsSetup: () => boolean;
  now?: () => number;
}) {
  const now = o.now ?? Date.now;
  const file = join(o.dataDir, 'setup-code.txt');
  const read = () => {
    const row = o.db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(KEY);
    if (!row) return null;
    const parsed = SetupSetting.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : null;
  };
  return {
    needsSetup: o.needsSetup,
    /**
     * In setup mode: a new code when there is none or it is older than 24 hours (returned so it
     * can be shown once), else null. Outside setup mode: removes any leftover code.
     */
    ensureCode(): string | null {
      if (!o.needsSetup()) {
        this.complete();
        return null;
      }
      const current = read();
      if (current && now() - current.createdAt < MAX_AGE_MS && existsSync(file)) return null;
      const code = generateSetupCode();
      o.db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .run(
          KEY,
          JSON.stringify({ codeHash: sha256(code).toString('hex'), createdAt: now() }),
          now(),
        );
      if (o.dataDir !== ':memory:') {
        if (!existsSync(o.dataDir)) mkdirSync(o.dataDir, { recursive: true, mode: 0o700 });
        writeFileSync(file, `${code}\n`, { mode: 0o600 });
        chmodSync(file, 0o600);
      }
      return code;
    },
    /** Constant-time check of a code against the stored hash (and its age). */
    verify(input: string): boolean {
      const current = read();
      const code = normalizeSetupCode(input) ?? '';
      const given = sha256(code);
      const stored = current ? Buffer.from(current.codeHash, 'hex') : Buffer.alloc(32);
      const equal = timingSafeEqual(given, stored);
      return current !== null && code !== '' && equal && now() - current.createdAt < MAX_AGE_MS;
    },
    /** Setup is done: the code and its file go. */
    complete(): void {
      o.db.prepare('DELETE FROM settings WHERE key = ?').run(KEY);
      rmSync(file, { force: true });
    },
  };
}
export type Setup = ReturnType<typeof createSetup>;
