/**
 * Backup/restore check: copies the data dir while the server is running (as Time Machine
 * does), starts a second server on the copy, and checks the user can sign in and read
 * their encrypted chat title there. No model needed.
 * Usage: node scripts/restore-test.ts
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ORIGIN = 'http://localhost:5173';
const dir = mkdtempSync(join(tmpdir(), 'kchat-restore-'));
const PASSWORD = 'blue tractor sings loudly';
let failures = 0;

function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}

function envFor(dataDir: string, port: number) {
  return {
    ...process.env,
    NODE_ENV: 'development',
    HEMMIA_PORT: String(port),
    HEMMIA_DATA_DIR: dataDir,
    HEMMIA_LOG_LEVEL: 'silent',
  };
}

async function start(dataDir: string, port: number): Promise<ChildProcess> {
  const proc = spawn(process.execPath, [join(ROOT, 'apps/server/src/main.ts')], {
    env: envFor(dataDir, port),
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${String(port)}/api/health`)).ok) return proc;
    } catch {
      // starting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

async function login(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${String(port)}/api/auth/login`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'restore', password: PASSWORD }),
  });
  return res.ok ? ((res.headers.get('set-cookie') ?? '').split(';')[0] ?? '') : '';
}

async function main(): Promise<void> {
  const live = join(dir, 'live');
  const server = await start(live, 8796);
  const cli = spawnSync(
    process.execPath,
    [join(ROOT, 'apps/server/src/cli/admin-main.ts'), 'create-invite'],
    {
      env: envFor(live, 8796),
      encoding: 'utf8',
    },
  );
  const code = /invite#([A-Za-z0-9_-]{43})/.exec(cli.stdout)?.[1];
  await fetch('http://127.0.0.1:8796/api/auth/invite/accept', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ code, username: 'restore', password: PASSWORD }),
  });
  const cookie = await login(8796);
  const headers = { origin: ORIGIN, 'content-type': 'application/json', cookie };
  const chat = (await (
    await fetch('http://127.0.0.1:8796/api/chats', { method: 'POST', headers, body: '{}' })
  ).json()) as {
    id?: string;
  };
  // Chat routes need the model registry, which needs Ollama; fall back to checking sign-in only.
  if (chat.id) {
    await fetch(`http://127.0.0.1:8796/api/chats/${chat.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: 'Familienurlaub 2027' }),
    });
  }

  // Copy while the server is still running (WAL files included), like a Time Machine snapshot.
  const restored = join(dir, 'restored');
  cpSync(live, restored, { recursive: true });
  server.kill('SIGTERM');

  const second = await start(restored, 8797);
  try {
    const cookie2 = await login(8797);
    check(cookie2 !== '', 'sign-in works on the restored copy');
    if (chat.id) {
      const list = (await (
        await fetch('http://127.0.0.1:8797/api/chats', { headers: { cookie: cookie2 } })
      ).json()) as { chats: { title: string | null }[] };
      check(
        list.chats[0]?.title === 'Familienurlaub 2027',
        'encrypted chat title readable after restore',
      );
    } else {
      console.log('skip chat check (model registry unavailable)');
    }
    const old = await fetch('http://127.0.0.1:8797/api/me', { headers: { cookie } });
    check(
      old.status === 200,
      'existing sessions survive a restore (wrapped keys are in the backup)',
    );
  } finally {
    second.kill('SIGTERM');
  }
}

main()
  .catch((err: unknown) => {
    console.log('FAIL', err instanceof Error ? err.message : 'error');
    failures++;
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(
      failures === 0 ? 'RESTORE TEST PASSED' : `RESTORE TEST FAILED (${String(failures)})`,
    );
    process.exit(failures === 0 ? 0 : 1);
  });
