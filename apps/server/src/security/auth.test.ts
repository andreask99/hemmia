import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DB } from '../db/database.ts';
import {
  AuthError,
  type Auth,
  createAuth,
  DAY,
  INVITE_TTL_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from './auth.ts';
import type { KdfParams } from './crypto.ts';

const FAST: KdfParams = { m: 1024, t: 1, p: 1 };
const PASSWORD = 'blue tractor sings loudly';
const UA = 'test';

let db: DB;
let clock: number;
let auth: Auth;

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 9, 1);
  auth = createAuth({ db, kdfParams: FAST, now: () => clock });
});

async function expectAuthError(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AuthError && e.code === code);
}

async function signUp(username = 'anna', restricted = false) {
  const invite = auth.createInvite({ role: 'member', restricted, createdBy: null });
  return auth.acceptInvite({ code: invite.code, username, password: PASSWORD, userAgentLabel: UA });
}

describe('invites', () => {
  it('creates an account, a session and a recovery code', async () => {
    const res = await signUp();
    expect(res.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    const me = auth.resolveSession(res.session.token);
    expect(me?.username).toBe('anna');
    expect(me?.role).toBe('member');
    expect(me?.dek.length).toBe(32);
  });

  it('stores only a hash of the invite code', () => {
    const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    const dump = JSON.stringify(db.prepare('SELECT * FROM invites').all());
    expect(dump).not.toContain(invite.code);
  });

  it('is single use', async () => {
    const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    await auth.acceptInvite({
      code: invite.code,
      username: 'anna',
      password: PASSWORD,
      userAgentLabel: UA,
    });
    await expectAuthError(
      auth.acceptInvite({
        code: invite.code,
        username: 'ben',
        password: PASSWORD,
        userAgentLabel: UA,
      }),
      'invite_invalid',
    );
  });

  it('expires after 7 days', async () => {
    const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    clock += INVITE_TTL_MS;
    await expectAuthError(
      auth.acceptInvite({
        code: invite.code,
        username: 'anna',
        password: PASSWORD,
        userAgentLabel: UA,
      }),
      'invite_invalid',
    );
  });

  it('rejects unknown codes', async () => {
    await expectAuthError(
      auth.acceptInvite({
        code: 'x'.repeat(43),
        username: 'anna',
        password: PASSWORD,
        userAgentLabel: UA,
      }),
      'invite_invalid',
    );
  });

  it('carries role and restricted flag to the account', async () => {
    const invite = auth.createInvite({ role: 'admin', restricted: true, createdBy: null });
    const res = await auth.acceptInvite({
      code: invite.code,
      username: 'anna',
      password: PASSWORD,
      userAgentLabel: UA,
    });
    const me = auth.resolveSession(res.session.token);
    expect(me?.role).toBe('admin');
    expect(me?.restricted).toBe(true);
  });

  it('rejects a taken username (any case) and keeps the invite usable', async () => {
    await signUp('anna');
    const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    await expectAuthError(
      auth.acceptInvite({
        code: invite.code,
        username: 'ANNA',
        password: PASSWORD,
        userAgentLabel: UA,
      }),
      'username_taken',
    );
    const ok = await auth.acceptInvite({
      code: invite.code,
      username: 'ben',
      password: PASSWORD,
      userAgentLabel: UA,
    });
    expect(ok.userId).toBeTruthy();
  });

  it('rejects weak passwords', async () => {
    for (const password of ['short', 'password1234', 'aaaaaaaaaaaaaaa', 'anna-is-great-2026']) {
      const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
      await expectAuthError(
        auth.acceptInvite({ code: invite.code, username: 'anna', password, userAgentLabel: UA }),
        'weak_password',
      );
    }
  });
});

describe('login', () => {
  it('signs in with the right password', async () => {
    await signUp();
    const s = await auth.login({ username: 'Anna', password: PASSWORD, userAgentLabel: UA });
    expect(auth.resolveSession(s.token)?.username).toBe('anna');
  });

  it('gives the same error for wrong password, unknown and disabled users', async () => {
    const { userId } = await signUp();
    await expectAuthError(
      auth.login({ username: 'anna', password: 'wrong password here', userAgentLabel: UA }),
      'invalid_credentials',
    );
    await expectAuthError(
      auth.login({ username: 'nobody', password: PASSWORD, userAgentLabel: UA }),
      'invalid_credentials',
    );
    db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(clock, userId);
    await expectAuthError(
      auth.login({ username: 'anna', password: PASSWORD, userAgentLabel: UA }),
      'invalid_credentials',
    );
  });

  it('records failures in the audit log without content', async () => {
    await signUp();
    await auth
      .login({ username: 'anna', password: 'wrong password here', userAgentLabel: UA })
      .catch(() => undefined);
    const rows = db.prepare('SELECT * FROM audit_log').all();
    const dump = JSON.stringify(rows);
    expect(dump).toContain('login_failed');
    expect(dump).not.toContain('wrong password');
  });
});

describe('sessions', () => {
  it('stores neither the token nor the data key in clear', async () => {
    const res = await signUp();
    const dek = auth.resolveSession(res.session.token)?.dek;
    const rows = db.prepare('SELECT * FROM sessions').all() as Record<string, unknown>[];
    for (const row of rows) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string') expect(value).not.toBe(res.session.token);
        if (Buffer.isBuffer(value) && dek) expect(value.includes(dek)).toBe(false);
      }
    }
  });

  it('rejects malformed and unknown tokens', async () => {
    await signUp();
    expect(auth.resolveSession('')).toBeNull();
    expect(auth.resolveSession('not a token')).toBeNull();
    expect(auth.resolveSession('A'.repeat(43))).toBeNull();
  });

  it('gives every session the same data key', async () => {
    const res = await signUp();
    const s2 = await auth.login({ username: 'anna', password: PASSWORD, userAgentLabel: UA });
    const a = auth.resolveSession(res.session.token)?.dek;
    const b = auth.resolveSession(s2.token)?.dek;
    expect(a && b && a.equals(b)).toBe(true);
  });

  it('slides the idle expiry but not past the absolute limit', async () => {
    const res = await signUp();
    for (let elapsed = 0; elapsed < SESSION_ABSOLUTE_MS - DAY; elapsed += 20 * DAY) {
      clock += 20 * DAY;
      if (clock - Date.UTC(2026, 9, 1) >= SESSION_ABSOLUTE_MS) break;
      expect(auth.resolveSession(res.session.token)).not.toBeNull();
    }
    clock = Date.UTC(2026, 9, 1) + SESSION_ABSOLUTE_MS;
    expect(auth.resolveSession(res.session.token)).toBeNull();
  });

  it('expires after 30 idle days', async () => {
    const res = await signUp();
    clock += SESSION_IDLE_MS;
    expect(auth.resolveSession(res.session.token)).toBeNull();
  });

  it('logout ends one session, logoutAll ends all', async () => {
    const res = await signUp();
    const s2 = await auth.login({ username: 'anna', password: PASSWORD, userAgentLabel: UA });
    auth.logout(res.session.sessionId);
    expect(auth.resolveSession(res.session.token)).toBeNull();
    expect(auth.resolveSession(s2.token)).not.toBeNull();
    auth.logoutAll(res.userId);
    expect(auth.resolveSession(s2.token)).toBeNull();
  });

  it('stops working when the account is disabled', async () => {
    const res = await signUp();
    db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(clock, res.userId);
    expect(auth.resolveSession(res.session.token)).toBeNull();
  });

  it("cannot be moved to another user's row", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    // An attacker with DB write access swaps user_id on Anna's session.
    db.prepare('UPDATE sessions SET user_id = ? WHERE id = ?').run(
      ben.userId,
      anna.session.sessionId,
    );
    expect(auth.resolveSession(anna.session.token)).toBeNull();
  });
});

describe('change password', () => {
  it('keeps the data key, requires the current password, ends other sessions', async () => {
    const res = await signUp();
    const other = await auth.login({ username: 'anna', password: PASSWORD, userAgentLabel: UA });
    const dekBefore = auth.resolveSession(res.session.token)?.dek;

    await expectAuthError(
      auth.changePassword({
        userId: res.userId,
        currentSessionId: res.session.sessionId,
        currentPassword: 'not my password',
        newPassword: 'green bicycle dances twice',
      }),
      'invalid_credentials',
    );

    await auth.changePassword({
      userId: res.userId,
      currentSessionId: res.session.sessionId,
      currentPassword: PASSWORD,
      newPassword: 'green bicycle dances twice',
    });
    expect(auth.resolveSession(other.token)).toBeNull();
    expect(auth.resolveSession(res.session.token)?.dek.equals(dekBefore ?? Buffer.alloc(0))).toBe(
      true,
    );

    await expectAuthError(
      auth.login({ username: 'anna', password: PASSWORD, userAgentLabel: UA }),
      'invalid_credentials',
    );
    const s = await auth.login({
      username: 'anna',
      password: 'green bicycle dances twice',
      userAgentLabel: UA,
    });
    expect(auth.resolveSession(s.token)?.dek.equals(dekBefore ?? Buffer.alloc(0))).toBe(true);
  });
});

describe('recovery', () => {
  it('resets the password with the recovery code, keeps data, rotates the code', async () => {
    const res = await signUp();
    const dekBefore = auth.resolveSession(res.session.token)?.dek;
    const typed = res.recoveryCode.toLowerCase().replace(/-/g, ' ');

    const rec = await auth.recover({
      username: 'anna',
      recoveryCode: typed,
      newPassword: 'purple kettle whistles often',
      userAgentLabel: UA,
    });
    expect(rec.recoveryCode).not.toBe(res.recoveryCode);
    expect(auth.resolveSession(res.session.token)).toBeNull();
    expect(auth.resolveSession(rec.session.token)?.dek.equals(dekBefore ?? Buffer.alloc(0))).toBe(
      true,
    );

    // The old code no longer works; the new one does.
    await expectAuthError(
      auth.recover({
        username: 'anna',
        recoveryCode: res.recoveryCode,
        newPassword: 'another fine long phrase',
        userAgentLabel: UA,
      }),
      'invalid_credentials',
    );
    await auth.recover({
      username: 'anna',
      recoveryCode: rec.recoveryCode,
      newPassword: 'another fine long phrase',
      userAgentLabel: UA,
    });
    await auth.login({
      username: 'anna',
      password: 'another fine long phrase',
      userAgentLabel: UA,
    });
  });

  it('gives the same error for wrong code, malformed code and unknown user', async () => {
    await signUp();
    for (const [username, recoveryCode] of [
      ['anna', '00000-00000-00000-00000-00000'],
      ['anna', 'not a code at all'],
      ['nobody', '00000-00000-00000-00000-00000'],
    ] as const) {
      await expectAuthError(
        auth.recover({
          username,
          recoveryCode,
          newPassword: 'purple kettle whistles often',
          userAgentLabel: UA,
        }),
        'invalid_credentials',
      );
    }
  });
});

describe('at rest', () => {
  it('stores no password, recovery code or data key in the database', async () => {
    const res = await signUp();
    const dek = auth.resolveSession(res.session.token)?.dek ?? Buffer.alloc(32);
    const rows = db.prepare('SELECT * FROM users').all() as Record<string, unknown>[];
    for (const row of rows) {
      for (const value of Object.values(row)) {
        const s = Buffer.isBuffer(value) ? value.toString('latin1') : String(value);
        expect(s).not.toContain(PASSWORD);
        expect(s).not.toContain(res.recoveryCode.replace(/-/g, ''));
        if (Buffer.isBuffer(value)) expect(value.includes(dek)).toBe(false);
      }
    }
  });
});

describe('timing', () => {
  it('spends about the same time on unknown users as on wrong passwords', async () => {
    // Heavier parameters so Argon2 dominates; still fast enough for a unit test.
    const timed = createAuth({ db, kdfParams: { m: 16384, t: 2, p: 1 }, now: () => clock });
    const invite = timed.createInvite({ role: 'member', restricted: false, createdBy: null });
    await timed.acceptInvite({
      code: invite.code,
      username: 'anna',
      password: PASSWORD,
      userAgentLabel: UA,
    });
    const measure = async (username: string) => {
      const runs: number[] = [];
      for (let i = 0; i < 9; i++) {
        const start = performance.now();
        await timed
          .login({ username, password: 'wrong password here', userAgentLabel: UA })
          .catch(() => undefined);
        runs.push(performance.now() - start);
      }
      runs.sort((a, b) => a - b);
      return runs[4] ?? 0;
    };
    const known = await measure('anna');
    const unknown = await measure('nobody-here');
    // Loose bounds (tests run in parallel); skipping Argon2 would be ~100x faster.
    expect(unknown / known).toBeGreaterThan(0.4);
    expect(unknown / known).toBeLessThan(2.5);
  });
});
