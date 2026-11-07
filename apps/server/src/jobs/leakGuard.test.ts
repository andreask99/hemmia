import { describe, expect, it } from 'vitest';
import { createLeakGuard } from './leakGuard.ts';

function setup() {
  const sizes = new Map<string, number>([['qwen3.8:27b-mlx', 17.7]]);
  const unloaded: string[] = [];
  let idle = true;
  const guard = createLeakGuard({
    loaded: () => Promise.resolve([...sizes].map(([model, memoryGiB]) => ({ model, memoryGiB }))),
    unload: (model) => {
      unloaded.push(model);
      sizes.delete(model);
      return Promise.resolve();
    },
    idle: () => idle,
    owns: (model) => model !== 'qwen3-coder-dev',
  });
  return { sizes, unloaded, guard, setIdle: (v: boolean) => (idle = v) };
}

describe('leak guard', () => {
  it('unloads a model that grew more than 3 GB over its clean size, once idle', async () => {
    const { sizes, unloaded, guard, setIdle } = setup();
    await guard.check();
    sizes.set('qwen3.8:27b-mlx', 20.5);
    expect(await guard.check()).toEqual([]);
    sizes.set('qwen3.8:27b-mlx', 21.9);
    setIdle(false);
    expect(await guard.check()).toEqual([]);
    setIdle(true);
    expect(await guard.check()).toEqual([
      { model: 'qwen3.8:27b-mlx', baseGiB: 17.7, nowGiB: 21.9 },
    ]);
    expect(unloaded).toEqual(['qwen3.8:27b-mlx']);
  });

  it('starts over after a reload, and leaves models it does not own alone', async () => {
    const { sizes, unloaded, guard } = setup();
    await guard.check();
    sizes.set('qwen3.8:27b-mlx', 22);
    await guard.check();
    // Reloaded: the new clean size counts.
    sizes.set('qwen3.8:27b-mlx', 18);
    await guard.check();
    sizes.set('qwen3.8:27b-mlx', 20);
    expect(await guard.check()).toEqual([]);
    sizes.set('qwen3-coder-dev', 20);
    await guard.check();
    sizes.set('qwen3-coder-dev', 30);
    expect(await guard.check()).toEqual([]);
    expect(unloaded).toEqual(['qwen3.8:27b-mlx']);
  });
});
