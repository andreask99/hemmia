import { describe, expect, it } from 'vitest';
import type { ChatModelConfig, ModelsFile } from '../config/schema.ts';
import { LlmError, type ModelCapabilities } from '../llm/types.ts';
import { createModelRegistry } from './registry.ts';

const chat = (id: string, extra: Partial<ChatModelConfig> = {}): ChatModelConfig => ({
  id,
  label: { en: id, de: id },
  ollamaModel: `${id}:1b`,
  contextTokens: 16384,
  historyBudgetTokens: 12000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 4,
  enabled: true,
  adultOnly: false,
  ...extra,
});

const MODELS: ModelsFile = {
  cloudModels: [],
  chatModels: [
    chat('ghost'), // listed first on purpose: not installed
    chat('quick'),
    chat('smart', { think: 'low' }),
    chat('code', { adultOnly: true }),
    chat('off', { enabled: false }),
  ],
  imageModels: [
    {
      id: 'image',
      label: { en: 'P', de: 'B' },
      mfluxModel: 'z-image-turbo',
      steps: 9,
      width: 1024,
      height: 1024,
      memoryGiB: 10,
      enabled: true,
      goodAtText: false,
    },
  ],
  defaultChatModel: 'quick',
  defaultImageModel: 'image',
};

const CAPS: Record<string, ModelCapabilities> = {
  'quick:1b': { vision: true, thinking: false, tools: false },
  'smart:1b': { vision: false, thinking: true, tools: true },
  'code:1b': { vision: false, thinking: false, tools: true },
};

function fakeLlm() {
  const calls: string[] = [];
  let down = false;
  return {
    calls,
    setDown: (v: boolean) => {
      down = v;
    },
    llm: {
      capabilities: (model: string) => {
        calls.push(model);
        if (down) return Promise.reject(new LlmError('unavailable'));
        const caps = CAPS[model];
        return caps ? Promise.resolve(caps) : Promise.reject(new LlmError('model_not_found'));
      },
    },
  };
}

const adult = { restricted: false };
const teen = { restricted: true };

describe('model registry', () => {
  it('lists usable, installed models with their own capabilities', async () => {
    const r = createModelRegistry({ models: MODELS, llm: fakeLlm().llm });
    const list = await r.list(adult);
    expect(list.chatModels.map((m) => [m.id, m.vision, m.thinking])).toEqual([
      ['quick', true, false],
      ['smart', false, true],
      ['code', false, false],
    ]);
    expect(list.imageModels.map((m) => m.id)).toEqual(['image']);
    expect([list.defaultChatModel, list.defaultImageModel]).toEqual(['quick', 'image']);
  });

  it('hides adult-only models and image generation from restricted accounts', async () => {
    const r = createModelRegistry({ models: MODELS, llm: fakeLlm().llm });
    const list = await r.list(teen);
    expect(list.chatModels.map((m) => m.id)).toEqual(['quick', 'smart']);
    expect(list.imageModels).toEqual([]);
    expect(list.defaultImageModel).toBeNull();
    expect(await r.chatModel('code', teen)).toBeNull();
    expect(r.imageModel('image', teen)).toBeNull();
    expect(r.imageModel('image', adult)?.mfluxModel).toBe('z-image-turbo');
  });

  it('resolves single models and rejects off, missing and unknown ones', async () => {
    const r = createModelRegistry({ models: MODELS, llm: fakeLlm().llm });
    expect(await r.chatModel('quick', adult)).toMatchObject({
      id: 'quick',
      vision: true,
      ollamaModel: 'quick:1b',
    });
    // The image tool is only offered to models that support tools.
    expect((await r.chatModel('smart', adult))?.tools).toBe(true);
    expect((await r.chatModel('quick', adult))?.tools).toBe(false);
    expect(await r.chatModel('off', adult)).toBeNull();
    expect(await r.chatModel('ghost', adult)).toBeNull();
    expect(await r.chatModel('nope', adult)).toBeNull();
  });

  it('caches capabilities (including "not installed")', async () => {
    let t = 0;
    const f = fakeLlm();
    const r = createModelRegistry({ models: MODELS, llm: f.llm, cacheMs: 1000, now: () => t });
    await r.chatModel('quick', adult);
    await r.chatModel('ghost', adult);
    await r.chatModel('quick', adult);
    await r.chatModel('ghost', adult);
    expect(f.calls).toEqual(['quick:1b', 'ghost:1b']);
    t = 1000;
    await r.chatModel('quick', adult);
    expect(f.calls).toHaveLength(3);
  });

  it('falls back when the engine is down, without caching', async () => {
    const f = fakeLlm();
    f.setDown(true);
    const r = createModelRegistry({ models: MODELS, llm: f.llm });
    expect(await r.chatModel('smart', adult)).toMatchObject({ thinking: true, vision: false });
    expect(await r.chatModel('quick', adult)).toMatchObject({ thinking: false });
    f.setDown(false);
    expect(await r.chatModel('quick', adult)).toMatchObject({ vision: true });
  });

  it('falls back to the first model when the default is not installed', async () => {
    const r = createModelRegistry({
      models: { ...MODELS, defaultChatModel: 'ghost' },
      llm: fakeLlm().llm,
    });
    expect((await r.list(adult)).defaultChatModel).toBe('quick');
  });
  it('works with an empty models file (a new hub)', async () => {
    const empty: ModelsFile = { ...MODELS, chatModels: [], defaultChatModel: null };
    const r = createModelRegistry({ models: empty, llm: fakeLlm().llm });
    const list = await r.list(adult);
    expect(list.chatModels).toEqual([]);
    expect(list.defaultChatModel).toBeNull();
    expect(r.defaultChatModelId()).toBeNull();
  });

  it('resolves the default: admin choice, file default, first enabled local model', () => {
    let o = {
      disabled: [] as string[],
      defaultChatModel: 'smart' as string | null,
      defaultImageModel: null,
      imagesOff: false,
      paused: false,
      webSearch: 'all' as const,
      extraModels: [],
      cloud: 'all' as const,
    };
    const r = createModelRegistry({ models: MODELS, llm: fakeLlm().llm, overrides: () => o });
    expect(r.defaultChatModelId()).toBe('smart');
    o = { ...o, disabled: ['smart'] };
    expect(r.defaultChatModelId()).toBe('quick');
    o = { ...o, disabled: ['smart', 'quick'] };
    // First enabled model in file order ('ghost' isn't installed, but is still configured).
    expect(r.defaultChatModelId()).toBe('ghost');
    const noDefault = createModelRegistry({
      models: { ...MODELS, defaultChatModel: null },
      llm: fakeLlm().llm,
    });
    expect(noDefault.defaultChatModelId()).toBe('ghost');
  });
});
