import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DB } from '../db/database.ts';
import {
  createOllamaManager,
  loopbackHost,
  OLLAMA_SHA256,
  OLLAMA_VERSION,
  type OllamaDeps,
} from './ollama.ts';

const log = { info: vi.fn(), warn: vi.fn() };
let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hemmia-ollama-'));
  db = openDatabase(':memory:');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

class FakeProcess extends EventEmitter {
  kill = vi.fn(() => true);
}

function fakes(over: Partial<OllamaDeps> = {}) {
  let answering = false;
  const started: { binary: string; env: NodeJS.ProcessEnv; proc: FakeProcess }[] = [];
  const deps: OllamaDeps = {
    download: vi.fn(async () => OLLAMA_SHA256),
    extract: vi.fn(async (_archive: string, into: string) => {
      writeFileSync(join(into, 'ollama'), '#!/bin/sh\n', { mode: 0o755 });
    }),
    verifySignature: vi.fn(async () => true),
    start: vi.fn((binary: string, env: NodeJS.ProcessEnv) => {
      const proc = new FakeProcess();
      started.push({ binary, env, proc });
      return proc as unknown as ChildProcess;
    }),
    reachable: vi.fn(async () => answering),
    ...over,
  };
  return {
    deps,
    started,
    answer: (on: boolean) => {
      answering = on;
    },
  };
}

function manager(
  deps: Partial<OllamaDeps>,
  platform: NodeJS.Platform = 'darwin',
  container = false,
) {
  return createOllamaManager({
    db,
    dataDir: dir,
    ollamaUrl: 'http://127.0.0.1:11434',
    platform,
    container,
    log,
    deps,
  });
}

/** Waits until the background install has finished. */
async function settled(m: ReturnType<typeof manager>) {
  await vi.waitFor(async () => {
    expect((await m.status()).state).not.toBe('installing');
  });
}

describe('Ollama installed by Hemmia', () => {
  it('only serves Ollama on the loopback address', () => {
    expect(loopbackHost('http://127.0.0.1:11434')).toBe('127.0.0.1:11434');
    expect(loopbackHost('http://localhost:12000')).toBe('127.0.0.1:12000');
    expect(loopbackHost('http://ollama:11434')).toBeNull();
    expect(loopbackHost('http://192.168.1.5:11434')).toBeNull();
    expect(loopbackHost('https://127.0.0.1:11434')).toBeNull();
  });

  it('is not offered outside a Mac or in Docker', async () => {
    const f = fakes();
    for (const m of [manager(f.deps, 'linux'), manager(f.deps, 'darwin', true)]) {
      expect((await m.status()).state).toBe('unsupported');
      expect(await m.beginInstall()).toBe(false);
    }
    expect(f.deps.download).not.toHaveBeenCalled();
  });

  it('uses an Ollama that already answers and installs nothing', async () => {
    const f = fakes();
    f.answer(true);
    const m = manager(f.deps);
    expect(await m.status()).toEqual({ state: 'external', version: null });
    expect(await m.beginInstall()).toBe(false);
    expect(f.deps.download).not.toHaveBeenCalled();
  });

  it('downloads, checks, unpacks and starts the pinned version on loopback', async () => {
    const f = fakes();
    const m = manager(f.deps);
    expect((await m.status()).state).toBe('missing');
    expect(await m.beginInstall()).toBe(true);
    await settled(m);

    expect(f.deps.download).toHaveBeenCalledWith(
      `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin.tgz`,
      expect.any(String),
      expect.any(Function),
    );
    expect(f.started).toHaveLength(1);
    const run = f.started[0];
    expect(run?.binary).toBe(join(dir, 'runtime', `ollama-${OLLAMA_VERSION}`, 'ollama'));
    expect(run?.env['OLLAMA_HOST']).toBe('127.0.0.1:11434');
    // Nothing else from the hub's environment (keys, tokens) is passed on.
    expect(Object.keys(run?.env ?? {}).sort()).toEqual(['HOME', 'OLLAMA_HOST', 'PATH']);

    expect((await m.status()).state).toBe('starting');
    f.answer(true);
    expect(await m.status()).toEqual({ state: 'managed', version: null });
    m.close();
    expect(run?.proc.kill).toHaveBeenCalled();
  });

  it('refuses an archive with the wrong checksum and runs nothing', async () => {
    const f = fakes({ download: vi.fn(async () => 'f'.repeat(64)) });
    const m = manager(f.deps);
    await m.beginInstall();
    await settled(m);
    expect(await m.status()).toMatchObject({ state: 'failed', error: 'checksum' });
    expect(f.deps.extract).not.toHaveBeenCalled();
    expect(f.started).toHaveLength(0);
  });

  it("refuses a binary without Ollama's signature", async () => {
    const f = fakes({ verifySignature: vi.fn(async () => false) });
    const m = manager(f.deps);
    await m.beginInstall();
    await settled(m);
    expect(await m.status()).toMatchObject({ state: 'failed', error: 'signature' });
    expect(f.started).toHaveLength(0);
    // Not installed: after a restart of the hub nothing is started either.
    await manager(f.deps).start();
    expect(f.started).toHaveLength(0);
  });

  it('starts it again with the hub, and restarts it with growing pauses when it stops', async () => {
    const f = fakes();
    const first = manager(f.deps);
    await first.beginInstall();
    await settled(first);
    first.close();

    vi.useFakeTimers();
    const m = manager(f.deps);
    await m.start();
    expect(f.started).toHaveLength(2);
    f.started[1]?.proc.emit('exit', 1, null);
    vi.advanceTimersByTime(1999);
    expect(f.started).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(f.started).toHaveLength(3);
    m.close();
    f.started[2]?.proc.emit('exit', null, 'SIGTERM');
    vi.advanceTimersByTime(120_000);
    expect(f.started).toHaveLength(3);
  });
});
