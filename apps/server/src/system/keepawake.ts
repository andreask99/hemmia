/**
 * Keeps a Mac hub awake while it must be reachable (P6.3): on darwin, while remote access is on
 * or public hostnames are configured, `caffeinate -s -w <pid>` holds a "no sleep on power"
 * assertion that ends with this process. Restarted if it exits while still needed.
 */
import { type ChildProcess, spawn } from 'node:child_process';

export interface KeepAwake {
  /** Re-evaluates whether it is needed (call when remote access changes). */
  update(): void;
  active(): boolean;
  stop(): void;
}

export function createKeepAwake(o: {
  platform?: NodeJS.Platform;
  needed: () => boolean;
  spawnFn?: typeof spawn;
  pid?: number;
  restartDelayMs?: number;
}): KeepAwake {
  const platform = o.platform ?? process.platform;
  const spawnFn = o.spawnFn ?? spawn;
  const pid = o.pid ?? process.pid;
  let child: ChildProcess | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  function start(): void {
    const c = spawnFn('/usr/bin/caffeinate', ['-s', '-w', String(pid)], { stdio: 'ignore' });
    child = c;
    c.on('error', () => undefined);
    c.on('exit', () => {
      if (child !== c) return;
      child = null;
      if (!stopped && o.needed()) {
        timer = setTimeout(update, o.restartDelayMs ?? 5000);
        timer.unref();
      }
    });
  }

  function update(): void {
    if (platform !== 'darwin' || stopped) return;
    const want = o.needed();
    if (want && !child) start();
    if (!want && child) {
      const c = child;
      child = null;
      c.kill();
    }
  }

  return {
    update,
    active: () => child !== null,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (child) {
        const c = child;
        child = null;
        c.kill();
      }
    },
  };
}
