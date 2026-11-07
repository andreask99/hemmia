/**
 * Paired hubs, stored in Capacitor Preferences (ARCHITECTURE.md §3.4). Validated on every
 * read: a damaged or foreign entry is dropped rather than trusted.
 */
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import type { HostRules } from './hosts.ts';
import { isHubHost } from './hosts.ts';

export const StoredHub = z
  .object({
    hubHost: z.string().min(1).max(260),
    name: z.string().max(80),
    lastReachedAt: z.number().int().nonnegative(),
  })
  .strict();
export type StoredHub = z.infer<typeof StoredHub>;

/** The part of `@capacitor/preferences` the store uses (injectable for tests). */
export interface KeyValue {
  get: (o: { key: string }) => Promise<{ value: string | null }>;
  set: (o: { key: string; value: string }) => Promise<void>;
}

const KEY = 'hubs.v1';
const MAX_HUBS = 20;

export function createHubStore(kv: KeyValue, rules: HostRules) {
  async function list(): Promise<StoredHub[]> {
    const { value } = await kv.get({ key: KEY });
    if (value === null) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    const hubs: StoredHub[] = [];
    for (const item of raw) {
      const parsed = StoredHub.safeParse(item);
      if (parsed.success && isHubHost(parsed.data.hubHost, rules)) hubs.push(parsed.data);
    }
    return hubs.sort((a, b) => b.lastReachedAt - a.lastReachedAt);
  }

  async function write(hubs: StoredHub[]): Promise<void> {
    await kv.set({ key: KEY, value: JSON.stringify(hubs.slice(0, MAX_HUBS)) });
  }

  return {
    list,
    /** Adds the hub or updates its name and time; the most recent hub comes first. */
    async save(hub: StoredHub): Promise<void> {
      if (!isHubHost(hub.hubHost, rules)) throw new Error('not a hub host');
      const hubs = (await list()).filter((h) => h.hubHost !== hub.hubHost);
      await write([StoredHub.parse(hub), ...hubs]);
    },
    async remove(hubHost: string): Promise<void> {
      await write((await list()).filter((h) => h.hubHost !== hubHost));
    },
  };
}
export type HubStore = ReturnType<typeof createHubStore>;

/** The saved hubs for the shell screens; `hubs` is null while loading. */
export function useHubs(store: HubStore): {
  hubs: StoredHub[] | null;
  remove: (hubHost: string) => Promise<void>;
} {
  const [hubs, setHubs] = useState<StoredHub[] | null>(null);
  useEffect(() => {
    let live = true;
    void store.list().then((h) => {
      if (live) setHubs(h);
    });
    return () => {
      live = false;
    };
  }, [store]);
  const remove = useCallback(
    async (hubHost: string) => {
      await store.remove(hubHost);
      setHubs(await store.list());
    },
    [store],
  );
  return { hubs, remove };
}
