import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPicturesManager,
  MODEL_FILES,
  PICTURE_MODEL,
  UV_SHA256,
  UV_VERSION,
  type PicturesDeps,
} from './pictures.ts';

const log = { info: vi.fn(), warn: vi.fn() };
let dir: string;
let project: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hemmia-pictures-'));
  project = join(dir, 'project');
  mkdirSync(project);
  writeFileSync(join(project, 'uv.lock'), 'lock v1');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Downloads write a small file and answer with the expected checksum (by URL). */
function fakes(over: Partial<PicturesDeps> = {}) {
  const runs: { file: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const deps: PicturesDeps = {
    download: vi.fn(async (url: string, dest: string) => {
      writeFileSync(dest, 'x');
      if (url.includes('astral-sh/uv')) return UV_SHA256;
      const file = MODEL_FILES.find(([f]) => url.endsWith(`/${f}`));
      return file ? file[1] : 'unknown';
    }),
    extract: vi.fn(async (_archive: string, into: string) => {
      const bin = join(into, 'uv-aarch64-apple-darwin', 'uv');
      mkdirSync(dirname(bin), { recursive: true });
      writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
    }),
    run: vi.fn(async (file: string, args: string[], env: NodeJS.ProcessEnv) => {
      runs.push({ file, args, env });
    }),
    ...over,
  };
  return { deps, runs };
}

function manager(deps: Partial<PicturesDeps>, over: { memoryGiB?: number; arch?: string } = {}) {
  return createPicturesManager({
    dataDir: dir,
    projectDir: project,
    platform: 'darwin',
    arch: over.arch ?? 'arm64',
    container: false,
    memoryGiB: () => over.memoryGiB ?? 32,
    log,
    deps,
  });
}

async function settled(m: ReturnType<typeof manager>) {
  await vi.waitFor(async () => {
    expect((await m.status()).state).not.toBe('installing');
  });
}

describe('pictures set up by Hemmia', () => {
  it('is offered only on Apple silicon with enough memory', async () => {
    const f = fakes();
    expect(await manager(f.deps, { arch: 'x64' }).status()).toEqual({
      state: 'unsupported',
      reason: 'platform',
    });
    const small = manager(f.deps, { memoryGiB: 16 });
    expect(await small.status()).toEqual({ state: 'unsupported', reason: 'memory' });
    expect(small.beginInstall()).toBe(false);
    expect((await manager(f.deps).status()).state).toBe('off');
  });

  it('installs uv, builds the engine from the lock file and downloads the checked model', async () => {
    const f = fakes();
    const m = manager(f.deps);
    expect(m.worker()).toBeNull();
    expect(m.beginInstall()).toBe(true);
    await settled(m);
    expect(await m.status()).toEqual({ state: 'ready' });

    expect(f.deps.download).toHaveBeenCalledWith(
      `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-apple-darwin.tar.gz`,
      expect.any(String),
      expect.any(Function),
    );
    const sync = f.runs[0];
    expect(sync?.args).toEqual([
      'sync',
      '--frozen',
      '--no-dev',
      '--no-editable',
      '--project',
      project,
    ]);
    expect(sync?.env['UV_PROJECT_ENVIRONMENT']).toBe(join(dir, 'runtime', 'imagegen', 'venv'));
    expect(sync?.env['UV_PYTHON_PREFERENCE']).toBe('only-managed');
    // No secrets of the hub go to the installer.
    expect(
      Object.keys(sync?.env ?? {}).every(
        (k) => k === 'HOME' || k === 'PATH' || k.startsWith('UV_'),
      ),
    ).toBe(true);
    // Every model file came from the pinned revision.
    const modelCalls = vi
      .mocked(f.deps.download)
      .mock.calls.filter(([url]) => url.includes('huggingface.co'));
    expect(modelCalls).toHaveLength(MODEL_FILES.length);
    expect(modelCalls.every(([url]) => url.includes('/resolve/794cd159'))).toBe(true);

    expect(m.worker()).toEqual({
      command: [join(dir, 'runtime', 'imagegen', 'venv', 'bin', 'python'), '-m', 'kchat_imagegen'],
      env: { HEMMIA_IMAGEGEN_MODEL_DIR: join(dir, 'runtime', 'image-models') },
    });
    expect(
      readFileSync(
        join(dir, 'runtime', 'image-models', PICTURE_MODEL, MODEL_FILES[0]?.[0] ?? ''),
        'utf8',
      ),
    ).toBe('x');
  });

  it('refuses a model file with the wrong checksum and leaves nothing half done', async () => {
    const f = fakes({
      download: vi.fn(async (url: string, dest: string) => {
        writeFileSync(dest, 'x');
        return url.includes('astral-sh/uv') ? UV_SHA256 : 'f'.repeat(64);
      }),
    });
    const m = manager(f.deps);
    m.beginInstall();
    await settled(m);
    expect(await m.status()).toEqual({ state: 'failed', error: 'checksum' });
    expect(m.worker()).toBeNull();
  });

  it('refuses uv with the wrong checksum before running anything', async () => {
    const f = fakes({ download: vi.fn(async () => 'f'.repeat(64)) });
    const m = manager(f.deps);
    m.beginInstall();
    await settled(m);
    expect(await m.status()).toEqual({ state: 'failed', error: 'checksum' });
    expect(f.deps.extract).not.toHaveBeenCalled();
    expect(f.runs).toHaveLength(0);
  });

  it('reports a failed engine build', async () => {
    const f = fakes({ run: vi.fn(async () => Promise.reject(new Error('exit 1'))) });
    const m = manager(f.deps);
    m.beginInstall();
    await settled(m);
    expect(await m.status()).toEqual({ state: 'failed', error: 'engine' });
  });

  it('is ready after a restart, and rebuilds the engine when an update changed the lock file', async () => {
    const f = fakes();
    const first = manager(f.deps);
    first.beginInstall();
    await settled(first);

    const again = manager(f.deps);
    await again.start();
    expect(await again.status()).toEqual({ state: 'ready' });
    expect(f.runs).toHaveLength(1);

    writeFileSync(join(project, 'uv.lock'), 'lock v2');
    const updated = manager(f.deps);
    await updated.start();
    await settled(updated);
    expect(await updated.status()).toEqual({ state: 'ready' });
    expect(f.runs).toHaveLength(2);
    // The model isn't downloaded again.
    expect(
      vi.mocked(f.deps.download).mock.calls.filter(([url]) => url.includes('huggingface.co')),
    ).toHaveLength(MODEL_FILES.length);
  });
});
