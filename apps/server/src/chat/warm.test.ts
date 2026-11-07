import { describe, expect, it } from 'vitest';
import type { DueNotification } from '../db/daily.ts';
import { createMemoryManager } from '../jobs/memory.ts';
import { createScheduler } from '../jobs/scheduler.ts';
import type { ChatRequest, LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';
import { createBriefingWarmer } from './warm.ts';

const model = (id: string, ollamaModel: string): ResolvedChatModel => ({
  id,
  label: { en: id, de: id },
  engine: 'ollama',
  ollamaModel,
  contextTokens: 32768,
  historyBudgetTokens: 4000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: id === 'big',
  vision: false,
  thinking: false,
  tools: true,
});
const MODELS = [model('smart', 'smart:27b'), model('big', 'big:30b')];
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id, viewer) =>
    Promise.resolve(MODELS.find((m) => m.id === id && !(m.adultOnly && viewer.restricted)) ?? null),
  imageModel: () => null,
  defaultChatModelId: () => 'smart',
};
// Sunday 11 October 2026, 07:27 local time.
const NOW = new Date(2026, 9, 11, 7, 27).getTime();

function setup(options: { loaded?: string[]; paused?: boolean; due?: DueNotification[] } = {}) {
  const requests: ChatRequest[] = [];
  const calls: { time: string; date: string }[] = [];
  const llm: LlmClient = {
    async *chat(req) {
      requests.push(req);
      await Promise.resolve();
      yield { type: 'done', promptTokens: 0, outputTokens: 0, loadMs: 0 };
    },
    loaded: () => Promise.resolve((options.loaded ?? []).map((m) => ({ model: m, memoryGiB: 2 }))),
    unload: () => Promise.resolve(),
    capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: true }),
    installed: () => Promise.resolve([]),
  };
  const warmer = createBriefingWarmer({
    daily: {
      due: (date, _weekday, time) => {
        calls.push({ date, time });
        return time >= '07:30' ? (options.due ?? []) : [];
      },
    },
    registry,
    llm,
    scheduler: createScheduler({ memory: createMemoryManager({ engines: [], budgetGiB: 22 }) }),
    paused: () => options.paused ?? false,
    now: () => NOW,
  });
  return { warmer, requests, calls };
}
const due = (over: Partial<DueNotification> = {}): DueNotification => ({
  userId: 'u-anna',
  language: 'de',
  restricted: false,
  defaultModelId: null,
  kind: 'daily',
  alsoDaily: false,
  ...over,
});

describe('createBriefingWarmer', () => {
  it('loads the planner model three minutes ahead, once per notification', async () => {
    const { warmer, requests, calls } = setup({
      due: [due(), due({ userId: 'u-ben', defaultModelId: 'big' })],
    });
    expect(await warmer.check()).toEqual(['smart:27b', 'big:30b']);
    expect(calls).toEqual([{ date: '2026-10-11', time: '07:30' }]);
    // An empty chat with the reply's context size, kept loaded until the phone asks.
    expect(requests.map((r) => [r.model, r.messages.length, r.contextTokens])).toEqual([
      ['smart:27b', 0, 32768],
      ['big:30b', 0, 32768],
    ]);
    expect(requests[0]?.keepAliveSeconds).toBe(600);
    expect(await warmer.check()).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('uses the family model for a default the user may not use', async () => {
    const { warmer } = setup({ due: [due({ restricted: true, defaultModelId: 'big' })] });
    expect(await warmer.check()).toEqual(['smart:27b']);
  });

  it('skips a model already loaded, and everything while paused', async () => {
    expect(await setup({ due: [due()], loaded: ['smart:27b'] }).warmer.check()).toEqual([]);
    const paused = setup({ due: [due()], paused: true });
    expect(await paused.warmer.check()).toEqual([]);
    expect(paused.requests).toHaveLength(0);
  });
});
