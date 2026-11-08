import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSearchManager,
  loopbackPort,
  SEARXNG_COMMIT,
  SEARXNG_SHA256,
  type SearchDeps,
} from './search.ts';
import { UV_SHA256 } from './uv.ts';

const log = { info: vi.fn(), warn: vi.fn() };
let dir: string;
let project: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hemmia-search-'));
  project = join(dir, 'project');
  mkdirSync(project);
  writeFileSync(join(project, 'uv.lock'), 'lock v1');
  writeFileSync(
    join(project, 'settings.yml'),
    "server:\n  bind_address: '127.0.0.1'\n  port: 8888\n  secret_key: '__SECRET__'\n",
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

class FakeProcess extends EventEmitter {
  kill = vi.fn(() => true);
}

function fakes(over: Partial<SearchDeps> = {}) {
  let answering = false;
  const started: { python: string; env: NodeJS.ProcessEnv; proc: FakeProcess }[] = [];
  const runs: string[][] = [];
  const deps: SearchDeps = {
    download: vi.fn(async (url: string, dest: string) => {
      writeFileSync(dest, 'x');
      return url.includes('astral-sh/uv') ? UV_SHA256 : SEARXNG_SHA256;
    }),
    extract: vi.fn(async (archive: string, into: string) => {
      if (archive.endsWith('uv.tar.gz')) {
        const bin = join(into, 'uv-aarch64-apple-darwin', 'uv');
        mkdirSync(dirname(bin), { recursive: true });
        writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
      } else {
        mkdirSync(join(into, `searxng-${SEARXNG_COMMIT}`, 'searx'), { recursive: true });
      }
    }),
    run: vi.fn(async (_file: string, args: string[], env: NodeJS.ProcessEnv) => {
      runs.push(args);
      const venv = env['UV_PROJECT_ENVIRONMENT'] ?? '';
      mkdirSync(join(venv, 'bin'), { recursive: true });
      writeFileSync(join(venv, 'bin', 'python'), '#!/bin/sh\n', { mode: 0o755 });
    }),
    start: vi.fn((python: string, env: NodeJS.ProcessEnv) => {
      const proc = new FakeProcess();
      started.push({ python, env, proc });
      return proc as unknown as ChildProcess;
    }),
    reachable: vi.fn(async () => answering),
    ...over,
  };
  return {
    deps,
    started,
    runs,
    answer: (on: boolean) => {
      answering = on;
    },
  };
}

function manager(deps: Partial<SearchDeps>, over: { container?: boolean; url?: string } = {}) {
  return createSearchManager({
    dataDir: dir,
    projectDir: project,
    searxngUrl: over.url ?? 'http://127.0.0.1:8890',
    platform: 'darwin',
    arch: 'arm64',
    container: over.container ?? false,
    log,
    deps,
  });
}

async function settled(m: ReturnType<typeof manager>) {
  await vi.waitFor(async () => {
    expect((await m.status()).state).not.toBe('installing');
  });
}

describe('web search set up by Hemmia', () => {
  it('only runs SearXNG on a loopback address', () => {
    expect(loopbackPort('http://127.0.0.1:8888')).toBe(8888);
    expect(loopbackPort('http://searxng:8080')).toBeNull();
  });

  it('uses a SearXNG that already answers, and is not offered in Docker', async () => {
    const f = fakes();
    f.answer(true);
    const m = manager(f.deps);
    expect(await m.status()).toEqual({ state: 'ready' });
    expect(await m.beginInstall()).toBe(false);
    f.answer(false);
    expect(await manager(f.deps, { container: true }).status()).toEqual({ state: 'unsupported' });
    expect(f.deps.download).not.toHaveBeenCalled();
  });

  it('downloads the pinned source, builds from the lock file, writes private settings and starts it', async () => {
    const f = fakes();
    const m = manager(f.deps);
    expect(await m.status()).toEqual({ state: 'off' });
    expect(await m.beginInstall()).toBe(true);
    await settled(m);

    expect(f.deps.download).toHaveBeenCalledWith(
      `https://github.com/searxng/searxng/archive/${SEARXNG_COMMIT}.tar.gz`,
      expect.any(String),
      expect.any(Function),
    );
    expect(f.runs[0]).toEqual(['sync', '--frozen', '--no-dev', '--project', project]);
    const settings = join(dir, 'runtime', 'searxng', 'settings.yml');
    const text = readFileSync(settings, 'utf8');
    expect(text).toMatch(/secret_key: '[0-9a-f]{64}'/);
    expect(text).toContain('port: 8890');
    expect(statSync(settings).mode & 0o777).toBe(0o600);

    expect(f.started).toHaveLength(1);
    expect(f.started[0]?.env).toEqual({
      HOME: homedir(),
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      PYTHONPATH: join(dir, 'runtime', 'searxng', 'src'),
      SEARXNG_SETTINGS_PATH: settings,
    });
    expect(await m.status()).toEqual({ state: 'starting' });
    f.answer(true);
    expect(await m.status()).toEqual({ state: 'ready' });
    m.close();
    expect(f.started[0]?.proc.kill).toHaveBeenCalled();
  });

  it('refuses a source archive with the wrong checksum and runs nothing', async () => {
    const f = fakes({
      download: vi.fn(async (url: string, dest: string) => {
        writeFileSync(dest, 'x');
        return url.includes('astral-sh/uv') ? UV_SHA256 : 'f'.repeat(64);
      }),
    });
    const m = manager(f.deps);
    await m.beginInstall();
    await settled(m);
    expect(await m.status()).toEqual({ state: 'failed', error: 'checksum' });
    expect(f.runs).toHaveLength(0);
    expect(f.started).toHaveLength(0);
  });

  it('starts again with the hub, keeps its secret, and restarts it when it stops', async () => {
    const f = fakes();
    const first = manager(f.deps);
    await first.beginInstall();
    await settled(first);
    first.close();
    const secret = /secret_key: '([0-9a-f]{64})'/.exec(
      readFileSync(join(dir, 'runtime', 'searxng', 'settings.yml'), 'utf8'),
    )?.[1];

    vi.useFakeTimers();
    const m = manager(f.deps);
    await m.start();
    expect(f.started).toHaveLength(2);
    f.started[1]?.proc.emit('exit', 1, null);
    vi.advanceTimersByTime(2000);
    expect(f.started).toHaveLength(3);
    m.close();

    // An update with a new lock file rebuilds, with the same secret.
    vi.useRealTimers();
    writeFileSync(join(project, 'uv.lock'), 'lock v2');
    const updated = manager(f.deps);
    await updated.start();
    await settled(updated);
    expect(f.runs).toHaveLength(2);
    expect(readFileSync(join(dir, 'runtime', 'searxng', 'settings.yml'), 'utf8')).toContain(
      secret ?? 'missing',
    );
    updated.close();
  });
});
