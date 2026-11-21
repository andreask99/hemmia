import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCount, parseDay, parseLibrary, parseSize, parseTags } from './library.ts';

const fixture = (f: string) => readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8');

describe('library page', () => {
  const models = parseLibrary(fixture('library.html'));

  it('reads each model', () => {
    expect(models.map((m) => m.name)).toEqual([
      'qwen3',
      'gemma4',
      'nomic-embed-text',
      'minimax-m3',
      'tev1',
    ]);
  });

  it('reads capabilities, sizes, pulls and date', () => {
    const qwen = models[0];
    expect(qwen?.capabilities).toEqual(['tools', 'thinking']);
    expect(qwen?.sizes).toEqual(['0.6b', '1.7b', '4b', '8b', '14b', '30b', '32b', '235b']);
    expect(qwen?.pulls).toBe(44_200_000);
    expect(qwen?.updatedAt).toBe('2025-10-10');
    expect(qwen?.cloud).toBe(false);
    expect(qwen?.description).toMatch(/^Qwen3 is the latest generation/);
  });

  it('marks cloud-only, embedding and decision models', () => {
    expect(models[2]?.capabilities).toContain('embedding');
    expect(models[3]?.cloud).toBe(true);
    expect(models[3]?.sizes).toEqual([]);
    expect(models[4]?.capabilities).toContain('decision');
    expect(models[1]?.capabilities).toContain('vision');
  });
});

describe('tags page', () => {
  it('reads digest, size, context and inputs', () => {
    const tags = parseTags(fixture('tags-qwen3.html'), 'qwen3');
    const t30 = tags.find((t) => t.model === 'qwen3:30b');
    expect(t30).toEqual({
      model: 'qwen3:30b',
      digest12: 'ad815644918f',
      sizeBytes: 19e9,
      contextTokens: 262_144,
      vision: false,
      cloud: false,
    });
    expect(tags.find((t) => t.model === 'qwen3:0.6b')?.sizeBytes).toBe(523e6);
    expect(tags.find((t) => t.model === 'qwen3:8b')?.digest12).toBe('500a1f067a9f');
  });

  it('takes the upper end of a size range, sees images and cloud tags', () => {
    const tags = parseTags(fixture('tags-gemma4.html'), 'gemma4');
    const t26 = tags.find((t) => t.model === 'gemma4:26b');
    expect(t26?.sizeBytes).toBe(19e9);
    expect(t26?.vision).toBe(true);
    expect(tags.find((t) => t.model === 'gemma4:cloud')?.cloud).toBe(true);
  });
});

describe('helpers', () => {
  it('parses counts, sizes and days', () => {
    expect(parseCount('44.2M')).toBe(44_200_000);
    expect(parseCount('812')).toBe(812);
    expect(parseSize('523MB')).toBe(523e6);
    expect(parseDay('Oct 10, 2025 8:18 PM UTC')).toBe('2025-10-10');
    expect(parseDay('yesterday')).toBe('');
  });
});
