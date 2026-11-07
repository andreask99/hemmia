import { describe, expect, it } from 'vitest';
import {
  createMemoryManager,
  type EngineControl,
  MemoryUnavailableError,
  planUnloads,
  type Resident,
} from './memory.ts';

const r = (engine: string, model: string, memoryGiB: number, lastUsedAt: number): Resident => ({
  engine,
  model,
  memoryGiB,
  lastUsedAt,
});

describe('planUnloads', () => {
  it('keeps everything that fits', () => {
    const plan = planUnloads(
      [r('ollama', 'quick', 8, 1)],
      { engine: 'imagegen', model: 'zit', memoryGiB: 10 },
      22,
    );
    expect(plan).toEqual([]);
  });

  it('unloads least recently used first until the need fits', () => {
    const residents = [r('ollama', 'a', 8, 5), r('ollama', 'b', 8, 1), r('imagegen', 'img', 10, 3)];
    const plan = planUnloads(residents, { engine: 'ollama', model: 'smart', memoryGiB: 21 }, 22);
    expect(plan.map((x) => x.model)).toEqual(['b', 'img', 'a']);
  });

  it('never unloads the needed model itself', () => {
    const plan = planUnloads(
      [r('ollama', 'smart', 21, 1), r('ollama', 'quick', 8, 2)],
      { engine: 'ollama', model: 'smart', memoryGiB: 21 },
      22,
    );
    expect(plan.map((x) => x.model)).toEqual(['quick']);
  });
});

describe('memory manager', () => {
  function fakeEngine(name: string, models: { model: string; memoryGiB: number }[]) {
    const unloaded: string[] = [];
    const engine: EngineControl = {
      name,
      loaded: () => Promise.resolve(models.filter((m) => !unloaded.includes(m.model))),
      unload: (model) => {
        unloaded.push(model);
        return Promise.resolve();
      },
    };
    return { engine, unloaded };
  }

  it('asks every engine and unloads across engines', async () => {
    const ollama = fakeEngine('ollama', [{ model: 'smart', memoryGiB: 21 }]);
    const img = fakeEngine('imagegen', []);
    const mm = createMemoryManager({ engines: [ollama.engine, img.engine], budgetGiB: 22 });
    const unloaded = await mm.prepare({ engine: 'imagegen', model: 'zit', memoryGiB: 10 });
    expect(unloaded.map((x) => x.model)).toEqual(['smart']);
    expect(ollama.unloaded).toEqual(['smart']);
  });

  it('release unloads the model', async () => {
    const ollama = fakeEngine('ollama', [{ model: 'smart', memoryGiB: 21 }]);
    const mm = createMemoryManager({ engines: [ollama.engine], budgetGiB: 22 });
    await mm.release({ engine: 'ollama', model: 'smart', memoryGiB: 21 });
    expect(ollama.unloaded).toEqual(['smart']);
  });
});

describe('models kchat does not own', () => {
  const ownsKchat = (x: Resident) => x.model !== 'coder-dev';

  it('are never unloaded, and count against the budget', () => {
    const residents = [r('ollama', 'coder-dev', 4, 0), r('ollama', 'quick', 8, 5)];
    const plan = planUnloads(
      residents,
      { engine: 'ollama', model: 'smart', memoryGiB: 12 },
      22,
      ownsKchat,
    );
    expect(plan.map((x) => x.model)).toEqual(['quick']);
  });

  it('make the job wait for a better moment when they leave too little room', () => {
    const residents = [r('ollama', 'coder-dev', 18, 0), r('ollama', 'quick', 8, 5)];
    expect(() =>
      planUnloads(residents, { engine: 'ollama', model: 'smart', memoryGiB: 19 }, 22, ownsKchat),
    ).toThrow(MemoryUnavailableError);
  });

  it('still let a model larger than the budget run when only kchat models are loaded', () => {
    const plan = planUnloads(
      [r('ollama', 'quick', 19, 1)],
      { engine: 'imagegen', model: 'klein', memoryGiB: 25 },
      22,
      ownsKchat,
    );
    expect(plan.map((x) => x.model)).toEqual(['quick']);
  });
});

describe('memory manager ownership and pause', () => {
  function engineWith(models: { model: string; memoryGiB: number }[]) {
    const unloaded: string[] = [];
    const engine: EngineControl = {
      name: 'ollama',
      loaded: () => Promise.resolve(models.filter((m) => !unloaded.includes(m.model))),
      unload: (model) => {
        unloaded.push(model);
        return Promise.resolve();
      },
    };
    return { engine, unloaded };
  }

  it('refuses to load anything while paused, without unloading', async () => {
    const e = engineWith([{ model: 'quick', memoryGiB: 8 }]);
    const mm = createMemoryManager({ engines: [e.engine], budgetGiB: 22, paused: () => true });
    await expect(
      mm.prepare({ engine: 'ollama', model: 'smart', memoryGiB: 21 }),
    ).rejects.toMatchObject({
      code: 'paused',
    });
    expect(e.unloaded).toEqual([]);
  });

  it('throws machine_busy before unloading any of its own models', async () => {
    const e = engineWith([
      { model: 'coder-dev', memoryGiB: 18 },
      { model: 'quick', memoryGiB: 2 },
    ]);
    const mm = createMemoryManager({
      engines: [e.engine],
      budgetGiB: 22,
      owns: (_engine, model) => model !== 'coder-dev',
    });
    await expect(
      mm.prepare({ engine: 'ollama', model: 'smart', memoryGiB: 19 }),
    ).rejects.toMatchObject({
      code: 'machine_busy',
    });
    expect(e.unloaded).toEqual([]);
  });

  it('releaseOwned frees only its own models', async () => {
    const e = engineWith([
      { model: 'coder-dev', memoryGiB: 18 },
      { model: 'quick', memoryGiB: 2 },
    ]);
    const mm = createMemoryManager({
      engines: [e.engine],
      budgetGiB: 22,
      owns: (_engine, model) => model !== 'coder-dev',
    });
    expect((await mm.releaseOwned()).map((x) => x.model)).toEqual(['quick']);
    expect(e.unloaded).toEqual(['quick']);
  });
});
