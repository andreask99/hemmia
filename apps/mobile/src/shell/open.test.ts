import { describe, expect, it, vi } from 'vitest';
import { createHubStore, type KeyValue } from './hubs.ts';
import { HUB_BRIDGE_LEVEL, MIN_SHELL_LEVEL } from '@hemmia/shared';
import {
  checkHub,
  compatibility,
  incomingLinkTarget,
  isReachable,
  linkTarget,
  openHub,
  startAction,
} from './open.ts';
import { MIN_HUB_BRIDGE, SHELL_LEVEL } from './version.ts';

const rules = { relayDomain: 'relay.example', devHosts: [] };
const CODE = 'A'.repeat(43);

function memory(): KeyValue {
  let value: string | null = null;
  return {
    get: () => Promise.resolve({ value }),
    set: (o) => {
      value = o.value;
      return Promise.resolve();
    },
  };
}

describe('linkTarget', () => {
  it('reads share and direct links', () => {
    expect(
      linkTarget(` https://join.relay.example/j#1~zt0jr4qknd6e.h.relay.example~i~${CODE} `, rules),
    ).toEqual({
      hubHost: 'zt0jr4qknd6e.h.relay.example',
      path: `/join#i~${CODE}`,
    });
    expect(linkTarget(`https://homehub.tail1.ts.net/join#d~${CODE}`, rules)).toEqual({
      hubHost: 'homehub.tail1.ts.net',
      path: `/join#d~${CODE}`,
    });
  });

  it('refuses other hosts and junk', () => {
    expect(
      linkTarget(`https://join.relay.example/j#1~zt0jr4qknd6e.h.other.example~i~${CODE}`, rules),
    ).toBeNull();
    expect(linkTarget(`https://evil.example/join#d~${CODE}`, rules)).toBeNull();
    expect(linkTarget('hello', rules)).toBeNull();
  });
});

describe('incomingLinkTarget', () => {
  it('reads the app scheme and the https share link', () => {
    const want = { hubHost: 'zt0jr4qknd6e.h.relay.example', path: `/join#l~${CODE}` };
    expect(
      incomingLinkTarget(`hemmia://join#1~zt0jr4qknd6e.h.relay.example~l~${CODE}`, rules),
    ).toEqual(want);
    expect(
      incomingLinkTarget(
        `https://join.relay.example/j#1~zt0jr4qknd6e.h.relay.example~l~${CODE}`,
        rules,
      ),
    ).toEqual(want);
    expect(
      incomingLinkTarget(`hemmia://other#1~zt0jr4qknd6e.h.relay.example~l~${CODE}`, rules),
    ).toBeNull();
  });
});

describe('openHub', () => {
  const target = { hubHost: 'homehub.tail1.ts.net', path: '/' };

  it('saves a reachable hub, keeps its name, then opens it', async () => {
    const store = createHubStore(memory(), rules);
    await store.save({ hubHost: target.hubHost, name: 'Home', lastReachedAt: 1 });
    const open = vi.fn(() => Promise.resolve());
    const deps = {
      store,
      rules,
      launcher: { open },
      check: () => Promise.resolve('ok' as const),
      now: () => 99,
      defaultName: 'kchat',
    };
    expect(await openHub(deps, target)).toBe('opened');
    expect(await store.list()).toEqual([
      { hubHost: target.hubHost, name: 'Home', lastReachedAt: 99 },
    ]);
    expect(open).toHaveBeenCalledWith(target);
  });

  it('does not open or save an unreachable hub, and refuses non-hub hosts', async () => {
    const store = createHubStore(memory(), rules);
    const open = vi.fn(() => Promise.resolve());
    const deps = {
      store,
      rules,
      launcher: { open },
      check: () => Promise.resolve('offline' as const),
      now: () => 1,
      defaultName: 'kchat',
    };
    expect(await openHub(deps, target)).toBe('offline');
    expect(await openHub(deps, { hubHost: 'evil.example', path: '/' })).toBe('refused');
    expect(open).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });
});

describe('openHub and the handshake', () => {
  it('saves a hub that needs an update but does not open it', async () => {
    const store = createHubStore(memory(), rules);
    const open = vi.fn(() => Promise.resolve());
    for (const result of ['appTooOld', 'hubTooOld'] as const) {
      const deps = {
        store,
        rules,
        launcher: { open },
        check: () => Promise.resolve(result),
        now: () => 5,
        defaultName: 'Hemmia',
      };
      expect(await openHub(deps, { hubHost: 'homehub.tail1.ts.net', path: '/' })).toBe(result);
    }
    expect(open).not.toHaveBeenCalled();
    expect((await store.list()).map((h) => h.hubHost)).toEqual(['homehub.tail1.ts.net']);
  });
});

describe('compatibility', () => {
  it('this build and this hub version work together', () => {
    expect(
      compatibility({ status: 'ok', bridge: HUB_BRIDGE_LEVEL, minShell: MIN_SHELL_LEVEL }),
    ).toBe('ok');
  });

  it('names the side that is too old', () => {
    expect(compatibility({ status: 'ok', bridge: MIN_HUB_BRIDGE, minShell: SHELL_LEVEL + 1 })).toBe(
      'appTooOld',
    );
    expect(compatibility({ status: 'ok', bridge: MIN_HUB_BRIDGE - 1, minShell: SHELL_LEVEL })).toBe(
      'hubTooOld',
    );
  });
});

describe('checkHub', () => {
  const host = 'homehub.tail1.ts.net';
  const answer = (status: number, data: unknown) => () => Promise.resolve({ status, data });

  it('reads the health answer with native HTTP, as JSON or text', async () => {
    const get = vi.fn(answer(200, { status: 'ok', bridge: MIN_HUB_BRIDGE, minShell: 1 }));
    expect(await checkHub(host, get)).toBe('ok');
    expect(get).toHaveBeenCalledWith('https://homehub.tail1.ts.net/api/health');
    expect(
      await checkHub(host, answer(200, JSON.stringify({ status: 'ok', bridge: 1, minShell: 1 }))),
    ).toBe('ok');
    expect(
      await checkHub(host, answer(200, { status: 'ok', bridge: 1, minShell: SHELL_LEVEL + 1 })),
    ).toBe('appTooOld');
  });

  it('treats a hub without the handshake as too old, and failures as offline', async () => {
    expect(await checkHub(host, answer(200, { status: 'ok', version: '0.0.0' }))).toBe('hubTooOld');
    expect(await checkHub(host, answer(502, 'Bad gateway'))).toBe('offline');
    expect(await checkHub(host, answer(200, '<html>'))).toBe('offline');
    expect(await checkHub(host, () => Promise.reject(new Error('timeout')))).toBe('offline');
  });

  it('only checks reachability without native HTTP (browser development)', async () => {
    const f = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null)));
    expect(await checkHub(host, null, f)).toBe('ok');
    expect(await checkHub(host, null, () => Promise.reject(new TypeError('x')))).toBe('offline');
  });
});

describe('isReachable', () => {
  it('asks the health endpoint without CORS or credentials', async () => {
    const f = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null)));
    expect(await isReachable('homehub.tail1.ts.net', f)).toBe(true);
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe('https://homehub.tail1.ts.net/api/health');
    expect([init?.mode, init?.credentials]).toEqual(['no-cors', 'omit']);
    expect(
      await isReachable('x.tail1.ts.net', () => Promise.reject(new TypeError('Failed to fetch'))),
    ).toBe(false);
  });
});

describe('startAction', () => {
  const home = { hubHost: 'home.tail1.ts.net', name: 'Home', lastReachedAt: 2 };
  const gran = { hubHost: 'gran.tail1.ts.net', name: 'Gran', lastReachedAt: 1 };
  const start = { reason: 'start' as const, hubHost: null, link: null, push: null };

  it('opens the only saved hub, lists several, welcomes none', () => {
    expect(startAction(start, [home], null, rules)).toEqual({
      kind: 'open',
      target: { hubHost: home.hubHost, path: '/' },
    });
    expect(startAction(start, [home, gran], null, rules)).toEqual({
      kind: 'screen',
      screen: 'hubs',
    });
    expect(startAction(start, [], null, rules)).toEqual({ kind: 'screen', screen: 'welcome' });
  });

  it('follows a launch link or a link handed over by a hub', () => {
    const url = `hemmia://join#1~zt0jr4qknd6e.h.relay.example~i~${CODE}`;
    const want = {
      kind: 'open',
      target: { hubHost: 'zt0jr4qknd6e.h.relay.example', path: `/join#i~${CODE}` },
    };
    expect(startAction(start, [home], url, rules)).toEqual(want);
    expect(startAction({ ...start, reason: 'link', link: url }, [home], null, rules)).toEqual(want);
    expect(startAction({ ...start, reason: 'switch' }, [home], url, rules)).toEqual({
      kind: 'screen',
      screen: 'hubs',
    });
  });

  it('opens a tapped notification only for a saved hub', () => {
    const push = { ...start, reason: 'push' as const, push: { hubHost: gran.hubHost, ref: 'R1' } };
    expect(startAction(push, [home, gran], null, rules)).toEqual({
      kind: 'open',
      target: { hubHost: gran.hubHost, path: '/push-open#R1' },
    });
    expect(startAction(push, [home], null, rules)).toEqual({ kind: 'screen', screen: 'hubs' });
  });

  it('follows the phone-mode start rules', () => {
    expect(startAction(start, [], null, rules, true)).toEqual({ kind: 'screen', screen: 'phone' });
    expect(startAction(start, [home], null, rules, true)).toEqual({
      kind: 'screen',
      screen: 'hubs',
    });
    expect(startAction(start, [home], null, rules, false)).toEqual({
      kind: 'open',
      target: { hubHost: home.hubHost, path: '/' },
    });
  });

  it('shows offline for the hub that failed, and the list after switching', () => {
    expect(
      startAction({ ...start, reason: 'offline', hubHost: home.hubHost }, [home], null, rules),
    ).toEqual({
      kind: 'offline',
      hubHost: home.hubHost,
    });
    expect(
      startAction({ ...start, reason: 'switch', hubHost: home.hubHost }, [home], null, rules),
    ).toEqual({
      kind: 'screen',
      screen: 'hubs',
    });
  });
});
