/**
 * Contract for the model registry (implementation delegated: registry.ts).
 */
import type { AdminModelsResponse, ModelsResponse } from '@hemmia/shared';
import type { ChatModelConfig, ImageModelConfig } from '../config/schema.ts';
import type { CloudProvider } from '../llm/types.ts';

/**
 * A chat model from config/models.json plus live capabilities from the engine. Cloud models
 * (engine 'anthropic' or 'openai') carry their provider's model id in `ollamaModel` too, so
 * code that only knows local models keeps working, but must never reach Ollama: every
 * caller picks the engine by `engine`, never by the model name.
 */
export interface ResolvedChatModel extends ChatModelConfig {
  /**
   * Where the model runs: Ollama on this Mac, an admin-added local server ('custom', P1.7),
   * or a cloud provider with the user's key.
   */
  engine: 'ollama' | 'custom' | CloudProvider;
  /** engine 'custom': which local server (models/engines.ts). */
  customEngineId?: string;
  vision: boolean;
  thinking: boolean;
  /** Can call tools (needed to create pictures from the chat). */
  tools?: boolean;
  /** Cloud models: list prices in US dollars per million tokens. */
  prices?: { inputPerMTok: number; outputPerMTok: number };
  /** Cloud models (Anthropic): the API may answer with another model when this one declines. */
  serverFallback?: boolean;
}

/** True for models that send the chat to a cloud provider. */
export function isCloud(
  model: Pick<ResolvedChatModel, 'engine'>,
): model is ResolvedChatModel & { engine: CloudProvider } {
  return model.engine !== 'ollama' && model.engine !== 'custom';
}

export interface ModelViewer {
  restricted: boolean;
  /** Needed for cloud models: without it (or without a key) none are offered. */
  userId?: string;
}

export interface ModelRegistry {
  /** Models this user may use, for GET /api/models. */
  list(viewer: ModelViewer): Promise<ModelsResponse>;
  /**
   * An enabled chat model this user may use, or null (unknown, disabled, adult-only for a
   * restricted account, or not installed in the engine).
   */
  chatModel(id: string, viewer: ModelViewer): Promise<ResolvedChatModel | null>;
  /** An enabled image model, or null. */
  imageModel(id: string, viewer: ModelViewer): ImageModelConfig | null;
  /**
   * The family default: the admin's choice, else the file's default, else the first enabled
   * local model; null when there is none (a new hub).
   */
  defaultChatModelId(): string | null;
  /** All configured models with their on/off state, for the admin screen. */
  adminList?(): Promise<AdminModelsResponse>;
}
