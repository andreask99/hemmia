/**
 * Model registry: config/models.json merged with live capabilities from the engine.
 */
import {
  type AdminModelsResponse,
  type ChatModelInfo,
  type InstalledModel,
  maxMessageChars,
  type ModelsResponse,
} from '@hemmia/shared';
import type { ChatModelConfig, CloudModelConfig, ModelsFile } from '../config/schema.ts';
import {
  type CloudProvider,
  LlmError,
  type LlmClient,
  type ModelCapabilities,
} from '../llm/types.ts';
import type { ModelOverrides } from './overrides.ts';
import { isCloud, type ModelRegistry, type ModelViewer, type ResolvedChatModel } from './types.ts';

export interface RegistryOptions {
  models: ModelsFile;
  llm: Pick<LlmClient, 'capabilities'> & Partial<Pick<LlmClient, 'installed'>>;
  /** How long capabilities are cached per model, ms. Default 5 minutes. */
  cacheMs?: number;
  now?: () => number;
  /** Admin choices from the settings table, read on every call. */
  overrides?: () => ModelOverrides;
  /**
   * Cloud providers this user has an API key for (clear metadata, no key needed). Cloud
   * models are offered only for these, and only when the admin allows cloud for the user.
   */
  cloudKeys?: (userId: string) => ReadonlySet<CloudProvider>;
  /** False when this computer can't make pictures (P1.4): image models are hidden. */
  imagesAvailable?: () => boolean;
  /** Admin-added local servers (P1.7); models of a removed server are not offered. */
  customEngines?: () => readonly { id: string; label: string }[];
  /** What each local server offers right now, for the admin's "add a model" list. */
  customModels?: () => Promise<{ engineId: string; engineLabel: string; models: string[] }[]>;
}

/** A chat model entry, with the engine for models an admin added. */
type ChatEntry = ChatModelConfig & {
  engine?: string;
  customVision?: boolean;
  customTools?: boolean;
};

const NO_OVERRIDES: ModelOverrides = {
  disabled: [],
  defaultChatModel: null,
  defaultImageModel: null,
  imagesOff: false,
  paused: false,
  webSearch: 'all',
  extraModels: [],
  cloud: 'all',
};

/** A cloud model as a resolved chat model (capabilities from the config, no engine call). */
function cloudAsResolved(m: CloudModelConfig): ResolvedChatModel {
  return {
    id: m.id,
    label: m.label,
    ...(m.description ? { description: m.description } : {}),
    ...(m.details ? { details: m.details } : {}),
    engine: m.provider,
    // The provider's model id; never sent to Ollama (callers pick the engine by `engine`).
    ollamaModel: m.providerModel,
    contextTokens: m.contextTokens,
    historyBudgetTokens: m.historyBudgetTokens,
    think: m.thinking,
    unloadAfterUse: false,
    memoryGiB: 0,
    enabled: m.enabled,
    adultOnly: m.adultOnly,
    vision: m.vision,
    thinking: m.thinking,
    tools: m.tools,
    prices: { inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok },
    serverFallback: m.serverFallback,
  };
}

/** A model an admin added from Ollama or a local server, as a config entry. */
function extraAsConfig(m: ModelOverrides['extraModels'][number]): ChatEntry {
  const custom = m.engine.startsWith('custom:');
  return {
    engine: m.engine,
    customVision: m.vision,
    customTools: m.tools,
    id: m.id,
    label: { en: m.label, de: m.label },
    details: custom
      ? { en: m.engineModel, de: m.engineModel }
      : {
          en: `${m.engineModel} · ${m.memoryGiB.toFixed(0)} GB`,
          de: `${m.engineModel} · ${m.memoryGiB.toFixed(0)} GB`,
        },
    ollamaModel: m.engineModel,
    contextTokens: 16384,
    historyBudgetTokens: 12000,
    think: !custom,
    unloadAfterUse: false,
    memoryGiB: custom ? 0 : m.memoryGiB,
    enabled: true,
    adultOnly: false,
  };
}

export function createModelRegistry(options: RegistryOptions): ModelRegistry {
  const { models, llm } = options;
  const cacheMs = options.cacheMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  /** null = not installed. */
  const cache = new Map<string, { value: ModelCapabilities | null; at: number }>();

  const overrides = () => options.overrides?.() ?? NO_OVERRIDES;
  /** Config models plus the ones an admin added. */
  const allChat = (): ChatEntry[] => [
    ...models.chatModels,
    ...overrides()
      .extraModels.filter((x) => !models.chatModels.some((m) => m.id === x.id))
      .map(extraAsConfig),
  ];
  const isOn = (m: { id: string; enabled: boolean }) =>
    m.enabled && !overrides().disabled.includes(m.id);
  const usable = (m: ChatModelConfig, viewer: ModelViewer) =>
    isOn(m) && !(m.adultOnly && viewer.restricted);
  /** The admin's family switch allows cloud models for this user (with their own key). */
  const cloudAllowed = (viewer: ModelViewer): boolean => {
    const mode = overrides().cloud;
    if (viewer.userId === undefined || !options.cloudKeys) return false;
    return mode === 'all' || (mode === 'adults' && !viewer.restricted);
  };
  /** Cloud models this user may use now: allowed by the admin, key present, switched on. */
  const cloudFor = (viewer: ModelViewer): CloudModelConfig[] => {
    if (viewer.userId === undefined || !options.cloudKeys || !cloudAllowed(viewer)) return [];
    const keys = options.cloudKeys(viewer.userId);
    return models.cloudModels.filter(
      (m) => keys.has(m.provider) && isOn(m) && !(m.adultOnly && viewer.restricted),
    );
  };
  const familyDefaultChat = (): string | null => {
    const on = allChat().filter((m) => isOn(m));
    for (const id of [overrides().defaultChatModel, models.defaultChatModel]) {
      if (id !== null && on.some((m) => m.id === id)) return id;
    }
    return on[0]?.id ?? null;
  };
  /** For users: off by the admin or not possible here. The admin's choice stays as it is. */
  const imagesOff = () => overrides().imagesOff || options.imagesAvailable?.() === false;
  const familyDefaultImage = (): string | null => {
    const o = overrides();
    if (o.imagesOff) return null;
    const id = o.defaultImageModel ?? models.defaultImageModel;
    return id && models.imageModels.some((m) => m.id === id && isOn(m)) ? id : null;
  };

  async function capabilities(m: ChatModelConfig): Promise<ModelCapabilities | null> {
    const cached = cache.get(m.ollamaModel);
    if (cached && now() - cached.at < cacheMs) return cached.value;
    try {
      const value = await llm.capabilities(m.ollamaModel);
      cache.set(m.ollamaModel, { value, at: now() });
      return value;
    } catch (err) {
      if (err instanceof LlmError && err.code === 'model_not_found') {
        cache.set(m.ollamaModel, { value: null, at: now() });
        return null;
      }
      // Engine down: best guess, not cached.
      return { vision: false, thinking: m.think !== false, tools: false };
    }
  }

  /** The local server of a custom model, if it still exists. */
  const customEngineOf = (m: ChatEntry): string | null => {
    if (!m.engine?.startsWith('custom:')) return null;
    const id = m.engine.slice('custom:'.length);
    return (options.customEngines?.() ?? []).some((e) => e.id === id) ? id : null;
  };

  async function resolve(m: ChatEntry): Promise<ResolvedChatModel | null> {
    if (m.engine?.startsWith('custom:')) {
      const engineId = customEngineOf(m);
      if (engineId === null) return null;
      const { engine: _e, customVision, customTools, ...config } = m;
      // The server can't be asked: the admin said what it can do when adding it.
      return {
        ...config,
        engine: 'custom',
        customEngineId: engineId,
        vision: customVision ?? false,
        thinking: false,
        tools: customTools ?? false,
      };
    }
    const caps = await capabilities(m);
    // Thinking needs both the engine's capability and a config that allows it.
    return caps
      ? {
          ...m,
          engine: 'ollama',
          vision: caps.vision,
          thinking: caps.thinking && m.think !== false,
          tools: caps.tools,
        }
      : null;
  }

  return {
    async list(viewer): Promise<ModelsResponse> {
      const resolved = await Promise.all(
        allChat()
          .filter((m) => usable(m, viewer))
          .map((m) => resolve(m)),
      );
      const chatModels: ChatModelInfo[] = resolved
        .filter((m): m is ResolvedChatModel => m !== null)
        .concat(cloudFor(viewer).map(cloudAsResolved))
        .map((m) => ({
          id: m.id,
          label: m.label,
          description: m.description ?? null,
          engineModel: m.ollamaModel,
          details: m.details ?? null,
          vision: m.vision,
          thinking: m.thinking,
          maxMessageChars: maxMessageChars(m.contextTokens),
          cloud: isCloud(m),
          provider: isCloud(m) ? m.engine : null,
        }));
      const imageModels =
        viewer.restricted || imagesOff()
          ? []
          : models.imageModels.filter((m) => isOn(m)).map((m) => ({ id: m.id, label: m.label }));
      const wanted = familyDefaultChat();
      // The family default is always a local model; a cloud model only when there is no
      // local one this user may use.
      const defaultChatModel = chatModels.some((m) => m.id === wanted)
        ? wanted
        : (chatModels.find((m) => !m.cloud)?.id ?? chatModels[0]?.id ?? null);
      const wantedImage = imagesOff() ? null : familyDefaultImage();
      const defaultImageModel = imageModels.some((m) => m.id === wantedImage) ? wantedImage : null;
      return {
        chatModels,
        imageModels,
        defaultChatModel,
        defaultImageModel,
        paused: overrides().paused,
        // Filled in by the route, which knows what the engine has loaded.
        loaded: [],
        cloudAllowed: cloudAllowed(viewer) && models.cloudModels.length > 0,
      };
    },

    async chatModel(id, viewer) {
      const cloud = cloudFor(viewer).find((x) => x.id === id);
      if (cloud) return cloudAsResolved(cloud);
      const m = allChat().find((x) => x.id === id);
      if (!m || !usable(m, viewer)) return null;
      return resolve(m);
    },

    imageModel(id, viewer) {
      if (viewer.restricted || imagesOff()) return null;
      return models.imageModels.find((m) => m.id === id && isOn(m)) ?? null;
    },

    defaultChatModelId: familyDefaultChat,

    async adminList(): Promise<AdminModelsResponse> {
      const extraIds = new Set(overrides().extraModels.map((x) => x.id));
      const chat = await Promise.all(
        allChat().map(async (m) => ({
          id: m.id,
          label: m.label,
          kind: 'chat' as const,
          available: m.enabled,
          enabled: isOn(m),
          installed: m.engine?.startsWith('custom:')
            ? customEngineOf(m) !== null
            : (await capabilities(m)) !== null,
          custom: extraIds.has(m.id),
          cloud: false,
        })),
      );
      const cloud = models.cloudModels.map((m) => ({
        id: m.id,
        label: m.label,
        kind: 'chat' as const,
        available: m.enabled,
        enabled: isOn(m),
        installed: true,
        custom: false,
        cloud: true,
      }));
      const image = models.imageModels.map((m) => ({
        id: m.id,
        label: m.label,
        kind: 'image' as const,
        available: m.enabled,
        enabled: isOn(m) && !overrides().imagesOff,
        installed: true,
        custom: false,
        cloud: false,
      }));
      const offered = new Set(
        allChat()
          .filter((m) => !m.engine?.startsWith('custom:'))
          .map((m) => m.ollamaModel),
      );
      const installed = options.llm.installed ? await options.llm.installed().catch(() => []) : [];
      const installedNotOffered: InstalledModel[] = installed
        .filter((m) => !offered.has(m.model) && !m.model.endsWith('-dev:latest'))
        .map((m) => ({
          engineModel: m.model,
          sizeGiB: Math.round(m.sizeGiB * 10) / 10,
          engine: 'ollama',
          engineLabel: null,
        }));
      const offeredCustom = new Set(
        allChat()
          .filter((m) => m.engine?.startsWith('custom:'))
          .map((m) => `${m.engine ?? ''}\u0000${m.ollamaModel}`),
      );
      for (const e of options.customModels ? await options.customModels().catch(() => []) : []) {
        for (const model of e.models) {
          if (offeredCustom.has(`custom:${e.engineId}\u0000${model}`)) continue;
          installedNotOffered.push({
            engineModel: model,
            sizeGiB: 0,
            engine: `custom:${e.engineId}`,
            engineLabel: e.engineLabel,
          });
        }
      }
      return {
        models: [...chat, ...cloud, ...image],
        installedNotOffered,
        defaultChatModel: familyDefaultChat(),
        defaultImageModel: familyDefaultImage(),
        webSearch: overrides().webSearch,
        cloud: overrides().cloud,
      };
    },
  };
}
