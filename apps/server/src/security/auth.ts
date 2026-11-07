/**
 * Accounts, invites, sessions and the per-user data key (DEK). Owned by Claude; see
 * docs/SECURITY.md "Key hierarchy" and "Authentication and accounts".
 *
 * The DEK exists in clear only in memory, and only while a request that needs it runs:
 * it is stored wrapped under the password KEK, the recovery key, and one key per session
 * derived from that session's cookie token (which the server stores only as a hash).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Language, Role } from '@hemmia/shared';
import type { DB } from '../db/database.ts';
import {
  aadWrap,
  DEFAULT_KDF_PARAMS,
  DecryptError,
  derivePasswordKeys,
  deriveRecoveryKey,
  generateRecoveryCode,
  hkdf,
  type KdfParams,
  normalizeRecoveryCode,
  randomKey,
  randomSalt,
  randomToken,
  safeEqual,
  sha256,
  unwrapKey,
  wipe,
  wrapKey,
} from './crypto.ts';
import { isCommonPassword } from './common-passwords.ts';

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const SESSION_IDLE_MS = 30 * DAY;
export const SESSION_ABSOLUTE_MS = 90 * DAY;
export const INVITE_TTL_MS = 7 * DAY;
/** Sliding expiry is written at most this often per session, to limit writes. */
const SESSION_TOUCH_MS = 10 * MINUTE;

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'invite_invalid'
  | 'username_taken'
  | 'weak_password'
  /** Setup was already done (a user exists). */
  | 'forbidden';

export class AuthError extends Error {
  override name = 'AuthError';
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(code);
    this.code = code;
  }
}

/** What a request knows about its user once the session cookie is resolved. */
export interface SessionUser {
  userId: string;
  sessionId: string;
  username: string;
  role: Role;
  restricted: boolean;
  language: Language;
  defaultModelId: string | null;
  /** The user's data key. Callers must not keep it beyond the request; wipe() it after. */
  dek: Buffer;
}

export interface NewSession {
  /** Cookie value. Shown to the client once; the server keeps only its hash. */
  token: string;
  sessionId: string;
  expiresAt: number;
}

export interface AuthOptions {
  db: DB;
  /** Argon2id parameters for new password/recovery hashes. */
  kdfParams?: KdfParams;
  now?: () => number;
}

const KdfParamsSchema = z.object({
  m: z.number().int().min(1024),
  t: z.number().int().min(1),
  p: z.number().int().min(1),
});

interface UserRow {
  id: string;
  username: string;
  role: Role;
  restricted: 0 | 1;
  language: Language;
  default_model_id: string | null;
  auth_hash: Buffer;
  kdf_salt: Buffer;
  kdf_params: string;
  wrapped_dek_pw: Buffer;
  recovery_salt: Buffer;
  recovery_kdf_params: string;
  wrapped_dek_recovery: Buffer;
  disabled_at: number | null;
}

interface InviteRow {
  id: string;
  role: Role;
  restricted: 0 | 1;
  expires_at: number;
  used_at: number | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  wrapped_dek: Buffer;
  last_seen_at: number;
  expires_at: number;
  absolute_expires_at: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Characters as people count them (an emoji or accented letter is one). */
function graphemeCount(s: string): number {
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

export function validateNewPassword(password: string, username: string): void {
  const p = password.normalize('NFC');
  if (graphemeCount(p) < 12 || p.length > 256) throw new AuthError('weak_password');
  if (isCommonPassword(p)) throw new AuthError('weak_password');
  if (new Set(p.toLowerCase()).size < 4) throw new AuthError('weak_password');
  if (p.toLowerCase().includes(username.toLowerCase())) throw new AuthError('weak_password');
}

function sessionKey(token: string, sessionId: string): Buffer {
  return hkdf(Buffer.from(token, 'base64url'), 'kchat-session-v1', `session-dek:${sessionId}`);
}

export function createAuth(options: AuthOptions) {
  const { db } = options;
  const kdfParams = options.kdfParams ?? DEFAULT_KDF_PARAMS;
  const now = options.now ?? Date.now;

  // Used to spend the same Argon2 time on unknown usernames as on real ones.
  const dummySalt = randomSalt();

  const q = {
    userByName: db.prepare<[string], UserRow>('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare<[string], UserRow>('SELECT * FROM users WHERE id = ?'),
    inviteByHash: db.prepare<[Buffer], InviteRow>(
      'SELECT id, role, restricted, expires_at, used_at FROM invites WHERE code_hash = ?',
    ),
    sessionByHash: db.prepare<[Buffer], SessionRow>(
      `SELECT id, user_id, wrapped_dek, last_seen_at, expires_at, absolute_expires_at
       FROM sessions WHERE token_hash = ?`,
    ),
  };

  function parseParams(json: string): KdfParams {
    return KdfParamsSchema.parse(JSON.parse(json));
  }

  function insertSession(userId: string, dek: Buffer, label: string): NewSession {
    const t = now();
    const sessionId = randomUUID();
    const token = randomToken();
    const sk = sessionKey(token, sessionId);
    const wrapped = wrapKey(sk, dek, aadWrap(userId, `session-${sessionId}`));
    wipe(sk);
    const expiresAt = t + SESSION_IDLE_MS;
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, wrapped_dek, created_at, last_seen_at,
         expires_at, absolute_expires_at, user_agent_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sessionId,
      userId,
      sha256(token),
      wrapped,
      t,
      t,
      expiresAt,
      t + SESSION_ABSOLUTE_MS,
      label.slice(0, 64),
    );
    return { token, sessionId, expiresAt };
  }

  /** Verifies a password against a user row; returns the unwrapped DEK or null. */
  async function checkPassword(user: UserRow, password: string): Promise<Buffer | null> {
    const keys = await derivePasswordKeys(password, user.kdf_salt, parseParams(user.kdf_params));
    try {
      if (!safeEqual(keys.authHash, user.auth_hash)) return null;
      return unwrapKey(keys.kek, user.wrapped_dek_pw, aadWrap(user.id, 'password'));
    } catch (err) {
      if (err instanceof DecryptError) return null;
      throw err;
    } finally {
      wipe(keys.kek);
    }
  }

  async function passwordSlot(userId: string, password: string, dek: Buffer) {
    const salt = randomSalt();
    const keys = await derivePasswordKeys(password, salt, kdfParams);
    const wrapped = wrapKey(keys.kek, dek, aadWrap(userId, 'password'));
    wipe(keys.kek);
    return { salt, authHash: keys.authHash, wrapped, params: JSON.stringify(kdfParams) };
  }

  async function recoverySlot(userId: string, dek: Buffer) {
    const recoveryCode = generateRecoveryCode();
    const salt = randomSalt();
    const rk = await deriveRecoveryKey(normalizeRecoveryCode(recoveryCode) ?? '', salt, kdfParams);
    const wrapped = wrapKey(rk, dek, aadWrap(userId, 'recovery'));
    wipe(rk);
    return { recoveryCode, salt, wrapped, params: JSON.stringify(kdfParams) };
  }

  /**
   * Unused sign-in links and device codes of a user. They go whenever the user's sessions are
   * reset, so a link made earlier (perhaps by someone else on a device) can't open a new one.
   */
  function dropLinkCodes(userId: string): void {
    db.prepare('DELETE FROM link_codes WHERE user_id = ? AND used_at IS NULL').run(userId);
  }

  function audit(event: string, userId: string | null): void {
    db.prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)').run(
      userId,
      event,
      now(),
    );
  }

  return {
    /** Creates a single-use invite. The code is returned once; only its hash is stored. */
    createInvite(input: { role: Role; restricted: boolean; createdBy: string | null }): {
      id: string;
      code: string;
      expiresAt: number;
    } {
      const id = randomUUID();
      const code = randomToken();
      const t = now();
      db.prepare(
        `INSERT INTO invites (id, code_hash, role, restricted, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        sha256(code),
        input.role,
        input.restricted ? 1 : 0,
        input.createdBy,
        t,
        t + INVITE_TTL_MS,
      );
      audit('invite_created', input.createdBy);
      return { id, code, expiresAt: t + INVITE_TTL_MS };
    },

    /** Creates the account for an invite and signs it in. Returns the recovery code once. */
    async acceptInvite(input: {
      code: string;
      username: string;
      password: string;
      userAgentLabel: string;
    }): Promise<{ userId: string; recoveryCode: string; session: NewSession }> {
      const invite = q.inviteByHash.get(sha256(input.code));
      if (!invite || invite.used_at !== null || invite.expires_at <= now()) {
        throw new AuthError('invite_invalid');
      }
      validateNewPassword(input.password, input.username);
      if (q.userByName.get(input.username)) throw new AuthError('username_taken');

      const userId = randomUUID();
      const dek = randomKey();
      try {
        const pw = await passwordSlot(userId, input.password, dek);
        const rec = await recoverySlot(userId, dek);
        const t = now();
        const session = db.transaction(() => {
          // Claim the invite first; a concurrent accept loses here.
          const claimed = db
            .prepare('UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL')
            .run(t, invite.id);
          if (claimed.changes !== 1) throw new AuthError('invite_invalid');
          try {
            db.prepare(
              `INSERT INTO users (id, username, role, restricted, auth_hash, kdf_salt, kdf_params,
                 wrapped_dek_pw, recovery_salt, recovery_kdf_params, wrapped_dek_recovery,
                 created_at, password_changed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              userId,
              input.username,
              invite.role,
              invite.restricted,
              pw.authHash,
              pw.salt,
              pw.params,
              pw.wrapped,
              rec.salt,
              rec.params,
              rec.wrapped,
              t,
              t,
            );
          } catch (err) {
            if (
              err instanceof Error &&
              err.message.includes('UNIQUE constraint failed: users.username')
            ) {
              throw new AuthError('username_taken');
            }
            throw err;
          }
          db.prepare('UPDATE invites SET used_by = ? WHERE id = ?').run(userId, invite.id);
          audit('invite_used', userId);
          return insertSession(userId, dek, input.userAgentLabel);
        })();
        return { userId, recoveryCode: rec.recoveryCode, session };
      } finally {
        wipe(dek);
      }
    },

    /**
     * Setup mode (SECURITY.md §6.1): creates the first admin while there are no users at all,
     * signs them in and returns the recovery code once. Throws AuthError('forbidden') once any
     * user exists (checked inside the write transaction, so two setups can't both win).
     */
    async createFirstAdmin(input: {
      username: string;
      password: string;
      language: Language;
      userAgentLabel: string;
    }): Promise<{ userId: string; recoveryCode: string; session: NewSession }> {
      validateNewPassword(input.password, input.username);
      const userId = randomUUID();
      const dek = randomKey();
      try {
        const pw = await passwordSlot(userId, input.password, dek);
        const rec = await recoverySlot(userId, dek);
        const t = now();
        const session = db.transaction(() => {
          const n = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users').get()?.n ?? 0;
          if (n > 0) throw new AuthError('forbidden');
          db.prepare(
            `INSERT INTO users (id, username, role, restricted, language, auth_hash, kdf_salt,
               kdf_params, wrapped_dek_pw, recovery_salt, recovery_kdf_params,
               wrapped_dek_recovery, created_at, password_changed_at)
             VALUES (?, ?, 'admin', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            userId,
            input.username,
            input.language,
            pw.authHash,
            pw.salt,
            pw.params,
            pw.wrapped,
            rec.salt,
            rec.params,
            rec.wrapped,
            t,
            t,
          );
          audit('setup_completed', userId);
          return insertSession(userId, dek, input.userAgentLabel);
        })();
        return { userId, recoveryCode: rec.recoveryCode, session };
      } finally {
        wipe(dek);
      }
    },

    /** Re-checks a signed-in user's passphrase (for sensitive actions). */
    async verifyPassword(userId: string, password: string): Promise<boolean> {
      const user = q.userById.get(userId);
      if (!user || user.disabled_at !== null) {
        await derivePasswordKeys(password, dummySalt, kdfParams);
        return false;
      }
      const dek = await checkPassword(user, password);
      if (!dek) return false;
      wipe(dek);
      return true;
    },

    /**
     * A new session for a user whose data key the caller already holds (a redeemed sign-in
     * link). The caller wipes `dek`.
     */
    sessionWithDek(userId: string, dek: Buffer, label: string): NewSession | null {
      const user = q.userById.get(userId);
      if (!user || user.disabled_at !== null) return null;
      return insertSession(userId, dek, label);
    },

    /** An invite that can still be accepted (not used, not expired). */
    inviteUsable(code: string): boolean {
      const invite = q.inviteByHash.get(sha256(code));
      return invite !== undefined && invite.used_at === null && invite.expires_at > now();
    },

    /** When a session started (for "recently signed in" checks), or null. */
    sessionCreatedAt(sessionId: string): number | null {
      return (
        db
          .prepare<[string], { created_at: number }>('SELECT created_at FROM sessions WHERE id = ?')
          .get(sessionId)?.created_at ?? null
      );
    },

    /** True while the hub has no users (setup mode). */
    needsSetup(): boolean {
      return (db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users').get()?.n ?? 0) === 0;
    },

    /**
     * Signs in. Unknown user, disabled user and wrong password all throw the same
     * invalid_credentials after the same Argon2 work.
     */
    async login(input: {
      username: string;
      password: string;
      userAgentLabel: string;
    }): Promise<NewSession & { userId: string }> {
      const user = q.userByName.get(input.username);
      if (!user || user.disabled_at !== null) {
        await derivePasswordKeys(input.password, dummySalt, kdfParams);
        audit('login_failed', user?.id ?? null);
        throw new AuthError('invalid_credentials');
      }
      const dek = await checkPassword(user, input.password);
      if (!dek) {
        audit('login_failed', user.id);
        throw new AuthError('invalid_credentials');
      }
      try {
        const session = insertSession(user.id, dek, input.userAgentLabel);
        audit('login', user.id);
        return { ...session, userId: user.id };
      } finally {
        wipe(dek);
      }
    },

    /** Resolves a cookie token to its user and DEK, sliding the expiry. Null if invalid. */
    resolveSession(token: string): SessionUser | null {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const row = q.sessionByHash.get(sha256(token));
      const t = now();
      if (!row || row.expires_at <= t || row.absolute_expires_at <= t) return null;
      const user = q.userById.get(row.user_id);
      if (!user || user.disabled_at !== null) return null;
      let dek: Buffer;
      try {
        const sk = sessionKey(token, row.id);
        dek = unwrapKey(sk, row.wrapped_dek, aadWrap(user.id, `session-${row.id}`));
        wipe(sk);
      } catch (err) {
        if (err instanceof DecryptError) return null;
        throw err;
      }
      if (t - row.last_seen_at >= SESSION_TOUCH_MS) {
        db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
          t,
          Math.min(t + SESSION_IDLE_MS, row.absolute_expires_at),
          row.id,
        );
      }
      return {
        userId: user.id,
        sessionId: row.id,
        username: user.username,
        role: user.role,
        restricted: user.restricted === 1,
        language: user.language,
        defaultModelId: user.default_model_id,
        dek,
      };
    },

    /** The user's sessions (for "signed-in devices"); never tokens or keys. */
    listSessions(userId: string): {
      id: string;
      deviceLabel: string;
      createdAt: number;
      lastSeenAt: number;
    }[] {
      return db
        .prepare<
          [string, number],
          { id: string; user_agent_label: string; created_at: number; last_seen_at: number }
        >(
          `SELECT id, user_agent_label, created_at, last_seen_at FROM sessions
           WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
        )
        .all(userId, now())
        .map((r) => ({
          id: r.id,
          deviceLabel: r.user_agent_label,
          createdAt: r.created_at,
          lastSeenAt: r.last_seen_at,
        }));
    },

    /** Ends one of the user's own sessions. False if it isn't theirs (or doesn't exist). */
    endSession(userId: string, sessionId: string): boolean {
      return (
        db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sessionId, userId)
          .changes === 1
      );
    },

    /** Updates the user's own preferences. */
    updatePreferences(
      userId: string,
      prefs: { language?: Language; defaultModelId?: string | null },
    ): void {
      if (prefs.language !== undefined) {
        db.prepare('UPDATE users SET language = ? WHERE id = ?').run(prefs.language, userId);
      }
      if (prefs.defaultModelId !== undefined) {
        db.prepare('UPDATE users SET default_model_id = ? WHERE id = ?').run(
          prefs.defaultModelId,
          userId,
        );
      }
    },

    logout(sessionId: string): void {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    },

    logoutAll(userId: string): void {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      dropLinkCodes(userId);
      audit('logout_all', userId);
    },

    /** Changes the password (re-wraps the DEK) and ends every other session. */
    async changePassword(input: {
      userId: string;
      currentSessionId: string;
      currentPassword: string;
      newPassword: string;
    }): Promise<void> {
      const user = q.userById.get(input.userId);
      if (!user) throw new AuthError('invalid_credentials');
      const dek = await checkPassword(user, input.currentPassword);
      if (!dek) {
        audit('password_change_failed', user.id);
        throw new AuthError('invalid_credentials');
      }
      try {
        validateNewPassword(input.newPassword, user.username);
        const pw = await passwordSlot(user.id, input.newPassword, dek);
        db.transaction(() => {
          db.prepare(
            `UPDATE users SET auth_hash = ?, kdf_salt = ?, kdf_params = ?, wrapped_dek_pw = ?,
               password_changed_at = ? WHERE id = ?`,
          ).run(pw.authHash, pw.salt, pw.params, pw.wrapped, now(), user.id);
          db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(
            user.id,
            input.currentSessionId,
          );
          dropLinkCodes(user.id);
          audit('password_changed', user.id);
        })();
      } finally {
        wipe(dek);
      }
    },

    /**
     * Resets a forgotten password with the recovery code. The used code is replaced with
     * a new one (returned once), all sessions end, and a new session is created.
     */
    async recover(input: {
      username: string;
      recoveryCode: string;
      newPassword: string;
      userAgentLabel: string;
    }): Promise<{ recoveryCode: string; session: NewSession; userId: string }> {
      const user = q.userByName.get(input.username);
      const code = normalizeRecoveryCode(input.recoveryCode);
      if (!user || user.disabled_at !== null || code === null) {
        await deriveRecoveryKey(code ?? 'x', dummySalt, kdfParams);
        audit('recover_failed', user?.id ?? null);
        throw new AuthError('invalid_credentials');
      }
      const rk = await deriveRecoveryKey(
        code,
        user.recovery_salt,
        parseParams(user.recovery_kdf_params),
      );
      let dek: Buffer;
      try {
        dek = unwrapKey(rk, user.wrapped_dek_recovery, aadWrap(user.id, 'recovery'));
      } catch (err) {
        if (!(err instanceof DecryptError)) throw err;
        audit('recover_failed', user.id);
        throw new AuthError('invalid_credentials');
      } finally {
        wipe(rk);
      }
      try {
        validateNewPassword(input.newPassword, user.username);
        const pw = await passwordSlot(user.id, input.newPassword, dek);
        const rec = await recoverySlot(user.id, dek);
        const session = db.transaction(() => {
          db.prepare(
            `UPDATE users SET auth_hash = ?, kdf_salt = ?, kdf_params = ?, wrapped_dek_pw = ?,
               recovery_salt = ?, recovery_kdf_params = ?, wrapped_dek_recovery = ?,
               password_changed_at = ? WHERE id = ?`,
          ).run(
            pw.authHash,
            pw.salt,
            pw.params,
            pw.wrapped,
            rec.salt,
            rec.params,
            rec.wrapped,
            now(),
            user.id,
          );
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
          dropLinkCodes(user.id);
          audit('password_recovered', user.id);
          return insertSession(user.id, dek, input.userAgentLabel);
        })();
        return { recoveryCode: rec.recoveryCode, session, userId: user.id };
      } finally {
        wipe(dek);
      }
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
