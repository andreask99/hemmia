import { describe, expect, it } from 'vitest';
import { isHubHost } from './hosts.ts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createHubStore, type KeyValue, useHubs } from './hubs.ts';

const rules = { relayDomain: 'relay.example', devHosts: ['localhost', '10.0.2.2'] };

describe('isHubHost', () => {
  it.each([
    ['zt0jr4qknd6e.h.relay.example', true],
    ['homehub.tail1234.ts.net', true],
    ['localhost:8790', true],
    ['10.0.2.2:8790', true],
    ['a.b.h.relay.example', false],
    ['h.relay.example', false],
    ['zt0jr4qknd6e.h.relay.example:8443', false],
    ['ts.net', false],
    ['evil.example', false],
    ['evil.example/zt0jr4qknd6e.h.relay.example', false],
    ['user@homehub.tail1234.ts.net', false],
    ['HomeMac.tail1234.ts.net', false],
    ['localhost:0', false],
    ['localhost:99999', false],
    ['-bad.tail1234.ts.net', false],
    ['', false],
  ])('%s → %s', (host, ok) => {
    expect(isHubHost(host, rules)).toBe(ok);
  });
});

function memory(initial: string | null = null): KeyValue & { value: string | null } {
  const kv = {
    value: initial,
    get: () => Promise.resolve({ value: kv.value }),
    set: ({ value }: { value: string }) => {
      kv.value = value;
      return Promise.resolve();
    },
  };
  return kv;
}

describe('hub store', () => {
  it('saves, orders by last reached, updates and removes', async () => {
    const store = createHubStore(memory(), rules);
    await store.save({ hubHost: 'a.tail1.ts.net', name: 'Home', lastReachedAt: 10 });
    await store.save({ hubHost: 'b.tail1.ts.net', name: 'Grandma', lastReachedAt: 20 });
    await store.save({ hubHost: 'a.tail1.ts.net', name: 'Our home', lastReachedAt: 30 });
    expect((await store.list()).map((h) => [h.hubHost, h.name])).toEqual([
      ['a.tail1.ts.net', 'Our home'],
      ['b.tail1.ts.net', 'Grandma'],
    ]);
    await store.remove('a.tail1.ts.net');
    expect((await store.list()).map((h) => h.hubHost)).toEqual(['b.tail1.ts.net']);
  });

  it('refuses to save a host that is not a hub', async () => {
    const store = createHubStore(memory(), rules);
    await expect(
      store.save({ hubHost: 'evil.example', name: 'x', lastReachedAt: 1 }),
    ).rejects.toThrow();
  });

  it('drops damaged and foreign entries on read', async () => {
    const stored = JSON.stringify([
      { hubHost: 'a.tail1.ts.net', name: 'Home', lastReachedAt: 1 },
      { hubHost: 'evil.example', name: 'x', lastReachedAt: 2 },
      { hubHost: 'b.tail1.ts.net', name: 'x', lastReachedAt: -1 },
      { hubHost: 'c.tail1.ts.net', name: 'x', lastReachedAt: 3, extra: true },
      'nonsense',
    ]);
    expect((await createHubStore(memory(stored), rules).list()).map((h) => h.hubHost)).toEqual([
      'a.tail1.ts.net',
    ]);
    expect(await createHubStore(memory('{not json'), rules).list()).toEqual([]);
    expect(await createHubStore(memory('{"a":1}'), rules).list()).toEqual([]);
  });
});

describe('useHubs', () => {
  it('loads the hubs and removes one', async () => {
    const store = createHubStore(memory(), rules);
    await store.save({ hubHost: 'a.tail1.ts.net', name: 'Home', lastReachedAt: 1 });
    const { result } = renderHook(() => useHubs(store));
    await waitFor(() => {
      expect(result.current.hubs?.length).toBe(1);
    });
    await act(() => result.current.remove('a.tail1.ts.net'));
    expect(result.current.hubs).toEqual([]);
  });
});
