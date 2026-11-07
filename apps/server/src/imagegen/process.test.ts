import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkerEngine, type WorkerEngineOptions } from './process.ts';
import { ImageError, type ImageEngine, type ImageRequest } from './types.ts';

const FAKE = fileURLToPath(new URL('./fake-worker.ts', import.meta.url));
let engine: ImageEngine | null = null;

function make(extra: Partial<WorkerEngineOptions> = {}) {
  engine = createWorkerEngine({
    command: [process.execPath, FAKE],
    readyTimeoutMs: 5000,
    ...extra,
  });
  return engine;
}

afterEach(async () => {
  await engine?.shutdown();
  engine = null;
});

function req(extra: Partial<ImageRequest> = {}): ImageRequest {
  return {
    model: 'flux2-klein-4b',
    prompt: 'SECRET-PROMPT-123',
    width: 256,
    height: 256,
    steps: 3,
    seed: 1,
    signal: new AbortController().signal,
    ...extra,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    expect(String(err)).not.toContain('SECRET-PROMPT');
    return err instanceof ImageError ? err.code : 'other';
  }
  return 'none';
}

describe('worker engine', () => {
  it('generates, reports loading and progress, and cleans up the file', async () => {
    const e = make();
    let loading = 0;
    const steps: number[] = [];
    const png = await e.generate(
      req({
        onLoading: () => {
          loading++;
        },
        onProgress: (s) => {
          steps.push(s);
        },
      }),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(loading).toBe(1);
    expect(steps).toEqual([1, 2, 3]);
    expect(await e.loaded()).toEqual([{ model: 'flux2-klein-4b', memoryGiB: 0 }]);

    let loadingAgain = 0;
    await e.generate(
      req({
        onLoading: () => {
          loadingAgain++;
        },
      }),
    );
    expect(loadingAgain).toBe(0);
    await e.unload('flux2-klein-4b');
    expect(await e.loaded()).toEqual([]);
  });

  it('keeps result files in a private dir and deletes them', async () => {
    const before = new Set(readdirSync(tmpdir()).filter((d) => d.startsWith('kchat-img-')));
    await make().generate(req());
    const created = readdirSync(tmpdir()).filter(
      (d) => d.startsWith('kchat-img-') && !before.has(d),
    );
    expect(created).toHaveLength(1);
    const dir = join(tmpdir(), created[0] ?? '');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('maps load failures', async () => {
    const e = make({ env: { FAKE_LOAD_FAIL: '1' } });
    expect(await code(e.generate(req()))).toBe('model_load_failed');
  });

  it('cancels, and kills a worker that ignores cancel', async () => {
    const e = make();
    const ac = new AbortController();
    const p = e.generate(
      req({
        steps: 50,
        signal: ac.signal,
        onProgress: () => {
          ac.abort();
        },
      }),
    );
    expect(await code(p)).toBe('aborted');

    const stubborn = make({ env: { FAKE_IGNORE_CANCEL: '1' }, cancelGraceMs: 200 });
    const ac2 = new AbortController();
    const p2 = stubborn.generate(
      req({
        steps: 5,
        signal: ac2.signal,
        onProgress: () => {
          ac2.abort();
        },
      }),
    );
    expect(await code(p2)).toBe('aborted');
    expect(await stubborn.loaded()).toEqual([]);
  });

  it('rejects results outside the private dir', async () => {
    const e = make({ env: { FAKE_BAD_PATH: '1' } });
    expect(await code(e.generate(req()))).toBe('generation_failed');
  });

  it('reports crashes and recovers with a new process', async () => {
    const e = make({ env: { FAKE_CRASH: '1' } });
    expect(await code(e.generate(req()))).toBe('unavailable');
  });

  it('reports a missing worker program', async () => {
    const e = make({ command: ['/nonexistent/kchat-worker'] });
    expect(await code(e.generate(req()))).toBe('unavailable');
  });

  it('runs one job at a time', async () => {
    const e = make();
    const first = e.generate(req({ steps: 5 }));
    expect(await code(e.generate(req()))).toBe('generation_failed');
    await first;
  });
});

describe('source images', () => {
  it('passes a photo to edit inside the private dir and removes it afterwards', async () => {
    const before = new Set(readdirSync(tmpdir()).filter((d) => d.startsWith('kchat-img-')));
    const e = make();
    const png = await e.generate(req({ sourceImage: Buffer.from('fake photo bytes') }));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const created = readdirSync(tmpdir()).filter(
      (d) => d.startsWith('kchat-img-') && !before.has(d),
    );
    expect(readdirSync(join(tmpdir(), created[0] ?? ''))).toEqual([]);
  });
});
