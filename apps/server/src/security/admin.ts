/**
 * Admin operations on accounts. They never touch content or keys: the admin can't read
 * anyone's chats. Owned by Claude.
 */
import type { Role } from '@hemmia/shared';
import type { DB } from '../db/database.ts';

export interface UserSummary {
  id: string;
  username: string;
  role: Role;
  restricted: boolean;
  createdAt: number;
  disabledAt: number | null;
  /** Latest activity over all sessions, or null if never signed in since the last reset. */
  lastSeenAt: number | null;
  sessions: number;
}

interface Row {
  id: string;
  username: string;
  role: Role;
  restricted: 0 | 1;
  created_at: number;
  disabled_at: number | null;
  last_seen_at: number | null;
  sessions: number;
}

export function createAdmin(db: DB, now: () => number = Date.now) {
  function audit(event: string, userId: string): void {
    db.prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)').run(
      userId,
      event,
      now(),
    );
  }

  function idOf(username: string): string | null {
    const row = db
      .prepare<[string], { id: string }>('SELECT id FROM users WHERE username = ?')
      .get(username);
    return row?.id ?? null;
  }

  return {
    listUsers(): UserSummary[] {
      return db
        .prepare<[], Row>(
          `SELECT u.id, u.username, u.role, u.restricted, u.created_at, u.disabled_at,
                  MAX(s.last_seen_at) AS last_seen_at, COUNT(s.id) AS sessions
           FROM users u LEFT JOIN sessions s ON s.user_id = u.id
           GROUP BY u.id ORDER BY u.username COLLATE NOCASE`,
        )
        .all()
        .map((r) => ({
          id: r.id,
          username: r.username,
          role: r.role,
          restricted: r.restricted === 1,
          createdAt: r.created_at,
          disabledAt: r.disabled_at,
          lastSeenAt: r.last_seen_at,
          sessions: r.sessions,
        }));
    },

    /** Disables an account and ends its sessions. Returns false if no such user. */
    disableUser(username: string): boolean {
      const id = idOf(username);
      if (!id) return false;
      db.transaction(() => {
        db.prepare('UPDATE users SET disabled_at = COALESCE(disabled_at, ?) WHERE id = ?').run(
          now(),
          id,
        );
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM link_codes WHERE user_id = ? AND used_at IS NULL').run(id);
        audit('user_disabled', id);
      })();
      return true;
    },

    /** Re-enables an account. Returns false if no such user. */
    enableUser(username: string): boolean {
      const id = idOf(username);
      if (!id) return false;
      db.prepare('UPDATE users SET disabled_at = NULL WHERE id = ?').run(id);
      audit('user_enabled', id);
      return true;
    },

    /** Turns the teen-account restrictions on or off. Returns false if no such user. */
    setRestricted(username: string, restricted: boolean): boolean {
      const id = idOf(username);
      if (!id) return false;
      db.prepare('UPDATE users SET restricted = ? WHERE id = ?').run(restricted ? 1 : 0, id);
      audit(restricted ? 'user_restricted' : 'user_unrestricted', id);
      return true;
    },
  };
}

export type Admin = ReturnType<typeof createAdmin>;
