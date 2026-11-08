import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DB } from '../db/database.ts';
import { type Auth, createAuth } from './auth.ts';
import { type Admin, createAdmin } from './admin.ts';

let db: DB;
let auth: Auth;
let admin: Admin;

beforeEach(async () => {
  db = openDatabase(':memory:');
  auth = createAuth({ db, kdfParams: { m: 1024, t: 1, p: 1 } });
  admin = createAdmin(db);
  for (const username of ['ben', 'anna']) {
    const invite = auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    await auth.acceptInvite({
      code: invite.code,
      username,
      password: 'blue tractor sings loudly',
      userAgentLabel: '',
    });
  }
});

describe('admin', () => {
  it('lists users without any secrets', () => {
    const users = admin.listUsers();
    expect(users.map((u) => u.username)).toEqual(['anna', 'ben']);
    expect(users[0]?.sessions).toBe(1);
    expect(Object.keys(users[0] ?? {}).sort()).toEqual([
      'createdAt',
      'disabledAt',
      'id',
      'lastSeenAt',
      'restricted',
      'role',
      'sessions',
      'username',
    ]);
  });

  it('disables a user and ends their sessions; enable restores login', async () => {
    expect(admin.disableUser('Anna')).toBe(true);
    const anna = admin.listUsers().find((u) => u.username === 'anna');
    expect(anna?.disabledAt).not.toBeNull();
    expect(anna?.sessions).toBe(0);
    await expect(
      auth.login({ username: 'anna', password: 'blue tractor sings loudly', userAgentLabel: '' }),
    ).rejects.toThrow();
    expect(admin.enableUser('anna')).toBe(true);
    await auth.login({
      username: 'anna',
      password: 'blue tractor sings loudly',
      userAgentLabel: '',
    });
  });

  it('sets the restricted flag', () => {
    expect(admin.setRestricted('ben', true)).toBe(true);
    expect(admin.listUsers().find((u) => u.username === 'ben')?.restricted).toBe(true);
  });

  it("drops a disabled admin's unused invites", () => {
    const anna = admin.listUsers().find((u) => u.username === 'anna')?.id ?? null;
    auth.createInvite({ role: 'admin', restricted: false, createdBy: anna });
    auth.createInvite({ role: 'member', restricted: false, createdBy: null });
    expect(admin.listInvites()).toHaveLength(2);
    admin.disableUser('anna');
    expect(admin.listInvites().map((i) => i.createdBy)).toEqual([null]);
  });

  it('returns false for unknown users', () => {
    expect(admin.disableUser('nobody')).toBe(false);
    expect(admin.enableUser('nobody')).toBe(false);
    expect(admin.setRestricted('nobody', true)).toBe(false);
  });
});
