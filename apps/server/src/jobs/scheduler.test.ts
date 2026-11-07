import { describe, expect, it } from 'vitest';
import { type MemoryManager, MemoryUnavailableError } from './memory.ts';
import { BusyError, createScheduler, type JobContext, type JobSpec } from './scheduler.ts';

const NEED = { engine: 'ollama', model: 'quick', memoryGiB: 8 };

function fakeMemory() {
  const calls: string[] = [];
  const memory: MemoryManager = {
    prepare: (need) => {
      calls.push(`prepare:${need.model}`);
      return Promise.resolve([]);
    },
    release: (need) => {
      calls.push(`release:${need.model}`);
      return Promise.resolve();
    },
    releaseOwned: () => Promise.resolve([]),
  };
  return { memory, calls };
}

/** A job that runs until release() is called or its signal aborts. */
function controllable(userId: string, extra: Partial<JobSpec> = {}) {
  let release: () => void = () => undefined;
  let started = false;
  const positions: number[] = [];
  const spec: JobSpec = {
    userId,
    kind: 'chat',
    need: NEED,
    timeoutMs: 60_000,
    onQueued: (p) => positions.push(p),
    run: (ctx: JobContext) =>
      new Promise<void>((resolve, reject) => {
        started = true;
        release = resolve;
        ctx.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      }),
    ...extra,
  };
  return {
    spec,
    positions,
    finish: () => {
      release();
    },
    started: () => started,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('scheduler', () => {
  it('runs one job at a time in order and reports queue positions', async () => {
    const { memory } = fakeMemory();
    const s = createScheduler({ memory });
    const a = controllable('anna');
    const b = controllable('ben');
    const c = controllable('cara');
    const ha = s.submit(a.spec);
    const hb = s.submit(b.spec);
    const hc = s.submit(c.spec);
    await tick();
    expect(a.started()).toBe(true);
    expect(b.started()).toBe(false);
    expect(b.positions).toEqual([1]);
    expect(c.positions).toEqual([2]);

    a.finish();
    await expect(ha.finished).resolves.toBe('done');
    await tick();
    expect(b.started()).toBe(true);
    expect(c.positions).toEqual([2, 1]);
    b.finish();
    await hb.finished;
    await tick();
    c.finish();
    await expect(hc.finished).resolves.toBe('done');
  });

  it('allows one job per user', async () => {
    const s = createScheduler({ memory: fakeMemory().memory });
    const a = controllable('anna');
    s.submit(a.spec);
    expect(() => s.submit(controllable('anna').spec)).toThrow(BusyError);
    expect(() => s.submit(controllable('ben').spec)).not.toThrow();
    await tick();
    a.finish();
  });

  it('lets only the owner cancel', async () => {
    const s = createScheduler({ memory: fakeMemory().memory });
    const a = controllable('anna');
    const h = s.submit(a.spec);
    await tick();
    expect(s.cancel(h.id, 'ben')).toBe(false);
    expect(s.cancel('no-such-job', 'anna')).toBe(false);
    expect(s.cancel(h.id, 'anna')).toBe(true);
    await expect(h.finished).resolves.toBe('cancelled');
  });

  it('drops a cancelled queued job and moves the others up', async () => {
    const s = createScheduler({ memory: fakeMemory().memory });
    const a = controllable('anna');
    const b = controllable('ben');
    const c = controllable('cara');
    s.submit(a.spec);
    const hb = s.submit(b.spec);
    s.submit(c.spec);
    await tick();
    expect(s.cancel(hb.id, 'ben')).toBe(true);
    await expect(hb.finished).resolves.toBe('cancelled');
    expect(b.started()).toBe(false);
    expect(c.positions.at(-1)).toBe(1);
    a.finish();
    await tick();
    await tick();
    expect(c.started()).toBe(true);
    c.finish();
  });

  it('times out a job that runs too long', async () => {
    const s = createScheduler({ memory: fakeMemory().memory });
    const a = controllable('anna', { timeoutMs: 20 });
    const h = s.submit(a.spec);
    await expect(h.finished).resolves.toBe('timeout');
  });

  it('reports failures without stopping the lane', async () => {
    const errors: string[] = [];
    const s = createScheduler({
      memory: fakeMemory().memory,
      onError: (_err, job) => errors.push(job.kind),
    });
    const h = s.submit({
      userId: 'anna',
      kind: 'chat',
      need: NEED,
      timeoutMs: 1000,
      run: () => Promise.reject(new Error('model crashed')),
    });
    await expect(h.finished).resolves.toBe('failed');
    expect(errors).toEqual(['chat']);
    const b = controllable('ben');
    const hb = s.submit(b.spec);
    await tick();
    b.finish();
    await expect(hb.finished).resolves.toBe('done');
  });

  it('prepares memory before and releases after when asked', async () => {
    const { memory, calls } = fakeMemory();
    const s = createScheduler({ memory });
    const h = s.submit({
      userId: 'anna',
      kind: 'chat',
      need: { engine: 'ollama', model: 'smart', memoryGiB: 21 },
      releaseAfter: true,
      timeoutMs: 1000,
      run: () => Promise.resolve(),
    });
    await h.finished;
    expect(calls).toEqual(['prepare:smart', 'release:smart']);
  });

  it('frees the user slot after a job ends', async () => {
    const s = createScheduler({ memory: fakeMemory().memory });
    const a = controllable('anna');
    const h = s.submit(a.spec);
    await tick();
    expect(s.activeJobOf('anna')).toBe(h.id);
    a.finish();
    await h.finished;
    expect(s.activeJobOf('anna')).toBeNull();
    const again = controllable('anna');
    s.submit(again.spec);
    await tick();
    again.finish();
  });

  it('shutdown cancels everything and refuses new jobs', async () => {
    const s = createScheduler({ memory: fakeMemory().memory });
    const a = controllable('anna');
    const b = controllable('ben');
    const ha = s.submit(a.spec);
    const hb = s.submit(b.spec);
    await tick();
    await s.shutdown();
    await expect(ha.finished).resolves.toBe('cancelled');
    await expect(hb.finished).resolves.toBe('cancelled');
    expect(() => s.submit(controllable('cara').spec)).toThrow(BusyError);
  });
});

describe('memory unavailable', () => {
  it('tells the job why, runs nothing, and does not log an error', async () => {
    const errors: unknown[] = [];
    const memory: MemoryManager = {
      prepare: () => Promise.reject(new MemoryUnavailableError('machine_busy')),
      release: () => Promise.resolve(),
      releaseOwned: () => Promise.resolve([]),
    };
    const s = createScheduler({ memory, onError: (err) => errors.push(err) });
    const codes: string[] = [];
    let ran = false;
    const handle = s.submit({
      userId: 'u1',
      kind: 'chat',
      need: NEED,
      timeoutMs: 1000,
      onUnavailable: (code) => codes.push(code),
      run: () => {
        ran = true;
        return Promise.resolve();
      },
    });
    expect(await handle.finished).toBe('failed');
    expect(codes).toEqual(['machine_busy']);
    expect(ran).toBe(false);
    expect(errors).toEqual([]);
    expect(s.idle()).toBe(true);
  });
});

describe('scheduler cloud lane', () => {
  const CLOUD = { engine: 'anthropic', model: 'claude-sonnet-5-5', memoryGiB: 0 };
  const IMAGE = { engine: 'imagegen', model: 'flux', memoryGiB: 10 };

  it('runs cloud jobs at once beside the GPU lane, without memory planning or pause', async () => {
    const { memory, calls } = fakeMemory();
    memory.prepare = (need) => {
      calls.push(`prepare:${need.model}`);
      return Promise.reject(new MemoryUnavailableError('paused'));
    };
    const s = createScheduler({ memory });
    const gpu = controllable('anna');
    const a = controllable('ben', { lane: 'cloud', need: CLOUD });
    const b = controllable('cara', { lane: 'cloud', need: CLOUD });
    const unavailable: string[] = [];
    const hg = s.submit({ ...gpu.spec, onUnavailable: (c) => unavailable.push(c) });
    const ha = s.submit(a.spec);
    const hb = s.submit(b.spec);
    await tick();
    expect(a.started()).toBe(true);
    expect(b.started()).toBe(true);
    expect(a.positions).toEqual([]);
    expect(calls).toEqual(['prepare:quick']);
    expect(unavailable).toEqual(['paused']);
    await expect(hg.finished).resolves.toBe('failed');
    // Cloud jobs don't keep the Mac busy.
    expect(s.idle()).toBe(true);
    expect(s.activeJobOf('ben')).toBe(ha.id);
    a.finish();
    b.finish();
    await expect(ha.finished).resolves.toBe('done');
    await expect(hb.finished).resolves.toBe('done');
  });

  it('keeps one job per user across both lanes', async () => {
    const { memory } = fakeMemory();
    const s = createScheduler({ memory });
    const a = controllable('anna', { lane: 'cloud', need: CLOUD });
    s.submit(a.spec);
    expect(() => s.submit(controllable('anna').spec)).toThrow(BusyError);
    expect(() => s.submit(controllable('anna', { lane: 'cloud', need: CLOUD }).spec)).toThrow(
      BusyError,
    );
    const gpu = controllable('ben');
    s.submit(gpu.spec);
    expect(() => s.submit(controllable('ben', { lane: 'cloud', need: CLOUD }).spec)).toThrow(
      BusyError,
    );
    a.finish();
    gpu.finish();
  });

  it('lets only the owner cancel a cloud job', async () => {
    const { memory } = fakeMemory();
    const s = createScheduler({ memory });
    const a = controllable('anna', { lane: 'cloud', need: CLOUD, chatId: 'c1' });
    const h = s.submit(a.spec);
    expect(s.activeJobIn('anna', 'c1')).toBe(h.id);
    expect(s.cancel(h.id, 'ben')).toBe(false);
    expect(s.cancel(h.id, 'anna')).toBe(true);
    await expect(h.finished).resolves.toBe('cancelled');
    expect(s.activeJobOf('anna')).toBeNull();
  });

  it('queues a cloud job for the GPU when it needs the Mac, and holds it until the end', async () => {
    const { memory, calls } = fakeMemory();
    const s = createScheduler({ memory });
    const gpu = controllable('ben');
    s.submit(gpu.spec);
    await tick();

    let gotGpu = false;
    let done: () => void = () => undefined;
    const positions: number[] = [];
    const h = s.submit({
      userId: 'anna',
      kind: 'chat',
      lane: 'cloud',
      need: CLOUD,
      timeoutMs: 60_000,
      onQueued: (p) => positions.push(p),
      run: async ({ use }) => {
        await use(IMAGE);
        gotGpu = true;
        await new Promise<void>((r) => {
          done = r;
        });
      },
    });
    await tick();
    expect(gotGpu).toBe(false);
    expect(positions).toEqual([1]);
    // The GPU turn is internal: the user's job is still the cloud job.
    expect(s.activeJobOf('anna')).toBe(h.id);

    gpu.finish();
    await tick();
    await tick();
    expect(gotGpu).toBe(true);
    expect(calls).toEqual(['prepare:quick', 'prepare:flux']);
    expect(s.idle()).toBe(false);

    // Others wait until the cloud job ends.
    const next = controllable('cara');
    s.submit(next.spec);
    await tick();
    expect(next.started()).toBe(false);
    done();
    await expect(h.finished).resolves.toBe('done');
    await tick();
    expect(next.started()).toBe(true);
    next.finish();
  });

  it('drops a waiting GPU turn when the cloud job is cancelled', async () => {
    const { memory } = fakeMemory();
    const s = createScheduler({ memory });
    const gpu = controllable('ben');
    s.submit(gpu.spec);
    await tick();
    let useError: unknown = null;
    const h = s.submit({
      userId: 'anna',
      kind: 'chat',
      lane: 'cloud',
      need: CLOUD,
      timeoutMs: 60_000,
      run: async ({ use }) => {
        try {
          await use(IMAGE);
        } catch (err) {
          useError = err;
          throw err;
        }
      },
    });
    await tick();
    expect(s.queueLength()).toBe(1);
    expect(s.cancel(h.id, 'anna')).toBe(true);
    await expect(h.finished).resolves.toBe('cancelled');
    expect(useError).toBeInstanceOf(Error);
    expect(s.queueLength()).toBe(0);
    gpu.finish();
  });

  it('fails the GPU step with the memory reason when the Mac is paused', async () => {
    const { memory } = fakeMemory();
    memory.prepare = (need) =>
      need.engine === 'imagegen'
        ? Promise.reject(new MemoryUnavailableError('paused'))
        : Promise.resolve([]);
    const s = createScheduler({ memory });
    let useError: unknown = null;
    const h = s.submit({
      userId: 'anna',
      kind: 'chat',
      lane: 'cloud',
      need: CLOUD,
      timeoutMs: 60_000,
      run: async ({ use }) => {
        await use(IMAGE).catch((err: unknown) => {
          useError = err;
        });
      },
    });
    await expect(h.finished).resolves.toBe('done');
    expect(useError).toBeInstanceOf(MemoryUnavailableError);
  });

  it('shuts down cloud jobs too', async () => {
    const { memory } = fakeMemory();
    const s = createScheduler({ memory });
    const a = controllable('anna', { lane: 'cloud', need: CLOUD });
    const h = s.submit(a.spec);
    await s.shutdown();
    await expect(h.finished).resolves.toBe('cancelled');
  });
});
