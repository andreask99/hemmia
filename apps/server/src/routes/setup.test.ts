import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountResponse, SetupState } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { createSetup, normalizeSetupCode } from '../security/setup.ts';

const ORIGIN = 'http://localhost:5173';
let built: App | undefined;
afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

async function app(): Promise<App> {
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
  });
  return built;
}

const account = (b: App, setupCode: string, username = 'boss') =>
  b.app.inject({
    method: 'POST',
    url: '/api/setup/account',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({
      setupCode,
      username,
      password: 'blue tractor sings loudly',
      familyName: 'Miller',
      lang: 'de',
    }),
  });

describe('setup mode', () => {
  it('serves the state only while there are no users', async () => {
    const b = await app();
    const state = SetupState.parse(
      (await b.app.inject({ method: 'GET', url: '/api/setup/state' })).json(),
    );
    expect(state).toMatchObject({ needsSetup: true, familyName: null });
    expect(state.machine.memoryGiB).toBeGreaterThan(0);
    const code = b.setup.ensureCode();
    if (!code) throw new Error('no code');
    expect((await account(b, code)).statusCode).toBe(200);
    expect((await b.app.inject({ method: 'GET', url: '/api/setup/state' })).statusCode).toBe(404);
  });

  it('creates the first admin with the code, signs them in and returns the recovery code', async () => {
    const b = await app();
    const code = b.setup.ensureCode();
    if (!code) throw new Error('no code');
    // Typed with dashes and lower case still works.
    const res = await account(b, `${code.slice(0, 10).toLowerCase()}-${code.slice(10)}`);
    expect(res.statusCode).toBe(200);
    const body = AccountResponse.parse(res.json());
    expect(body.me).toMatchObject({ username: 'boss', role: 'admin', language: 'de' });
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(String(res.headers['set-cookie'])).toContain('hemmia_session=');
    const family = b.db.prepare("SELECT value FROM settings WHERE key = 'family'").get() as {
      value: string;
    };
    expect(JSON.parse(family.value)).toEqual({ name: 'Miller' });
    expect(b.db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'setup'").get()).toEqual({
      n: 0,
    });
    const audit = b.db.prepare("SELECT event FROM audit_log WHERE event = 'setup_completed'").all();
    expect(audit).toHaveLength(1);
  });

  it('refuses a wrong code, and a second setup after the first', async () => {
    const b = await app();
    const code = b.setup.ensureCode();
    if (!code) throw new Error('no code');
    const wrong = await account(b, 'A'.repeat(20));
    expect(wrong.statusCode).toBe(403);
    expect((await account(b, 'not a code at all')).statusCode).toBe(403);
    expect((await account(b, code)).statusCode).toBe(200);
    // The same code again, and any other request: setup is over.
    const again = await account(b, code, 'mallory');
    expect(again.statusCode).toBe(404);
    expect(b.setup.ensureCode()).toBeNull();
  });

  it('refuses setup when users exist (an existing family hub)', async () => {
    const b = await app();
    b.auth.createInvite({ role: 'admin', restricted: false, createdBy: null });
    const invite = b.auth.createInvite({ role: 'admin', restricted: false, createdBy: null });
    await b.app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({
        code: invite.code,
        username: 'anna',
        password: 'blue tractor sings loudly',
      }),
    });
    expect(b.setup.ensureCode()).toBeNull();
    expect((await account(b, 'A'.repeat(20))).statusCode).toBe(404);
    await expect(
      b.auth.createFirstAdmin({
        username: 'mallory',
        password: 'blue tractor sings loudly',
        language: 'en',
        userAgentLabel: '',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('slows down guessing', async () => {
    const b = await app();
    b.setup.ensureCode();
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await account(b, String(i).repeat(20))).statusCode);
    expect(codes.slice(0, 5)).toEqual([403, 403, 403, 403, 403]);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('setup code file', () => {
  it('is written 0600, kept for 24 hours, then replaced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'setup-'));
    try {
      let clock = 1_000_000;
      const db = openDatabase(':memory:');
      const s = createSetup({ db, dataDir: dir, needsSetup: () => true, now: () => clock });
      const code = s.ensureCode();
      if (!code) throw new Error('no code');
      const file = join(dir, 'setup-code.txt');
      expect(readFileSync(file, 'utf8').trim()).toBe(code);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(s.ensureCode()).toBeNull();
      expect(s.verify(code)).toBe(true);
      clock += 24 * 60 * 60_000;
      expect(s.verify(code)).toBe(false);
      const next = s.ensureCode();
      expect(next).not.toBeNull();
      expect(next).not.toBe(code);
      s.complete();
      expect(existsSync(file)).toBe(false);
      expect(normalizeSetupCode('abc')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
