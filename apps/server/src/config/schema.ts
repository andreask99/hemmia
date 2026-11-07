import { z } from 'zod';

/**
 * Environment variables read by the server. All optional; defaults suit local development.
 * Contract owned by Claude; see docs/ARCHITECTURE.md.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /**
   * Interface to bind. Loopback: Tailscale serve and the relay client forward to it.
   * '0.0.0.0' only inside a container (HEMMIA_CONTAINER=1), whose port is mapped to the
   * host's loopback.
   */
  HEMMIA_HOST: z.enum(['127.0.0.1', '::1', '0.0.0.0']).default('127.0.0.1'),
  HEMMIA_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  /** Absolute path. Default: ~/Library/Application Support/Hemmia (or the older …/kchat if only that exists) */
  HEMMIA_DATA_DIR: z.string().startsWith('/').optional(),
  /**
   * Comma-separated hostnames the server answers to besides localhost,
   * e.g. "hub.tail1234.ts.net". Empty means localhost only.
   */
  HEMMIA_PUBLIC_HOSTNAMES: z.string().default(''),
  OLLAMA_URL: z.url().default('http://127.0.0.1:11434'),
  /** SearXNG on this Mac (web search tool); see ops/searxng/. */
  HEMMIA_SEARXNG_URL: z.url().default('http://127.0.0.1:8888'),
  HEMMIA_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
  /** Path to the models registry. Default: <repo>/config/models.json */
  HEMMIA_MODELS_FILE: z.string().optional(),
  /** Running in a container: data dir /data, may bind 0.0.0.0, no trusted proxy. */
  HEMMIA_CONTAINER: z.enum(['0', '1']).default('0'),
  /** Check GitHub once a day for a newer release (packaged builds). */
  HEMMIA_UPDATE_CHECK: z.enum(['0', '1']).default('0'),
  /** Turn on remote access through the relay at start (headless machines). */
  HEMMIA_CONNECT: z.enum(['0', '1']).default('0'),
  /** The relay's domain, e.g. "relay.example"; remote access is unavailable without it. */
  HEMMIA_RELAY_DOMAIN: z
    .string()
    .regex(
      /^(?=.{1,200}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
    )
    .optional(),
  /**
   * Development and tests: connect to the relay at this host:port instead of the addresses DNS
   * gives for api./tunnel.<relay-domain> (TLS names stay the same).
   */
  HEMMIA_RELAY_ADDRESS: z
    .string()
    .regex(/^[a-z0-9.-]{1,200}:\d{1,5}$/)
    .optional(),
  /** Development and tests: a PEM file with a CA to trust for the relay (besides the system's). */
  HEMMIA_RELAY_CA: z.string().startsWith('/').optional(),
  /** The apps' bundle id, which the relay checks for push (until the final id: the dev id). */
  HEMMIA_APP_ID: z
    .string()
    .regex(/^[A-Za-z0-9.-]{3,200}$/)
    .default('app.hemmia'),
});
export type Env = z.infer<typeof EnvSchema>;

/** One chat model entry in config/models.json. */
export const ChatModelConfig = z.object({
  /** Stable id used in the API and database, e.g. "quick". */
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  /** Friendly label per UI language. */
  label: z.object({ en: z.string().min(1), de: z.string().min(1) }),
  description: z.object({ en: z.string(), de: z.string() }).optional(),
  /** Size and speed facts shown in the model picker. */
  details: z.object({ en: z.string(), de: z.string() }).optional(),
  /** Ollama model tag, e.g. "qwen3-vl:8b". */
  ollamaModel: z.string().min(1),
  /** Context window to request (num_ctx). */
  contextTokens: z.number().int().min(2048).max(262144).default(16384),
  /** Token budget for chat history sent to the model. */
  historyBudgetTokens: z.number().int().min(1024).default(12000),
  /** Thinking level for reasoning models; false disables thinking. */
  think: z.union([z.boolean(), z.enum(['low', 'medium', 'high'])]).default(false),
  /** Unload right after use (MLX models leak memory in Ollama 0.35). */
  unloadAfterUse: z.boolean().default(false),
  /** Approximate resident memory in GiB, for the scheduler's memory planning. */
  memoryGiB: z.number().positive(),
  enabled: z.boolean().default(true),
  /** Hidden from restricted (teen) accounts. */
  adultOnly: z.boolean().default(false),
});
export type ChatModelConfig = z.infer<typeof ChatModelConfig>;

/** The image model entry in config/models.json (mflux). */
export const ImageModelConfig = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: z.object({ en: z.string().min(1), de: z.string().min(1) }),
  /** mflux model name, e.g. "z-image-turbo". */
  mfluxModel: z.string().min(1),
  /** Quantization bits passed to mflux (e.g. 4 or 8); omit for full precision. */
  quantize: z
    .union([z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(8)])
    .optional(),
  steps: z.number().int().min(1).max(50),
  width: z.number().int().min(256).max(2048).multipleOf(16).default(1024),
  height: z.number().int().min(256).max(2048).multipleOf(16).default(1024),
  memoryGiB: z.number().positive(),
  enabled: z.boolean().default(true),
  /** Renders readable text well (chosen when a picture needs words). */
  goodAtText: z.boolean().default(false),
});
export type ImageModelConfig = z.infer<typeof ImageModelConfig>;

/**
 * A cloud chat model (Claude, OpenAI) in config/models.json. Used only with the user's own
 * API key for its provider; capabilities and list prices are declared here because there is
 * no engine to ask.
 */
export const CloudModelConfig = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: z.object({ en: z.string().min(1), de: z.string().min(1) }),
  description: z.object({ en: z.string(), de: z.string() }).optional(),
  details: z.object({ en: z.string(), de: z.string() }).optional(),
  provider: z.enum(['anthropic', 'openai', 'openrouter']),
  /** The provider's model id, e.g. "claude-sonnet-5-5" or "google/gemma-4-26b-a4b-it". */
  providerModel: z.string().regex(/^[A-Za-z0-9._:/-]{1,100}$/),
  /** Context window; also bounds the longest message (maxMessageChars). */
  contextTokens: z.number().int().min(8192).max(2_000_000),
  /** Token budget for chat history sent with each message (cost grows with it). */
  historyBudgetTokens: z.number().int().min(1024),
  vision: z.boolean(),
  /** Reasoning effort follows the chat's "think harder" switch. */
  thinking: z.boolean(),
  tools: z.boolean(),
  /** US dollars per million tokens (list price), for the spending estimate and cap. */
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
  /** Anthropic: let the API answer with another model when this one declines (fallbacks). */
  serverFallback: z.boolean().default(false),
  enabled: z.boolean().default(true),
  adultOnly: z.boolean().default(false),
});
export type CloudModelConfig = z.infer<typeof CloudModelConfig>;

export const ModelsFile = z
  .object({
    /** May be empty: a public hub starts without models and the admin adds them. */
    chatModels: z.array(ChatModelConfig),
    /** Cloud models; offered only to users with an API key for the provider. */
    cloudModels: z.array(CloudModelConfig).default([]),
    imageModels: z.array(ImageModelConfig),
    /** Id of the default chat model (enabled, in chatModels), or null to pick the first usable. */
    defaultChatModel: z.string().nullable(),
    /** Id of the default image model, or null if image generation is off. */
    defaultImageModel: z.string().nullable(),
  })
  .superRefine((file, ctx) => {
    const chatIds = new Set<string>();
    for (const m of [...file.chatModels, ...file.cloudModels]) {
      if (chatIds.has(m.id))
        ctx.addIssue({ code: 'custom', message: `duplicate chat model id: ${m.id}` });
      chatIds.add(m.id);
    }
    const imageIds = new Set<string>();
    for (const m of file.imageModels) {
      if (imageIds.has(m.id))
        ctx.addIssue({ code: 'custom', message: `duplicate image model id: ${m.id}` });
      imageIds.add(m.id);
    }
    if (file.defaultChatModel !== null) {
      const def = file.chatModels.find((m) => m.id === file.defaultChatModel);
      if (!def?.enabled) {
        ctx.addIssue({
          code: 'custom',
          message: 'defaultChatModel must name an enabled chat model',
        });
      }
    }
    if (file.defaultImageModel !== null) {
      const img = file.imageModels.find((m) => m.id === file.defaultImageModel);
      if (!img?.enabled) {
        ctx.addIssue({
          code: 'custom',
          message: 'defaultImageModel must name an enabled image model',
        });
      }
    }
  });
export type ModelsFile = z.infer<typeof ModelsFile>;

/** A model the admin can download (config/catalog.json, P1.9). */
export const CatalogEntry = z.object({
  ollamaModel: z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,80}(:[a-z0-9._-]{1,40})?$/),
  label: z.object({ en: z.string().min(1), de: z.string().min(1) }),
  description: z.object({ en: z.string(), de: z.string() }),
  downloadGiB: z.number().positive(),
  /** Approximate resident memory while loaded. */
  memoryGiB: z.number().positive(),
  /** Smallest total memory of a computer it runs on well. */
  minTotalMemoryGiB: z.number().positive(),
  vision: z.boolean(),
  tools: z.boolean(),
  think: z.boolean(),
  contextTokens: z.number().int().min(2048).max(262144),
  /** The recommended model for computers with this much total memory. */
  recommendedFor: z.object({ minGiB: z.number(), maxGiB: z.number().nullable() }).optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntry>;
export const CatalogFile = z.object({ entries: z.array(CatalogEntry) });

/** Validated, resolved server configuration passed to buildApp(). */
export interface Config {
  env: Env['NODE_ENV'];
  host: Env['HEMMIA_HOST'];
  port: number;
  /** Absolute path of the data directory (database and blobs). */
  dataDir: string;
  /** Lower-cased hostnames accepted in the Host header, always including localhost forms. */
  allowedHosts: readonly string[];
  ollamaUrl: string;
  searxngUrl: string;
  logLevel: NonNullable<Env['HEMMIA_LOG_LEVEL']>;
  models: ModelsFile;
  /** Models the admin can download (config/catalog.json); empty when the file is missing. */
  catalog: CatalogEntry[];
  /** Running in a container (HEMMIA_CONTAINER=1). */
  container: boolean;
  /** Daily signed update manifest from the relay (HEMMIA_UPDATE_CHECK=1, P6.7). */
  updateCheck: boolean;
  /** Turn remote access on at start (HEMMIA_CONNECT=1). */
  connectOnStart: boolean;
  /** Relay domain, or null when remote access through a relay is unavailable. */
  relayDomain: string | null;
  /** Development: where to connect for the relay, and an extra CA to trust. */
  relayAddress: { host: string; port: number } | null;
  relayCa: string | null;
  /** The native apps' bundle id (push through the relay). */
  appId: string;
}

/**
 * Pino redaction paths. Belt and braces: request bodies are never logged in the first
 * place, but if an object carrying these fields reaches a log call, they are censored.
 * Owned by Claude; do not remove entries.
 */
export const LOG_REDACT_PATHS: readonly string[] = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'currentPassword',
  'recoveryCode',
  'inviteCode',
  'token',
  'content',
  'prompt',
  'title',
  'text',
  'images',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.recoveryCode',
  '*.inviteCode',
  '*.token',
  '*.content',
  '*.prompt',
  '*.title',
  '*.text',
  '*.images',
  '*.messages',
  'body',
  '*.body',
  'key',
  '*.key',
  'apiKey',
  '*.apiKey',
  'req.headers["x-api-key"]',
  // Public edition (docs/public/SECURITY.md §8): setup and link codes, CSRs, push handles and refs.
  'setupCode',
  'code',
  'csr',
  'handle',
  'ref',
  '*.setupCode',
  '*.code',
  '*.csr',
  '*.handle',
  '*.ref',
];
