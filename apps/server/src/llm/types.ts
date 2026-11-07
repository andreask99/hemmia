/**
 * Contract for chat model engines. Owned by Claude; implementations (e.g. ollama.ts) are
 * delegated. Nothing here may log message content. The shared parts live in
 * @hemmia/providers (they also run in the phone app).
 */
import type { ChatChunk, ChatRequest } from '@hemmia/providers';

export * from '@hemmia/providers/types';

export interface ModelCapabilities {
  vision: boolean;
  thinking: boolean;
  tools: boolean;
}

export interface LlmClient {
  /** Streams a chat reply. Throws LlmError; never includes content in error messages. */
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  /** Models currently loaded, with their resident size in GiB. */
  loaded(): Promise<{ model: string; memoryGiB: number }[]>;
  /** Unloads a model now. Resolves even if it wasn't loaded. */
  unload(model: string): Promise<void>;
  /** Capabilities of an installed model; throws LlmError('model_not_found') if missing. */
  capabilities(model: string): Promise<ModelCapabilities>;
  /**
   * Loads a model briefly to see whether the engine can run it; throws
   * LlmError('model_unsupported') when it can't. Optional: test fakes leave it out.
   */
  check?(model: string, signal: AbortSignal): Promise<void>;
  /** Models installed in the engine (on disk), with their download size in GiB. */
  installed(): Promise<{ model: string; sizeGiB: number }[]>;
  /**
   * Downloads a model (Ollama /api/pull), reporting progress for the whole model. Throws
   * LlmError ('model_not_found' for an unknown name). Optional: test fakes leave it out.
   */
  pull?(model: string, signal: AbortSignal): AsyncIterable<PullProgress>;
}

export interface PullProgress {
  status: string;
  /** Bytes so far and in total over all layers seen so far. */
  completed: number;
  total: number;
}
