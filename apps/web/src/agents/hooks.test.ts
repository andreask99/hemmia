import { describe, expect, it } from 'vitest';
import type { Agent } from '@hemmia/shared';
import { visibleAgents } from './hooks.ts';

const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  scope: 'personal',
  editable: true,
  name: id,
  emoji: '✨',
  description: '',
  instructions: 'x',
  examples: [],
  modelId: null,
  think: null,
  webSearch: true,
  images: true,
  pinned: false,
  pinOrder: null,
  lastUsedAt: null,
  updatedAt: 1,
  ...extra,
});

describe('visibleAgents', () => {
  it('shows pinned agents in their order, then recently used ones, up to the limit', () => {
    const list = [
      agent('never'),
      agent('old', { lastUsedAt: 1 }),
      agent('p2', { pinned: true, pinOrder: 2 }),
      agent('new', { lastUsedAt: 9 }),
      agent('p1', { pinned: true, pinOrder: 1 }),
    ];
    expect(visibleAgents(list, 3).map((a) => a.id)).toEqual(['p1', 'p2', 'new']);
    expect(visibleAgents(list, 5).map((a) => a.id)).toEqual(['p1', 'p2', 'new', 'old']);
  });

  it('always shows every pinned agent, even beyond the limit', () => {
    const pinned = ['a', 'b', 'c'].map((id, i) => agent(id, { pinned: true, pinOrder: i }));
    expect(visibleAgents(pinned, 2)).toHaveLength(3);
  });
});
