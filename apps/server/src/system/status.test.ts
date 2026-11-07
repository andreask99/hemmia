import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AccountResponse, SystemStatus } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { parseFreePercent, parseSwap } from './status.ts';

const ORIGIN = 'http://localhost:5173';
const GiB = 1024 ** 3;
const NOW = 1_800_000_000_000;

describe('macOS output parsing', () => {
  it('reads memory pressure and swap', () => {
    expect(parseFreePercent('System-wide memory free percentage: 26%')).toBe(26);
    expect(parseFreePercent('nonsense')).toBeNull();
    expect(parseSwap('total = 3072.00M  used = 1476.69M  free = 1595.31M  (encrypted)')).toEqual({
      total: 3072 * 1024 ** 2,
      used: 1476.69 * 1024 ** 2,
    });
    expect(parseSwap('total = 0.00M  used = 0.00M')).toEqual({ total: 0, used: 0 });
  });
});

describe('GET /api/admin/system', () => {
  let built: App;
  let app: FastifyInstance;
  beforeEach(async () => {
    built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
      db: openDatabase(':memory:'),
      kdfParams: { m: 1024, t: 1, p: 1 },
      now: () => NOW,
      systemExec: (cmd) =>
        Promise.resolve(
          cmd === 'memory_pressure'
            ? 'System-wide memory free percentage: 25%'
            : cmd === 'sysctl'
              ? 'total = 2048.00M  used = 1024.00M  free = 1024.00M'
              : '4096\t/some/path',
        ),
      systemFetch: (url) => {
        const u = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (u.endsWith('/api/ps')) {
          return Promise.resolve(
            Response.json({
              models: [
                {
                  name: 'gemma4:26b',
                  size: 1 * GiB,
                  expires_at: new Date(NOW + 240_000).toISOString(),
                },
                { name: 'qwen3-coder-dev:latest', size: 20 * GiB },
              ],
            }),
          );
        }
        return Promise.resolve(new Response('down', { status: 503 }));
      },
    });
    app = built.app;
  });
  afterEach(async () => {
    await app.close();
  });

  async function signUp(username: string, role: 'admin' | 'member') {
    const invite = built.auth.createInvite({ role, restricted: false, createdBy: null });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/accept',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({
        code: invite.code,
        username,
        password: 'blue tractor sings loudly',
      }),
    });
    AccountResponse.parse(res.json());
    return String(res.headers['set-cookie']).split(';')[0] ?? '';
  }
  const get = (cookie: string) =>
    app.inject({ method: 'GET', url: '/api/admin/system', headers: { origin: ORIGIN, cookie } });

  it('is for admins only', async () => {
    const member = await signUp('ben', 'member');
    expect((await get(member)).statusCode).toBe(403);
    expect((await get('')).statusCode).toBe(401);
  });

  it('reports memory, models (kchat vs other), activity, services and 24-hour counts', async () => {
    const boss = await signUp('boss', 'admin');
    let release: () => void = () => undefined;
    built.scheduler.submit({
      userId: 'someone',
      kind: 'chat',
      need: { engine: 'ollama', model: 'gemma4:26b', memoryGiB: 1 },
      timeoutMs: 60_000,
      run: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    await new Promise((r) => setTimeout(r, 20));
    const res = await get(boss);
    expect(res.statusCode).toBe(200);
    const s = SystemStatus.parse(res.json());
    expect(s.mac.usedBytes / s.mac.totalBytes).toBeCloseTo(0.75, 2);
    expect(s.mac.swapUsedBytes).toBe(1024 * 1024 ** 2);
    // Configured size wins over Ollama's under-report; foreign models are marked.
    expect(s.models).toEqual([
      {
        engine: 'ollama',
        model: 'gemma4:26b',
        memoryBytes: 22 * GiB,
        kchat: true,
        unloadsAt: NOW + 240_000,
      },
      {
        engine: 'ollama',
        model: 'qwen3-coder-dev:latest',
        memoryBytes: 20 * GiB,
        kchat: false,
        unloadsAt: null,
      },
    ]);
    expect(s.activity).toMatchObject({
      running: { kind: 'chat', model: 'gemma4:26b' },
      queued: 0,
      paused: false,
    });
    expect(s.services).toEqual({ ollama: true, searxng: false, imageWorker: 'idle' });
    expect(s.last24h).toEqual({ replies: 0, pictures: 0, searches: 0, activeUsers: 0 });
    // No user ids or names in the view.
    expect(res.body).not.toContain('someone');
    expect(res.body).not.toContain('boss');
    release();
  });
});
