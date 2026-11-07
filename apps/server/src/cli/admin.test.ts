import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.ts';
import { createOverrideStore, type OverrideStore } from '../models/overrides.ts';
import { type Admin, createAdmin } from '../security/admin.ts';
import { type Auth, createAuth } from '../security/auth.ts';
import { runAdmin } from './admin.ts';

let auth: Auth;
let admin: Admin;
let overrides: OverrideStore;
let out: string[];
let err: string[];
const run = (...argv: string[]) =>
  runAdmin(argv, {
    auth,
    admin,
    overrides,
    baseUrl: 'https://hemmia.example.ts.net',
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    formatTime: () => 'T',
  });

async function user(username: string) {
  const { code } = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
  await auth.acceptInvite({
    code,
    username,
    password: 'blue tractor sings loudly',
    userAgentLabel: '',
  });
}

beforeEach(() => {
  const db = openDatabase(':memory:');
  auth = createAuth({ db, kdfParams: { m: 1024, t: 1, p: 1 } });
  admin = createAdmin(db);
  overrides = createOverrideStore(db);
  out = [];
  err = [];
});

describe('admin CLI', () => {
  it('creates invite links', () => {
    expect(run('create-invite')).toBe(0);
    expect(out[0]).toBe('Invite for a new member account, valid until T:');
    expect(out[1]).toMatch(/^https:\/\/hemmia\.example\.ts\.net\/invite#[A-Za-z0-9_-]{43}$/);
    out = [];
    run('create-invite', '--restricted', '--admin');
    expect(out[0]).toBe('Invite for a new admin, restricted account, valid until T:');
    expect(run('create-invite', '--bogus')).toBe(1);
  });

  it('lists users in aligned columns', async () => {
    run('list-users');
    expect(out).toEqual(['No users yet.']);
    await user('anna');
    await user('ben');
    out = [];
    run('restrict', 'ben');
    out = [];
    run('list-users');
    expect(out[0]).toMatch(/^USERNAME {2}ROLE/);
    expect(out[1]).toMatch(/^anna /);
    expect(out[2]).toMatch(/^ben .* yes /);
    expect(out.every((l) => !l.endsWith(' '))).toBe(true);
  });

  it('disables and reports unknown users', async () => {
    await user('anna');
    expect(run('disable-user', 'anna')).toBe(0);
    expect(out).toEqual(['Disabled anna.']);
    expect(admin.listUsers()[0]?.disabledAt).not.toBeNull();
    expect(run('disable-user', 'nobody')).toBe(1);
    expect(err).toEqual(['No user named nobody.']);
  });

  it('rejects unknown commands', () => {
    expect(run('frobnicate')).toBe(1);
    expect(err[0]).toBe('Unknown command: frobnicate');
    expect(run()).toBe(0);
  });

  it('pauses and resumes Hemmia, keeping other settings', () => {
    overrides.set({ ...overrides.get(), disabled: ['gemma4-12b'] });
    expect(run('pause')).toBe(0);
    expect(overrides.get()).toMatchObject({ paused: true, disabled: ['gemma4-12b'] });
    run('status');
    expect(out.at(-1)).toBe('Hemmia is paused.');
    expect(run('resume')).toBe(0);
    expect(overrides.get().paused).toBe(false);
    expect(run('pause', 'now')).toBe(1);
  });
});
