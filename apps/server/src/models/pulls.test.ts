import { describe, expect, it } from 'vitest';
import type { PullEvent } from '@hemmia/shared';
import { LlmError, type PullProgress } from '../llm/types.ts';
import { createPullManager, PullRefusedError, type PullDeps } from './pulls.ts';

const ENTRY = {
  ollamaModel: 'gemma4:e2b',
  label: { en: 'gemma4 E2B', de: 'gemma4 E2B' },
  description: { en: '', de: '' },
  downloadGiB: 4.3,
  memoryGiB: 6,
  minTotalMemoryGiB: 8,
  vision: true,
  tools: true,
  think: true,
  contextTokens: 16384,
};

/** A pull that yields when `step()` is called, so tests control its pace. */
function controlledPull() {
  let release: (() => void) | null = null;
  let fail: LlmError | null = null;
  const steps: PullProgress[] = [
    { status: 'pulling', completed: 0, total: 100 },
    { status: 'pulling', completed: 50, total: 100 },
    { status: 'success', completed: 100, total: 100 },
  ];
  async function* pull(_model: string, signal: AbortSignal): AsyncGenerator<PullProgress> {
    for (const s of steps) {
      await new Promise<void>((r, j) => {
        release = r;
        signal.addEventListener('abort', () => {
          j(new LlmError('aborted'));
        });
      });
      if (fail) throw fail;
      yield s;
    }
  }
  return {
    pull,
    step: async () => {
      release?.();
      await new Promise((r) => setTimeout(r, 0));
    },
    failWith: (e: LlmError) => {
      fail = e;
    },
  };
}

function manager(over: Partial<PullDeps> = {}, pull = controlledPull()) {
  let t = 0;
  const offered: string[] = [];
  const m = createPullManager({
    llm: { pull: pull.pull },
    paused: () => false,
    diskFreeGiB: () => Promise.resolve(100),
    catalog: [ENTRY],
    offer: (model) => {
      offered.push(model);
      return 'x-gemma4-e2b';
    },
    now: () => (t += 1000),
    ...over,
  });
  return { m, pull, offered };
}

describe('pull manager', () => {
  it('streams progress, offers the model and ends with done', async () => {
    const { m, pull, offered } = manager();
    const { pullId } = await m.start('gemma4:e2b');
    const seen: PullEvent[] = [];
    m.watch(pullId, (e) => seen.push(e));
    await pull.step();
    await pull.step();
    await pull.step();
    await pull.step();
    expect(seen).toEqual([
      { type: 'progress', completed: 0, total: 0 },
      { type: 'progress', completed: 0, total: 100 },
      { type: 'progress', completed: 50, total: 100 },
      { type: 'progress', completed: 100, total: 100 },
      { type: 'done', modelId: 'x-gemma4-e2b' },
    ]);
    expect(offered).toEqual(['gemma4:e2b']);
    expect(m.active()).toBeNull();
    // A late watcher sees how it ended.
    const late: PullEvent[] = [];
    m.watch(pullId, (e) => late.push(e));
    expect(late).toEqual([{ type: 'done', modelId: 'x-gemma4-e2b' }]);
  });

  it('runs one at a time and refuses while paused or without disk space', async () => {
    const { m } = manager();
    await m.start('gemma4:e2b');
    await expect(m.start('gemma4:e4b')).rejects.toMatchObject({ code: 'busy' });
    await expect(manager({ paused: () => true }).m.start('gemma4:e2b')).rejects.toMatchObject({
      code: 'paused',
    });
    // 4.3 GiB download + 5 GiB reserve > 9 GiB free.
    const low = manager({ diskFreeGiB: () => Promise.resolve(9) }).m;
    await expect(low.start('gemma4:e2b')).rejects.toBeInstanceOf(PullRefusedError);
    await expect(low.start('gemma4:e2b')).rejects.toMatchObject({ code: 'disk_full' });
    // Unknown models only need the reserve.
    await expect(
      manager({ diskFreeGiB: () => Promise.resolve(6) }).m.start('other:1b'),
    ).resolves.toMatchObject({ pullId: expect.any(String) as string });
  });

  it('cancels', async () => {
    const { m, offered } = manager();
    const { pullId } = await m.start('gemma4:e2b');
    const seen: PullEvent[] = [];
    m.watch(pullId, (e) => seen.push(e));
    expect(m.cancel(pullId)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(seen.at(-1)).toEqual({ type: 'error', code: 'cancelled' });
    expect(offered).toEqual([]);
    expect(m.cancel(pullId)).toBe(false);
    expect(m.cancel('unknown')).toBe(false);
  });

  it('reports unknown models', async () => {
    const { m, pull } = manager();
    const { pullId } = await m.start('nope:1b');
    const seen: PullEvent[] = [];
    m.watch(pullId, (e) => seen.push(e));
    pull.failWith(new LlmError('model_not_found'));
    await pull.step();
    expect(seen.at(-1)).toEqual({ type: 'error', code: 'not_found' });
  });
});
