import { describe, expect, it } from 'vitest';
import { type CapabilityProbes, createCapabilities, detectCapabilities } from './capabilities.ts';

const GIB = 1024 ** 3;

function probes(over: Partial<CapabilityProbes> = {}): CapabilityProbes {
  return {
    platform: 'darwin',
    arch: 'arm64',
    totalMemBytes: () => 32 * GIB,
    diskFreeBytes: () => Promise.resolve(123.456 * GIB),
    ollamaVersion: () => Promise.resolve('0.40.5'),
    searxngHealthy: () => Promise.resolve(true),
    hasUv: () => Promise.resolve(true),
    hasImageProject: () => Promise.resolve(true),
    ...over,
  };
}

describe('detectCapabilities', () => {
  it('reports everything on a fully set up Apple silicon Mac', async () => {
    expect(await detectCapabilities(probes())).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      memoryGiB: 32,
      diskFreeGiB: 123.5,
      ollama: { reachable: true, version: '0.40.5' },
      images: true,
      webSearch: true,
    });
  });

  it('has no pictures off Apple silicon or without uv or the worker', async () => {
    expect((await detectCapabilities(probes({ platform: 'linux', arch: 'x64' }))).images).toBe(
      false,
    );
    expect((await detectCapabilities(probes({ arch: 'x64' }))).images).toBe(false);
    expect((await detectCapabilities(probes({ hasUv: () => Promise.resolve(false) }))).images).toBe(
      false,
    );
    expect(
      (await detectCapabilities(probes({ hasImageProject: () => Promise.resolve(false) }))).images,
    ).toBe(false);
  });

  it('treats failing probes as unavailable', async () => {
    const c = await detectCapabilities(
      probes({
        diskFreeBytes: () => Promise.reject(new Error('x')),
        ollamaVersion: () => Promise.resolve(null),
        searxngHealthy: () => Promise.reject(new Error('x')),
        hasUv: () => Promise.reject(new Error('x')),
      }),
    );
    expect(c.diskFreeGiB).toBeNull();
    expect(c.ollama).toEqual({ reachable: false, version: null });
    expect(c.webSearch).toBe(false);
    expect(c.images).toBe(false);
  });
});

describe('createCapabilities', () => {
  it('is optimistic until refreshed, then reports the detection', async () => {
    let searx = false;
    const caps = createCapabilities(
      probes({ platform: 'linux', arch: 'x64', searxngHealthy: () => Promise.resolve(searx) }),
    );
    expect(caps.current().webSearch).toBe(true);
    expect(caps.current().images).toBe(false);
    await caps.refresh();
    expect(caps.current().webSearch).toBe(false);
    searx = true;
    await caps.refresh();
    expect(caps.current().webSearch).toBe(true);
  });
});
