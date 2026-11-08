/**
 * ImageEngine backed by the Python mflux worker (services/imagegen, PROTOCOL.md).
 * The worker starts on demand, exits by itself when idle, and is restarted after crashes.
 * Prompts are content: never logged, never in errors. stderr is drained and discarded.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { ImageError, type ImageEngine, type ImageRequest } from './types.ts';

export interface WorkerEngineOptions {
  /** How to start the worker; a function is asked at every start (pictures set up later). */
  command:
    | readonly [string, ...string[]]
    | (() => { command: readonly [string, ...string[]]; env?: Record<string, string> });
  cwd?: string;
  env?: Record<string, string>;
  idleSeconds?: number;
  readyTimeoutMs?: number;
  cancelGraceMs?: number;
}

const Message = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), protocol: z.number() }),
  z.object({ type: z.literal('loading'), id: z.string() }),
  z.object({ type: z.literal('progress'), id: z.string(), step: z.number(), steps: z.number() }),
  z.object({ type: z.literal('done'), id: z.string(), path: z.string() }),
  z.object({ type: z.literal('error'), id: z.string().nullable(), code: z.string() }),
  z.object({ type: z.literal('unloaded') }),
]);
type Message = z.infer<typeof Message>;

interface Worker {
  proc: ChildProcessWithoutNullStreams;
  exited: Promise<void>;
  alive: boolean;
  listeners: Set<(m: Message) => void>;
  exitListeners: Set<() => void>;
}

export function createWorkerEngine(options: WorkerEngineOptions): ImageEngine {
  const readyTimeoutMs = options.readyTimeoutMs ?? 30_000;
  const cancelGraceMs = options.cancelGraceMs ?? 10_000;
  let outDir: string | null = null;
  let worker: Worker | null = null;
  let loadedModel: string | null = null;
  let busy = false;

  async function ensureOutDir(): Promise<string> {
    if (!outDir) {
      // Real path: on macOS the temp dir is behind a symlink (/var -> /private/var) and the
      // worker reports resolved paths, which must still pass the "inside outDir" check.
      const created = await mkdtemp(join(tmpdir(), 'kchat-img-'));
      await chmod(created, 0o700);
      outDir = await realpath(created);
    }
    return outDir;
  }

  function send(w: Worker, obj: unknown): void {
    if (!w.alive) return;
    try {
      w.proc.stdin.write(`${JSON.stringify(obj)}\n`);
    } catch {
      // EPIPE: the exit handler deals with it.
    }
  }

  async function start(): Promise<Worker> {
    if (worker?.alive) return worker;
    const dir = await ensureOutDir();
    const how =
      typeof options.command === 'function' ? options.command() : { command: options.command };
    const [cmd, ...args] = how.command;
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(cmd, args, {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
          ...how.env,
          HEMMIA_IMAGEGEN_OUTDIR: dir,
          HEMMIA_IMAGEGEN_IDLE_SECONDS: String(options.idleSeconds ?? 300),
          HF_HUB_OFFLINE: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      throw new ImageError('unavailable');
    }
    let markExited: () => void = () => undefined;
    const w: Worker = {
      proc,
      alive: true,
      exited: new Promise<void>((r) => {
        markExited = r;
      }),
      listeners: new Set(),
      exitListeners: new Set(),
    };
    const onExit = () => {
      if (!w.alive) return;
      w.alive = false;
      if (worker === w) loadedModel = null;
      for (const fn of w.exitListeners) fn();
      markExited();
    };
    proc.on('exit', onExit);
    proc.on('error', onExit);
    proc.stdin.on('error', () => undefined);
    proc.stderr.resume(); // drain; never logged
    createInterface({ input: proc.stdout }).on('line', (line) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      const parsed = Message.safeParse(value);
      if (!parsed.success) return;
      for (const fn of [...w.listeners]) fn(parsed.data);
    });

    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        proc.kill('SIGKILL');
        reject(new ImageError('unavailable'));
      }, readyTimeoutMs);
      const onMessage = (m: Message) => {
        if (m.type === 'ready') {
          cleanup();
          resolveReady();
        }
      };
      const onDead = () => {
        cleanup();
        reject(new ImageError('unavailable'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        w.listeners.delete(onMessage);
        w.exitListeners.delete(onDead);
      };
      w.listeners.add(onMessage);
      w.exitListeners.add(onDead);
    });
    worker = w;
    return w;
  }

  async function stop(w: Worker, op: 'unload' | 'shutdown', waitMs: number): Promise<void> {
    if (!w.alive) return;
    send(w, { op });
    const timer = setTimeout(() => {
      w.proc.kill('SIGKILL');
    }, waitMs);
    await w.exited;
    clearTimeout(timer);
  }

  return {
    async generate(req: ImageRequest): Promise<Buffer> {
      if (busy) throw new ImageError('generation_failed');
      if (req.signal.aborted) throw new ImageError('aborted');
      busy = true;
      try {
        const w = await start();
        const dir = await ensureOutDir();
        const id = randomUUID();
        // A photo to edit goes into the private dir only for this job.
        const sourcePath = req.sourceImage ? join(dir, `${id}-src.png`) : null;
        if (sourcePath && req.sourceImage)
          await writeFile(sourcePath, req.sourceImage, { mode: 0o600 });
        try {
          return await new Promise<Buffer>((resolveJob, reject) => {
            let settled = false;
            let killTimer: NodeJS.Timeout | undefined;
            const finish = (fn: () => void) => {
              if (settled) return;
              settled = true;
              clearTimeout(killTimer);
              w.listeners.delete(onMessage);
              w.exitListeners.delete(onDead);
              req.signal.removeEventListener('abort', onAbort);
              fn();
            };
            const onMessage = (m: Message) => {
              if (!('id' in m) || m.id !== id) return;
              if (m.type === 'loading') req.onLoading?.();
              else if (m.type === 'progress') req.onProgress?.(m.step, m.steps);
              else if (m.type === 'done') {
                const path = resolve(m.path);
                if (!path.startsWith(dir + sep)) {
                  finish(() => {
                    reject(new ImageError('generation_failed'));
                  });
                  return;
                }
                loadedModel = req.model;
                readFile(path)
                  .then(async (bytes) => {
                    await rm(path, { force: true });
                    finish(() => {
                      resolveJob(bytes);
                    });
                  })
                  .catch(() => {
                    finish(() => {
                      reject(new ImageError('generation_failed'));
                    });
                  });
              } else {
                const code =
                  m.code === 'model_load_failed'
                    ? 'model_load_failed'
                    : m.code === 'cancelled'
                      ? 'aborted'
                      : 'generation_failed';
                finish(() => {
                  reject(new ImageError(code));
                });
              }
            };
            const onDead = () => {
              finish(() => {
                reject(new ImageError(req.signal.aborted ? 'aborted' : 'unavailable'));
              });
            };
            const onAbort = () => {
              send(w, { op: 'cancel', id });
              killTimer = setTimeout(() => {
                w.proc.kill('SIGKILL');
                finish(() => {
                  reject(new ImageError('aborted'));
                });
              }, cancelGraceMs);
            };
            w.listeners.add(onMessage);
            w.exitListeners.add(onDead);
            req.signal.addEventListener('abort', onAbort, { once: true });
            send(w, {
              op: 'generate',
              id,
              model: req.model,
              ...(req.quantize !== undefined ? { quantize: req.quantize } : {}),
              prompt: req.prompt,
              width: req.width,
              height: req.height,
              steps: req.steps,
              seed: req.seed,
              ...(sourcePath ? { image: sourcePath } : {}),
            });
          });
        } finally {
          if (sourcePath) await rm(sourcePath, { force: true });
        }
      } finally {
        busy = false;
      }
    },

    loaded() {
      return Promise.resolve(
        worker?.alive && loadedModel ? [{ model: loadedModel, memoryGiB: 0 }] : [],
      );
    },

    async unload() {
      if (worker?.alive) await stop(worker, 'unload', 5000);
    },

    async shutdown() {
      if (worker?.alive) await stop(worker, 'shutdown', 2000);
      if (outDir) await rm(outDir, { recursive: true, force: true });
      outDir = null;
    },
  };
}
