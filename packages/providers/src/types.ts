/**
 * Shared types for chat engines and cloud clients (fetch-only; used by the hub server and the
 * phone app). Owned by Claude. Nothing here may log message content.
 */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Base64-encoded JPEG/PNG images (no data: prefix), for vision models. */
  images?: string[];
  /** Assistant turns: the tools the model called (sent back so it sees its own calls). */
  toolCalls?: { id?: string; name: string; arguments: unknown }[];
  /** Tool turns: which tool this result belongs to. */
  toolName?: string;
  /** Tool turns: the id of the call this answers (cloud engines match results by id). */
  toolCallId?: string;
  /**
   * Assistant turns within one reply: the engine's own output for this round (from its
   * `done` chunk), sent back unchanged in the next round. Cloud engines need it (thinking
   * blocks, reasoning items); content and toolCalls then only fill in what it lacks.
   */
  replay?: unknown;
}

export type ThinkLevel = boolean | 'low' | 'medium' | 'high';

/** A function the model may call (JSON-schema parameters). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  /** Engine model name, e.g. 'gemma4:26b'. */
  model: string;
  messages: ChatTurn[];
  think: ThinkLevel;
  /** Context window (num_ctx). */
  contextTokens: number;
  /** Upper bound on generated tokens (num_predict). */
  maxOutputTokens: number;
  /** How long the engine keeps the model loaded afterwards: seconds, or 0 to unload now. */
  keepAliveSeconds: number;
  /** Tools offered to the model (only for models with tool support). */
  tools?: ToolSpec[];
  /** Answer as JSON matching this JSON schema (structured output). */
  format?: Record<string, unknown>;
  signal: AbortSignal;
}

export type ChatChunk =
  | { type: 'thinking'; text: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id?: string; name: string; arguments: unknown }
  | {
      type: 'done';
      promptTokens: number;
      outputTokens: number;
      /** Time spent loading the model for this request, ms (0 if it was loaded). */
      loadMs: number;
      /** Engine output to send back with the next round (see ChatTurn.replay). */
      replay?: unknown;
    };

export type LlmErrorCode =
  /** The engine isn't running or can't be reached. */
  | 'unavailable'
  /** The model isn't installed. */
  | 'model_not_found'
  /** The engine answered with an error or something unparseable. */
  | 'bad_response'
  /** The model can't do what the request asks (Ollama MLX models: no structured output). */
  | 'unsupported'
  /** The engine can't run this model at all (e.g. an architecture this Ollama doesn't know). */
  | 'model_unsupported'
  /** The model needs more memory than this computer has for models (Ollama refuses to load it). */
  | 'model_too_large'
  /** The request's signal was aborted. */
  | 'aborted'
  /** Cloud: the API key is missing, wrong, revoked or has no access to the model. */
  | 'auth'
  /** Cloud: rate limit or quota of this key reached. */
  | 'rate_limited'
  /** Cloud: the provider is overloaded or failing; try again later. */
  | 'overloaded'
  /** Cloud: the model declined to answer (provider safety rules). */
  | 'refused';

export class LlmError extends Error {
  override name = 'LlmError';
  readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Cloud providers kchat can call (each with the user's own key). */
export type CloudProvider = 'anthropic' | 'openai' | 'openrouter';

/** A chat request to a cloud model: no memory or context settings, plus the user's key. */
export interface CloudChatRequest extends Omit<ChatRequest, 'keepAliveSeconds' | 'contextTokens'> {
  apiKey: string;
  /** Anthropic: let the API answer with another model when this one declines. */
  serverFallback?: boolean;
}

/**
 * A cloud model engine (llm/anthropic.ts, llm/openai.ts). Owned by Claude: it sends chat
 * content out of the house. Never logs content, keys or provider error bodies.
 */
export interface CloudClient {
  readonly provider: CloudProvider;
  /** Streams a chat reply. Throws LlmError; never includes content in error messages. */
  chat(request: CloudChatRequest): AsyncIterable<ChatChunk>;
  /** Checks a key with a request that sends no content. Resolves true if it works. */
  checkKey(apiKey: string, signal: AbortSignal): Promise<boolean>;
}
