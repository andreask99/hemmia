/**
 * One-time sign-in links and device codes (SECURITY.md §4.2, §4.3). Codes are 32 random bytes
 * (b64url), stored only as SHA-256, single use. A sign-in link carries the user's data key
 * wrapped with a key derived from the code (HKDF, "kchat-link-v1"), so without the code nobody,
 * not even the hub at rest, can unwrap it. Owned by Claude.
 */
import { randomUUID } from 'node:crypto';
import type { DB } from '../db/database.ts';
import {
  aadWrap,
  DecryptError,
  hkdf,
  randomToken,
  sha256,
  unwrapKey,
  wipe,
  wrapKey,
} from './crypto.ts';

export const SIGNIN_TTL_MS = 10 * 60_000;
export const DEVICE_TTL_MS = 24 * 60 * 60_000;
const MAX_UNUSED_SIGNIN = 3;

/** HKDF info and salt are protocol constants: never rename them. */
const linkKey = (code: string, linkId: string) =>
  hkdf(Buffer.from(code, 'utf8'), 'kchat-link-v1', `link-dek:${linkId}`);

interface Row {
  id: string;
  kind: 'signin' | 'device';
  user_id: string;
  wrapped_dek: Buffer | null;
  expires_at: number;
  used_at: number | null;
}

export type Redeemed =
  | { kind: 'signin'; userId: string; dek: Buffer; linkId: string }
  | { kind: 'device'; userId: string; linkId: string };

export function createLinkCodes(o: { db: DB; now?: () => number }) {
  const now = o.now ?? Date.now;
  const byHash = o.db.prepare<[Buffer], Row>(
    'SELECT id, kind, user_id, wrapped_dek, expires_at, used_at FROM link_codes WHERE code_hash = ?',
  );
  const insert = o.db.prepare(
    `INSERT INTO link_codes (id, kind, user_id, code_hash, wrapped_dek, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const prune = () => {
    // Used or expired codes have no further use; keep the table small.
    o.db
      .prepare('DELETE FROM link_codes WHERE used_at IS NOT NULL OR expires_at < ?')
      .run(now() - 60 * 60_000);
  };

  return {
    /** A sign-in link for the signed-in user, carrying their data key (wrapped). */
    createSignin(userId: string, dek: Buffer): { id: string; code: string; expiresAt: number } {
      prune();
      const id = randomUUID();
      const code = randomToken();
      const key = linkKey(code, id);
      const wrapped = wrapKey(key, dek, aadWrap(userId, `link-${id}`));
      wipe(key);
      const expiresAt = now() + SIGNIN_TTL_MS;
      o.db.transaction(() => {
        insert.run(id, 'signin', userId, sha256(code), wrapped, userId, now(), expiresAt);
        // At most 3 unused sign-in links: the oldest goes.
        const unused = o.db
          .prepare<[string, number], { id: string }>(
            `SELECT id FROM link_codes WHERE user_id = ? AND kind = 'signin' AND used_at IS NULL
             AND expires_at > ? ORDER BY created_at DESC, rowid DESC`,
          )
          .all(userId, now());
        for (const old of unused.slice(MAX_UNUSED_SIGNIN)) {
          o.db.prepare('DELETE FROM link_codes WHERE id = ?').run(old.id);
        }
      })();
      return { id, code, expiresAt };
    },

    /** A device code for a user (no key material). */
    createDevice(
      userId: string,
      createdBy: string,
    ): { id: string; code: string; expiresAt: number } {
      prune();
      const id = randomUUID();
      const code = randomToken();
      const expiresAt = now() + DEVICE_TTL_MS;
      insert.run(id, 'device', userId, sha256(code), null, createdBy, now(), expiresAt);
      return { id, code, expiresAt };
    },

    /**
     * Redeems a code of the given kind once. Unknown, expired, used, wrong-kind and malformed
     * codes all give null. The claim is atomic: two concurrent redeems can't both win.
     */
    redeem(kind: 'signin' | 'device', code: string): Redeemed | null {
      if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
      const row = byHash.get(sha256(code));
      if (!row || row.kind !== kind || row.used_at !== null || row.expires_at <= now()) return null;
      const claimed = o.db
        .prepare(
          'UPDATE link_codes SET used_at = ?, wrapped_dek = NULL WHERE id = ? AND used_at IS NULL',
        )
        .run(now(), row.id);
      if (claimed.changes !== 1) return null;
      if (row.kind === 'device') return { kind: 'device', userId: row.user_id, linkId: row.id };
      if (!row.wrapped_dek) return null;
      const key = linkKey(code, row.id);
      try {
        const dek = unwrapKey(key, row.wrapped_dek, aadWrap(row.user_id, `link-${row.id}`));
        return { kind: 'signin', userId: row.user_id, dek, linkId: row.id };
      } catch (err) {
        if (err instanceof DecryptError) return null;
        throw err;
      } finally {
        wipe(key, row.wrapped_dek);
      }
    },
  };
}
export type LinkCodes = ReturnType<typeof createLinkCodes>;
