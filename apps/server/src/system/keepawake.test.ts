import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { createKeepAwake } from './keepawake.ts';

function fakeSpawn() {
  const runs: {
    cmd: string;
    args: string[];
    child: EventEmitter & { kill: () => void; killed: boolean };
  }[] = [];
  const fn = ((cmd: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      killed: false,
      kill() {
        child.killed = true;
        child.emit('exit', 0);
      },
    });
    runs.push({ cmd, args, child });
    return child;
  }) as unknown as typeof spawn;
  return { fn, runs };
}

describe('keep awake', () => {
  it('holds caffeinate on macOS only while needed, without a shell', () => {
    const f = fakeSpawn();
    let needed = false;
    const k = createKeepAwake({
      platform: 'darwin',
      needed: () => needed,
      spawnFn: f.fn,
      pid: 4242,
    });
    k.update();
    expect(f.runs).toHaveLength(0);
    needed = true;
    k.update();
    expect(f.runs[0]).toMatchObject({ cmd: '/usr/bin/caffeinate', args: ['-s', '-w', '4242'] });
    expect(k.active()).toBe(true);
    needed = false;
    k.update();
    expect(f.runs[0]?.child.killed).toBe(true);
    expect(k.active()).toBe(false);
  });

  it('restarts it when it exits while still needed', async () => {
    const f = fakeSpawn();
    const k = createKeepAwake({
      platform: 'darwin',
      needed: () => true,
      spawnFn: f.fn,
      restartDelayMs: 5,
    });
    k.update();
    f.runs[0]?.child.emit('exit', 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(f.runs).toHaveLength(2);
    k.stop();
    expect(k.active()).toBe(false);
  });

  it('does nothing on other platforms', () => {
    const f = fakeSpawn();
    const k = createKeepAwake({ platform: 'linux', needed: () => true, spawnFn: f.fn });
    k.update();
    expect(f.runs).toHaveLength(0);
  });
});
