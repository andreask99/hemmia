import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaSetupStatus } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';

const ORIGIN = 'http://localhost';
let built: App | undefined;
afterEach(async () => {
  await built?.app.close();
  built = undefined;
});

async function setup() {
  const b = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    // Answers as "Ollama already runs here": the route must not install anything then.
    ollamaDeps: { reachable: vi.fn(async () => true), download: vi.fn() },
  });
  built = b;
  const signUp = async (username: string, role: 'admin' | 'member') => {
    const invite = b.auth.createInvite({ role, restricted: false, createdBy: null });
    const res = await b.app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({
        code: invite.code,
        username,
        password: 'blue tractor sings loudly',
      }),
    });
    return String(res.headers['set-cookie']).split(';')[0] ?? '';
  };
  return { b, signUp };
}

describe('Ollama setup routes', () => {
  it('are for admins only, and install nothing when an Ollama already answers', async () => {
    const { b, signUp } = await setup();
    const admin = await signUp('boss', 'admin');
    const member = await signUp('anna', 'member');
    const get = (cookie: string) =>
      b.app.inject({ method: 'GET', url: '/api/admin/ollama', headers: { cookie } });
    const install = (cookie: string) =>
      b.app.inject({
        method: 'POST',
        url: '/api/admin/ollama/install',
        headers: { cookie, origin: ORIGIN },
      });
    expect((await get(member)).statusCode).toBe(403);
    expect((await install(member)).statusCode).toBe(403);
    expect(OllamaSetupStatus.parse((await get(admin)).json()).state).toBe('external');
    expect((await install(admin)).statusCode).toBe(409);
  });
});
