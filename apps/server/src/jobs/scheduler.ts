/**
 * The job scheduler: every model call goes through here. One GPU lane (jobs run one at a
 * time, first come first served), at most one queued or running job per user, memory
 * made free for each job's model before it starts, timeouts, and cancellation that only
 * the job's owner can trigger. Owned by Claude (per-user isolation; see CLAUDE.md).
 *
 * Cloud jobs (a chat with a cloud model) don't need the Mac: they run at once in the cloud
 * lane, side by side, without memory planning (also while kchat is paused). The one-job-per-
 * user rule covers both lanes. When a cloud job needs the Mac after all (a picture from a
 * cloud chat), `use()` queues it in the GPU lane like any job and holds the GPU until the
 * cloud job ends.
 */
import { randomUUID } from 'node:crypto';
import { type MemoryManager, MemoryUnavailableError, type Need } from './memory.ts';

export interface JobContext {
  /** Aborted on cancel, timeout or shutdown. Engines must pass it to their calls. */
  signal: AbortSignal;
  /** Switches the GPU to another model mid-job (e.g. chat model → image model). */
  use: (need: Need) => Promise<void>;
}

export interface JobSpec {
  userId: string;
  kind: 'chat' | 'image';
  /** 'cloud': runs at once without the GPU (cloud models). Default 'gpu'. */
  lane?: 'gpu' | 'cloud';
  /** The chat the job writes to (lets the app find a reply still running after a reload). */
  chatId?: string;
  /** The model the job needs in memory. */
  need: Need;
  /** Unload the model as soon as the job finishes (MLX models leak memory in Ollama). */
  releaseAfter?: boolean;
  timeoutMs: number;
  /** Called with the new position (1 = next) whenever it changes while waiting. */
  onQueued?: (position: number) => void;
  /** Called once when the job starts, after memory is prepared. */
  onStart?: (info: { unloaded: string[] }) => void;
  run: (ctx: JobContext) => Promise<void>;
  /** The model couldn't be loaded (paused, or the Mac is busy with other models). */
  onUnavailable?: (code: MemoryUnavailableError['code']) => void;
}

export type JobOutcome = 'done' | 'cancelled' | 'timeout' | 'failed';

export interface JobHandle {
  id: string;
  /** Settles when the job has finished or was dropped from the queue; never rejects. */
  finished: Promise<JobOutcome>;
}

export class BusyError extends Error {
  override name = 'BusyError';
  constructor() {
    super('busy');
  }
}

interface Job {
  id: string;
  spec: JobSpec;
  controller: AbortController;
  cancelled: boolean;
  resolve: (outcome: JobOutcome) => void;
  /** When the job started running (ms), for the system status. */
  startedAt?: number;
  /** A cloud job's turn on the GPU (see gpuTurn): the cloud job it belongs to. */
  parent?: Job;
  /** Called when the job ends (a cloud job releases its GPU turn). */
  onEnd?: () => void;
}

export interface SchedulerOptions {
  memory: MemoryManager;
  /** Errors from jobs, for logging (ids only, never content). */
  onError?: (err: unknown, job: { id: string; kind: string }) => void;
}

export function createScheduler(options: SchedulerOptions) {
  const queue: Job[] = [];
  let running: Job | null = null;
  /** Cloud jobs running now (no GPU, no queue). */
  const cloud = new Set<Job>();
  let stopped = false;
  /** The job a user sees: a GPU turn stands for its cloud job. */
  const owner = (job: Job): Job => job.parent ?? job;

  /**
   * Waits for the GPU lane on behalf of a cloud job, makes room for `need` and holds the GPU
   * until the cloud job ends. Rejects with MemoryUnavailableError (paused, Mac busy), or an
   * abort error when the cloud job is cancelled while waiting.
   */
  function gpuTurn(parent: Job, need: Need): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const signal = parent.controller.signal;
      if (signal.aborted) {
        reject(new Error('aborted'));
        return;
      }
      let release: () => void = () => undefined;
      const released = new Promise<void>((r) => {
        release = r;
      });
      const turn: Job = {
        id: randomUUID(),
        parent,
        spec: {
          userId: parent.spec.userId,
          kind: 'image',
          need,
          timeoutMs: parent.spec.timeoutMs,
          ...(parent.spec.onQueued ? { onQueued: parent.spec.onQueued } : {}),
          onUnavailable: (code) => {
            reject(new MemoryUnavailableError(code));
          },
          run: async () => {
            resolve();
            await released;
          },
        },
        controller: new AbortController(),
        cancelled: false,
        // A turn that ends before handing over the GPU (failure, shutdown) fails the use().
        resolve: (outcome) => {
          if (outcome !== 'done') reject(new Error(outcome));
        },
      };
      const end = (): void => {
        release();
        const i = queue.indexOf(turn);
        if (i >= 0) {
          queue.splice(i, 1);
          notifyPositions();
          reject(new Error('aborted'));
        }
      };
      signal.addEventListener('abort', end, { once: true });
      const before = parent.onEnd;
      parent.onEnd = () => {
        before?.();
        end();
      };
      queue.push(turn);
      if (running) turn.spec.onQueued?.(queue.length);
      void pump();
    });
  }

  function notifyPositions(): void {
    queue.forEach((job, i) => job.spec.onQueued?.(i + 1));
  }

  async function runJob(job: Job): Promise<JobOutcome> {
    const { spec, controller } = job;
    let timedOut = false;
    // Set asynchronously (timer, cancel()); read through functions so the checks after
    // each await aren't narrowed away.
    const isTimedOut = (): boolean => timedOut;
    const isCancelled = (): boolean => job.cancelled;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, spec.timeoutMs);
    const isCloud = spec.lane === 'cloud';
    try {
      let unloaded: Awaited<ReturnType<MemoryManager['prepare']>> = [];
      try {
        // Cloud jobs need no memory on the Mac.
        if (!isCloud) unloaded = await options.memory.prepare(spec.need);
      } catch (err) {
        // Expected while paused or while other work uses the Mac: tell the job, don't log.
        if (!(err instanceof MemoryUnavailableError)) throw err;
        spec.onUnavailable?.(err.code);
        return 'failed';
      }
      if (controller.signal.aborted) return isCancelled() ? 'cancelled' : 'timeout';
      spec.onStart?.({ unloaded: unloaded.map((r) => r.model) });
      await spec.run({
        signal: controller.signal,
        use: async (need) => {
          if (isCloud) await gpuTurn(job, need);
          else await options.memory.prepare(need);
        },
      });
      if (isCancelled()) return 'cancelled';
      return isTimedOut() ? 'timeout' : 'done';
    } catch (err) {
      if (isCancelled()) return 'cancelled';
      if (isTimedOut()) return 'timeout';
      options.onError?.(err, { id: job.id, kind: spec.kind });
      return 'failed';
    } finally {
      clearTimeout(timer);
      job.onEnd?.();
      if (spec.releaseAfter) {
        await options.memory.release(spec.need).catch((err: unknown) => {
          options.onError?.(err, { id: job.id, kind: spec.kind });
        });
      }
    }
  }

  async function pump(): Promise<void> {
    if (running || stopped) return;
    const next = queue.shift();
    if (!next) return;
    running = next;
    next.startedAt = Date.now();
    notifyPositions();
    const outcome = await runJob(next);
    running = null;
    next.resolve(outcome);
    void pump();
  }

  async function runCloud(job: Job): Promise<void> {
    job.startedAt = Date.now();
    const outcome = await runJob(job);
    cloud.delete(job);
    job.resolve(outcome);
  }

  /** A job the user can see (GPU turns of cloud jobs are internal). */
  function findJob(jobId: string): Job | undefined {
    if (running?.id === jobId && !running.parent) return running;
    for (const j of cloud) if (j.id === jobId) return j;
    return queue.find((j) => j.id === jobId && !j.parent);
  }

  /** All jobs of all lanes, as their users see them. */
  function* jobs(): Generator<Job> {
    if (running) yield owner(running);
    yield* cloud;
    for (const j of queue) yield owner(j);
  }

  return {
    /**
     * Queues a job. Throws BusyError if this user already has a queued or running job,
     * or if the scheduler is shutting down.
     */
    submit(spec: JobSpec): JobHandle {
      if (stopped) throw new BusyError();
      for (const j of jobs()) if (j.spec.userId === spec.userId) throw new BusyError();
      let resolve: (outcome: JobOutcome) => void = () => undefined;
      const finished = new Promise<JobOutcome>((r) => {
        resolve = r;
      });
      const job: Job = {
        id: randomUUID(),
        spec,
        controller: new AbortController(),
        cancelled: false,
        resolve,
      };
      if (spec.lane === 'cloud') {
        cloud.add(job);
        void runCloud(job);
        return { id: job.id, finished };
      }
      queue.push(job);
      if (running) spec.onQueued?.(queue.length);
      void pump();
      return { id: job.id, finished };
    },

    /**
     * Cancels a job if it belongs to `userId`. A queued job is dropped, a running job is
     * aborted. Returns false for unknown jobs and other users' jobs alike.
     */
    cancel(jobId: string, userId: string): boolean {
      const job = findJob(jobId);
      if (!job || job.spec.userId !== userId) return false;
      job.cancelled = true;
      if (job === running || cloud.has(job)) {
        job.controller.abort(new Error('cancelled'));
      } else {
        queue.splice(queue.indexOf(job), 1);
        job.resolve('cancelled');
        notifyPositions();
      }
      return true;
    },

    /** What runs on the GPU and how many wait (no user ids: for the admin system status). */
    snapshot(): {
      running: { kind: JobSpec['kind']; model: string; startedAt: number } | null;
      queued: number;
    } {
      return {
        running: running
          ? {
              kind: running.spec.kind,
              model: running.spec.need.model,
              startedAt: running.startedAt ?? Date.now(),
            }
          : null,
        queued: queue.length,
      };
    },

    /** True when no job runs or waits for the GPU (cloud jobs don't use the Mac). */
    idle(): boolean {
      return running === null && queue.length === 0;
    },

    /** The user's current job id, if any (for "a reply is still running"). */
    activeJobOf(userId: string): string | null {
      for (const j of jobs()) if (j.spec.userId === userId) return j.id;
      return null;
    },

    /** The user's queued or running job in this chat, if any. */
    activeJobIn(userId: string, chatId: string): string | null {
      for (const j of jobs()) if (j.spec.userId === userId && j.spec.chatId === chatId) return j.id;
      return null;
    },

    /** Number of jobs waiting (not counting the running one). */
    queueLength(): number {
      return queue.length;
    },

    /** Stops accepting jobs, drops the queue and aborts the running job. */
    async shutdown(): Promise<void> {
      stopped = true;
      for (const job of queue.splice(0)) {
        job.cancelled = true;
        job.resolve('cancelled');
      }
      const current = running;
      if (current) {
        current.cancelled = true;
        current.controller.abort(new Error('shutdown'));
      }
      for (const job of cloud) {
        job.cancelled = true;
        job.controller.abort(new Error('shutdown'));
      }
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (!running && cloud.size === 0) resolve();
          else setTimeout(check, 10);
        };
        check();
      });
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
