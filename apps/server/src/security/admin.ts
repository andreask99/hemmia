/**
 * Admin operations on accounts. They never touch content or keys: the admin can't read
 * anyone's chats. Owned by Claude.
 */
import type { AdminInvite, Role } from '@hemmia/shared';
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
    /** Invites that can still be accepted, newest first. */
    listInvites(): AdminInvite[] {
      return db
        .prepare<
          [number],
          {
            id: string;
            role: Role;
            restricted: 0 | 1;
            created_by: string | null;
            created_at: number;
            expires_at: number;
          }
        >(
          `SELECT i.id, i.role, i.restricted, u.username AS created_by, i.created_at, i.expires_at
           FROM invites i LEFT JOIN users u ON u.id = i.created_by
           WHERE i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC`,
        )
        .all(now())
        .map((r) => ({
          id: r.id,
          role: r.role,
          restricted: r.restricted === 1,
          createdBy: r.created_by,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        }));
    },

    /** Withdraws an unused invite. Returns false if there is no such open invite. */
    revokeInvite(inviteId: string, by: string): boolean {
      const done =
        db.prepare('DELETE FROM invites WHERE id = ? AND used_at IS NULL').run(inviteId).changes ===
        1;
      if (done) audit('invite_revoked', by);
      return done;
    },

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
        // Their open invites go too: a departing admin can't leave a way back in.
        db.prepare('DELETE FROM invites WHERE created_by = ? AND used_at IS NULL').run(id);
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
