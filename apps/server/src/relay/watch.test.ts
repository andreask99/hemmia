import { describe, expect, it } from 'vitest';
import type { RemoteStatus } from '@hemmia/shared';
import { createConnectWatch } from './watch.ts';

const BASE: RemoteStatus = {
  relayConfigured: true,
  connect: true,
  hostname: 'abcdefghjkmn.h.relay.test',
  state: 'connected',
  since: 0,
  lastError: null,
  certificate: null,
  quota: null,
};

function setup() {
  let t = 0;
  let s: RemoteStatus = BASE;
  const sent: boolean[] = [];
  const watch = createConnectWatch({
    status: () => Promise.resolve(s),
    notify: (up) => {
      sent.push(up);
      return Promise.resolve();
    },
    log: { warn: () => undefined, info: () => undefined },
    now: () => t,
    downAfterMs: 600_000,
  });
  return {
    watch,
    sent,
    at: (ms: number, next: Partial<RemoteStatus>) => {
      t = ms;
      s = { ...BASE, ...next };
      return watch.check();
    },
  };
}

describe('Connect watch', () => {
  it('stays quiet while connected and through short outages', async () => {
    const w = setup();
    await w.at(0, {});
    await w.at(60_000, { state: 'connecting' });
    await w.at(500_000, { state: 'error' });
    await w.at(560_000, {});
    await w.at(2_000_000, {});
    expect(w.sent).toEqual([]);
  });

  it('tells the admins once after 10 minutes down, and once when it is back', async () => {
    const w = setup();
    await w.at(0, { state: 'error', lastError: 'blocked' });
    await w.at(599_000, { state: 'error' });
    expect(w.sent).toEqual([]);
    await w.at(600_000, { state: 'connecting' });
    await w.at(1_200_000, { state: 'error' });
    expect(w.sent).toEqual([false]);
    await w.at(1_260_000, {});
    await w.at(1_320_000, {});
    expect(w.sent).toEqual([false, true]);
  });

  it('forgets an outage when Connect is switched off', async () => {
    const w = setup();
    await w.at(0, { state: 'error' });
    await w.at(600_000, { state: 'error' });
    await w.at(660_000, { connect: false, state: 'off' });
    await w.at(720_000, {});
    expect(w.sent).toEqual([false]);
  });

  it('survives a failing status and a failing notification', async () => {
    let calls = 0;
    const watch = createConnectWatch({
      status: () => Promise.reject(new Error('db busy')),
      notify: () => {
        calls++;
        return Promise.reject(new Error('push failed'));
      },
      log: { warn: () => undefined, info: () => undefined },
    });
    await expect(watch.check()).resolves.toBeUndefined();
    expect(calls).toBe(0);
  });
});
