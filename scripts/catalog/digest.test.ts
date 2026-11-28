import { describe, expect, it } from 'vitest';
import type { CatalogModel } from '@hemmia/relay-protocol';
import { analyse, buildDigest, type DigestInput, prettyName } from './digest.ts';

function entry(ollamaModel: string, over: Partial<CatalogModel> = {}): CatalogModel {
  const [base = '', tag = ''] = ollamaModel.split(':');
  return {
    ollamaModel,
    name: ollamaModel,
    family: base.replace(/[\d.]+/g, ''),
    version: /\d[\d.]*/.exec(base)?.[0] ?? '',
    params: tag,
    downloadBytes: 10e9,
    digest: `sha256:${'a'.repeat(64)}`,
    memoryGiB: 12,
    minTotalMemoryGiB: 16,
    contextTokens: 32768,
    vision: false,
    tools: true,
    think: false,
    pulls: 1_000_000,
    releasedAt: '2026-11-01',
    addedAt: '2026-11-01',
    tested: true,
    supersedes: [],
    description: 'A capable model. More text here.',
    ...over,
  };
}

const OLD = [
  entry('qwen3.8:27b', { minTotalMemoryGiB: 32 }),
  entry('gemma4:26b', { minTotalMemoryGiB: 32 }),
  entry('qwen2.5-coder:7b'),
];

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    date: '2026-11-28',
    macMemoryGiB: 32,
    installed: ['qwen3.8:27b-mlx', 'gemma4:26b', 'qwen3.8-dev:latest'],
    catalog: OLD,
    previous: OLD,
    published: false,
    tests: [],
    problem: null,
    waiting: 0,
    ...over,
  };
}

describe('model digest', () => {
  it('names models readably', () => {
    expect(prettyName('qwen3.8:27b')).toBe('Qwen 3.8 27B');
    expect(prettyName('nemotron-3.5-bolt:e4b')).toBe('Nemotron 3.5 Bolt E4B');
    expect(prettyName('qwen3-coder:30b-a3b')).toBe('Qwen 3 Coder 30B');
    expect(prettyName('gpt-oss:20b')).toBe('GPT OSS 20B');
    expect(prettyName('qwen3-vl:2b')).toBe('Qwen 3 VL 2B');
    expect(prettyName('deepseek-r1:8b')).toBe('Deepseek R1 8B');
    expect(prettyName('mimo-v2.6:9b')).toBe('Mimo V2.6 9B');
  });

  it('stays quiet when nothing happened', () => {
    const d = buildDigest(input());
    expect(d.send).toBe(false);
    expect(d.subject).toBe('Hemmia models: nothing new for you');
    expect(d.text).toContain('Your models are up to date.');
    // Local builds aren't listed; the MLX variant counts as Qwen 3.8.
    expect(d.text).toContain('✓ Qwen 3.8 27B');
    expect(d.text).not.toContain('Dev');
  });

  it('puts a newer Qwen or Gemma first and in the subject', () => {
    const catalog = [
      ...OLD,
      entry('qwen3.9:27b', { minTotalMemoryGiB: 32, downloadBytes: 17e9 }),
      entry('qwen3.9:235b', { minTotalMemoryGiB: 256 }),
    ];
    const d = buildDigest(input({ catalog, published: true }));
    expect(d.send).toBe(true);
    expect(d.subject).toBe('Hemmia models: update for your models: Qwen 3.9 · 1 new model');
    const mine = d.text.indexOf('YOUR MODELS');
    expect(d.text.indexOf('⬆ Qwen 3.8 27B → Qwen 3.9 27B', mine)).toBeGreaterThan(mine);
    expect(d.text.indexOf('⬆')).toBeLessThan(d.text.indexOf('✓ Gemma 4 26B'));
    expect(d.text).toContain('ollama pull qwen3.9:27b');
    // A newer version of something you have isn't also a "worth trying" pick.
    expect(d.text).toContain('Qwen 3.9: 27B, 235B (fits this Mac up to 27B)');
    expect(d.html).toContain('Qwen 3.8 27B → Qwen 3.9 27B');
  });

  it('picks up to three new models worth trying: fitting, tools first, then downloads', () => {
    const catalog = [
      ...OLD,
      entry('alpha:8b', { pulls: 10, tools: false }),
      entry('beta:8b', { pulls: 500 }),
      entry('beta:70b', { pulls: 500, minTotalMemoryGiB: 96 }),
      entry('gamma:12b', { pulls: 9000 }),
      entry('delta:4b', { pulls: 100 }),
      entry('huge:400b', { minTotalMemoryGiB: 512, pulls: 1e9 }),
    ];
    const a = analyse(input({ catalog, published: true }));
    expect(a.picks.map((e) => e.ollamaModel)).toEqual(['gamma:12b', 'beta:8b', 'delta:4b']);
    expect(a.fresh.map((g) => g.base).sort()).toEqual(['alpha', 'beta', 'delta', 'gamma', 'huge']);
    const d = buildDigest(input({ catalog, published: true }));
    expect(d.text).toContain('5 new models in the catalogue, 3 worth trying.');
    expect(d.text).toContain('Huge: 400B (too big for this Mac)');
    expect(d.text).toContain('1. Gamma 12B');
    expect(d.text).toContain('A capable model.');
  });

  it('reports removals, failed tests and problems', () => {
    const d = buildDigest(
      input({
        catalog: OLD.slice(0, 2),
        published: true,
        tests: [
          {
            model: 'mimo:9b',
            ok: false,
            seconds: 2,
            tools: false,
            vision: false,
            error: 'HTTP 500',
          },
          { model: 'muse:30b', ok: true, seconds: 300, tools: true, vision: false, error: null },
        ],
      }),
    );
    expect(d.subject).toBe('Hemmia models: 1 problem');
    expect(d.text).toContain('Qwen 2.5 Coder: 7B');
    expect(d.text).toContain('1 test passed: Muse 30B');
    expect(d.text).toContain('✗ Mimo 9B failed after 2s: HTTP 500');
  });

  it('says so when Ollama could not be asked, and escapes HTML', () => {
    const d = buildDigest(
      input({ installed: null, problem: 'Not published: <too many removed>.' }),
    );
    expect(d.send).toBe(true);
    expect(d.text).toContain('Couldn’t ask Ollama');
    expect(d.html).toContain('&lt;too many removed&gt;');
    expect(d.html).not.toContain('<too many');
  });
});
