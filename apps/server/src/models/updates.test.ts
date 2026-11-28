import { describe, expect, it } from 'vitest';
import type { CatalogModel } from '@hemmia/relay-protocol';
import { openDatabase } from '../db/database.ts';
import { fromRemote } from './catalog.ts';
import { remoteModel } from './catalog-fixtures.ts';
import {
  isBuildOf,
  createUpdateNotices,
  createUpdateStateStore,
  findUpdates,
  successorOf,
  type UpdateState,
} from './updates.ts';

const entry = (name: string, over: Partial<CatalogModel> = {}) =>
  fromRemote(remoteModel(name, { minTotalMemoryGiB: 32, ...over }));

const CATALOG = [
  entry('qwen3.9:27b'),
  entry('qwen3.9:4b', { minTotalMemoryGiB: 8 }),
  entry('qwen3.9:122b', { minTotalMemoryGiB: 128 }),
  entry('qwen3.8:27b'),
  entry('qwen3-coder:30b'),
  entry('gemma4:26b'),
];

const empty = (): UpdateState => ({ baselines: {}, announced: [], dismissed: [], unseen: false });

describe('successorOf', () => {
  it('finds the newer version with the closest size that fits', () => {
    expect(successorOf('qwen3.8:27b', CATALOG, 32)?.ollamaModel).toBe('qwen3.9:27b');
    expect(successorOf('qwen3.8:30b', CATALOG, 32)?.ollamaModel).toBe('qwen3.9:27b');
    expect(successorOf('qwen3.6:4b', CATALOG, 32)?.ollamaModel).toBe('qwen3.9:4b');
    // Only the small one fits a 16 GB computer.
    expect(successorOf('qwen3.8:27b', CATALOG, 16)?.ollamaModel).toBe('qwen3.9:4b');
  });

  it('keeps families apart and needs a newer version', () => {
    expect(successorOf('qwen3-coder:30b', CATALOG, 32)).toBeNull();
    expect(successorOf('qwen3.9:27b', CATALOG, 32)).toBeNull();
    expect(successorOf('gemma3:27b', CATALOG, 32)?.ollamaModel).toBe('gemma4:26b');
    expect(successorOf('gpt-oss:20b', CATALOG, 32)).toBeNull();
  });

  it('takes the biggest that fits when the installed size is unknown', () => {
    expect(successorOf('qwen3.8', CATALOG, 256)?.ollamaModel).toBe('qwen3.9:122b');
  });

  it('honours an explicit supersedes', () => {
    const cat = [entry('newname:8b', { supersedes: ['oldname:7b'], family: 'newname' })];
    expect(successorOf('oldname:7b', cat, 32)?.ollamaModel).toBe('newname:8b');
  });
});

describe('findUpdates', () => {
  it('reports a newer version once the family offers the old one', () => {
    const r = findUpdates({
      offered: ['qwen3.8:27b'],
      catalog: CATALOG,
      memoryGiB: 32,
      state: empty(),
    });
    expect(r.updates.map((u) => [u.from, u.to, u.kind])).toEqual([
      ['qwen3.8:27b', 'qwen3.9:27b', 'version'],
    ]);
  });

  it('marks an update whose new version is offered already (switch not finished)', () => {
    const r = findUpdates({
      offered: ['qwen3.8:27b', 'qwen3.9:27b'],
      catalog: CATALOG,
      memoryGiB: 32,
      state: empty(),
    });
    expect(r.updates.map((u) => [u.from, u.alreadyOffered])).toEqual([['qwen3.8:27b', true]]);
  });

  it('reports new weights only after the catalogue digest moved from the baseline', () => {
    const first = findUpdates({
      offered: ['gemma4:26b'],
      catalog: CATALOG,
      memoryGiB: 32,
      state: empty(),
    });
    expect(first.updates).toEqual([]);
    expect(first.baselines['gemma4:26b']).toBe(`sha256:${'1'.repeat(64)}`);
    const moved = [entry('gemma4:26b', { digest: `sha256:${'2'.repeat(64)}` })];
    const later = findUpdates({
      offered: ['gemma4:26b'],
      catalog: moved,
      memoryGiB: 32,
      state: { ...empty(), baselines: first.baselines },
    });
    expect(later.updates.map((u) => [u.kind, u.key])).toEqual([
      ['weights', `w:gemma4:26b@sha256:${'2'.repeat(64)}`],
    ]);
  });
});

describe('state store', () => {
  it('round-trips and starts empty', () => {
    const s = createUpdateStateStore(openDatabase(':memory:'));
    expect(s.get()).toEqual(empty());
    s.set({ ...empty(), announced: ['a'], unseen: true });
    expect(s.get().announced).toEqual(['a']);
    expect(s.get().unseen).toBe(true);
  });
});

describe('notices', () => {
  function notices(offered: string[]) {
    const state = createUpdateStateStore(openDatabase(':memory:'));
    let pushes = 0;
    const n = createUpdateNotices({
      catalog: () => CATALOG,
      offered: () => offered,
      installed: () => Promise.resolve(offered),
      memoryGiB: () => 32,
      state,
      notifyAdmins: () => {
        pushes++;
        return Promise.resolve();
      },
    });
    return { n, state, pushes: () => pushes };
  }

  it('announces a new update once and marks it unseen', async () => {
    const t = notices(['qwen3.8:27b']);
    expect((await t.n.refresh(true)).map((u) => u.to)).toEqual(['qwen3.9:27b']);
    await t.n.refresh(true);
    expect(t.pushes()).toBe(1);
    expect(t.n.unseen()).toBe(true);
    t.n.seen();
    expect(t.n.unseen()).toBe(false);
  });

  it('does not announce a switch that is only unfinished', async () => {
    const t = notices(['qwen3.8:27b', 'qwen3.9:27b']);
    expect(await t.n.refresh(true)).toHaveLength(1);
    expect(t.pushes()).toBe(0);
  });

  it('only lists without announcing, and stays quiet after "Later"', async () => {
    const t = notices(['qwen3.8:27b']);
    const [u] = await t.n.refresh(false);
    expect(t.pushes()).toBe(0);
    t.n.dismiss(u?.key ?? '');
    expect(await t.n.refresh(true)).toEqual([]);
    expect(t.pushes()).toBe(0);
  });
});

describe('isBuildOf', () => {
  it('counts builds of a tag as that catalogue model, nothing else', () => {
    expect(isBuildOf('qwen3.8:27b-mlx', 'qwen3.8:27b')).toBe(true);
    expect(isBuildOf('qwen3.8:27b-q8_0', 'qwen3.8:27b')).toBe(true);
    expect(isBuildOf('qwen3.8:27b', 'qwen3.8:27b')).toBe(true);
    expect(isBuildOf('gemma4', 'gemma4:latest')).toBe(true);
    expect(isBuildOf('qwen3.8:27b', 'qwen3.8:27b-mlx')).toBe(false);
    expect(isBuildOf('qwen3.8:270b', 'qwen3.8:27b')).toBe(false);
    expect(isBuildOf('qwen3.8-dev:latest', 'qwen3.8:latest')).toBe(false);
    expect(isBuildOf('qwen3.9:27b', 'qwen3.8:27b')).toBe(false);
  });
});
