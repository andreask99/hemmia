import { describe, expect, it } from 'vitest';
import type { CatalogModel } from '@hemmia/relay-protocol';
import type { LibraryModel } from './library.ts';
import {
  changed,
  chooseModels,
  dedupe,
  displayName,
  eligible,
  guard,
  memoryClass,
  memoryFor,
  sizeTags,
} from './select.ts';

const TODAY = '2026-11-21';

function lib(name: string, over: Partial<LibraryModel> = {}): LibraryModel {
  return {
    name,
    description: '',
    capabilities: ['tools'],
    sizes: ['8b'],
    cloud: false,
    pulls: 1_000_000,
    updatedAt: '2026-10-01',
    ...over,
  };
}

function entry(ollamaModel: string, minTotalMemoryGiB: number, downloadBytes = 1e9): CatalogModel {
  return {
    ollamaModel,
    name: displayName(ollamaModel),
    family: 'x',
    version: '',
    params: '',
    downloadBytes,
    digest: `sha256:${'0'.repeat(64)}`,
    memoryGiB: 4,
    minTotalMemoryGiB,
    contextTokens: 32768,
    vision: false,
    tools: true,
    think: false,
    pulls: 1,
    releasedAt: TODAY,
    addedAt: TODAY,
    tested: true,
    supersedes: [],
    description: '',
  };
}

describe('eligible', () => {
  it('leaves out embedding, decision, cloud-only and old models', () => {
    expect(eligible(lib('qwen3.8'), TODAY)).toBe(true);
    expect(eligible(lib('nomic', { capabilities: ['embedding'] }), TODAY)).toBe(false);
    expect(eligible(lib('tev1', { capabilities: ['decision'] }), TODAY)).toBe(false);
    expect(eligible(lib('minimax-m3', { sizes: [], cloud: true }), TODAY)).toBe(false);
    expect(eligible(lib('llama3.1', { updatedAt: '2024-11-30' }), TODAY)).toBe(false);
    for (const n of [
      'granite4.1-guardian',
      'deepseek-ocr',
      'lfm3-audio',
      'translategemma',
      'medgemma',
    ]) {
      expect(eligible(lib(n), TODAY)).toBe(false);
    }
    for (const n of ['mistral-medium-3.5', 'qwen3-coder', 'lfm3-vl', 'gemma4']) {
      expect(eligible(lib(n), TODAY)).toBe(true);
    }
  });
});

describe('chooseModels', () => {
  it('takes the most pulled and the newest with useful capabilities', () => {
    const popular = [
      lib('a', { pulls: 50_000 }),
      lib('b', { pulls: 90_000 }),
      lib('old', { updatedAt: '2020-01-01' }),
    ];
    const newest = [
      lib('fresh'),
      lib('toy', { pulls: 10 }),
      lib('plain', { capabilities: [] }),
      lib('a', { pulls: 50_000 }),
    ];
    const got = chooseModels(popular, newest, TODAY);
    expect(got.map((c) => [c.model.name, c.popularRank, c.newRank])).toEqual([
      ['b', 1, null],
      ['a', 2, 2],
      ['fresh', null, 1],
    ]);
  });
});

describe('tags and memory', () => {
  it('keeps the local size tags only', () => {
    const tags = [
      {
        model: 'm:8b',
        digest12: 'a',
        sizeBytes: 5e9,
        contextTokens: 1,
        vision: false,
        cloud: false,
      },
      {
        model: 'm:cloud',
        digest12: 'b',
        sizeBytes: 0,
        contextTokens: 1,
        vision: false,
        cloud: true,
      },
      {
        model: 'm:8b-q8_0',
        digest12: 'c',
        sizeBytes: 9e9,
        contextTokens: 1,
        vision: false,
        cloud: false,
      },
    ];
    expect(sizeTags(lib('m', { sizes: ['8b', 'cloud'] }), tags).map((t) => t.model)).toEqual([
      'm:8b',
    ]);
  });

  it('estimates memory and the smallest computer', () => {
    expect(memoryFor(18_731_025_387)).toBeCloseTo(22.1, 1);
    expect(memoryClass(22.1)).toBe(32);
    expect(memoryClass(4.4)).toBe(8);
    expect(memoryClass(600)).toBeNull();
    expect(displayName('gemma4:e4b')).toBe('Gemma 4 E4B');
  });
});

describe('dedupe', () => {
  it('keeps the newest version per family and memory class', () => {
    const got = dedupe([
      entry('qwen3.6:27b', 32),
      entry('qwen3.8:27b', 32),
      entry('qwen3.6:4b', 8),
      entry('qwen3-coder:30b', 32),
      entry('gpt-oss:20b', 24),
      entry('gpt-oss:20b-big', 24, 2e9),
    ]).map((e) => e.ollamaModel);
    expect(got).toEqual(['qwen3.8:27b', 'qwen3.6:4b', 'qwen3-coder:30b', 'gpt-oss:20b-big']);
  });
});

describe('guard', () => {
  const prev = Array.from({ length: 20 }, (_, i) => entry(`m${i}:8b`, 8));
  it('refuses a broken parse or too big a change', () => {
    expect(guard(prev, null, 50).ok).toBe(false);
    expect(guard(prev.slice(0, 3), null, 200).ok).toBe(false);
    expect(guard(prev.slice(0, 11), prev, 200).ok).toBe(false);
    const many = [...prev, ...Array.from({ length: 16 }, (_, i) => entry(`n${i}:8b`, 8))];
    expect(guard(many, prev, 200).ok).toBe(false);
    expect(guard(prev.slice(0, 15), prev, 200).ok).toBe(true);
    expect(guard(prev, null, 200)).toEqual({ ok: true, reason: 'first catalogue' });
  });

  it('ignores pull counts when deciding whether to publish', () => {
    expect(
      changed(
        prev.map((e) => ({ ...e, pulls: 99 })),
        prev,
      ),
    ).toBe(false);
    expect(changed(prev.slice(1), prev)).toBe(true);
  });
});
