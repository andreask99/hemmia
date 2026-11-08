import { z } from 'zod';

/**
 * GET /api/admin/system: what the Mac and kchat are doing right now. Counts and sizes
 * only: never content, chat titles or who is asking.
 */
export const SystemStatus = z.object({
  at: z.number().int(),
  mac: z.object({
    totalBytes: z.number(),
    /** Memory in use (from macOS memory pressure), bytes. */
    usedBytes: z.number(),
    swapUsedBytes: z.number(),
    swapTotalBytes: z.number(),
    /** 1-minute load average divided by CPU cores (1 = all cores busy). */
    cpuLoad: z.number(),
    cpus: z.number().int(),
  }),
  models: z.array(
    z.object({
      engine: z.enum(['ollama', 'imagegen']),
      model: z.string(),
      memoryBytes: z.number(),
      /** A kchat model (false: something else, e.g. a coding model used by local-dev). */
      kchat: z.boolean(),
      /** When Ollama unloads it (ms epoch), if known. */
      unloadsAt: z.number().nullable(),
    }),
  ),
  activity: z.object({
    running: z
      .object({
        kind: z.enum(['chat', 'image']),
        model: z.string(),
        startedAt: z.number(),
      })
      .nullable(),
    queued: z.number().int(),
    paused: z.boolean(),
  }),
  services: z.object({
    ollama: z.boolean(),
    searxng: z.boolean(),
    /** The image worker process holds a model (it exits when idle). */
    imageWorker: z.enum(['busy', 'idle']),
  }),
  /** Bytes on disk; null while still being measured. */
  disk: z.object({
    data: z.number().nullable(),
    imageModels: z.number().nullable(),
    chatModels: z.number().nullable(),
  }),
  /** The last monthly maintenance run (scripts/maintenance.ts), if any. */
  /** This Mac is kept awake while the hub must be reachable (P6.3). */
  keepAwake: z.boolean().default(false),
  /** A newer release of the public app (packaged builds; SECURITY.md §6.5). */
  /** From the signed update manifest (P6.7): a newer release, and whether this one is unsafe. */
  update: z
    .object({
      version: z.string().nullable(),
      url: z.string().nullable(),
      major: z.boolean(),
      belowMinimum: z.boolean(),
    })
    .nullable()
    .default(null),
  maintenance: z
    .object({
      at: z.number(),
      ok: z.boolean(),
      /** 'nothing-to-do' | 'updated' | 'rolled-back' | 'skipped-busy' | 'failed' */
      outcome: z.string(),
      steps: z.array(z.object({ component: z.string(), from: z.string(), to: z.string() })),
      /** An update held back on purpose, e.g. "Ollama 0.40.0 (#18620)". */
      held: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  last24h: z.object({
    replies: z.number().int(),
    pictures: z.number().int(),
    searches: z.number().int(),
    activeUsers: z.number().int(),
  }),
});
export type SystemStatus = z.infer<typeof SystemStatus>;

/**
 * GET /api/admin/ollama: whether Hemmia can install Ollama here, and how far it is.
 * external: another Ollama answers (used as it is) · managed: Hemmia's Ollama runs ·
 * starting: Hemmia's Ollama is installed but not answering yet · missing: none, can install ·
 * installing: downloading/unpacking · failed: the last install failed · unsupported: not here.
 */
export const OllamaSetupStatus = z.object({
  state: z.enum([
    'external',
    'managed',
    'starting',
    'missing',
    'installing',
    'failed',
    'unsupported',
  ]),
  version: z.string().nullable(),
  received: z.number().int().optional(),
  total: z.number().int().nullable().optional(),
  error: z.enum(['download', 'checksum', 'signature']).optional(),
});
export type OllamaSetupStatus = z.infer<typeof OllamaSetupStatus>;

/**
 * GET /api/admin/pictures: whether Hemmia can set up pictures here, and how far it is.
 * off: possible, not set up (downloadBytes: the model) · installing: tool, engine or model ·
 * ready · failed · unsupported: not a Mac with Apple silicon, Docker, or too little memory.
 */
export const PicturesSetupStatus = z.object({
  state: z.enum(['off', 'installing', 'ready', 'failed', 'unsupported']),
  phase: z.enum(['tool', 'engine', 'model']).optional(),
  received: z.number().int().optional(),
  total: z.number().int().nullable().optional(),
  downloadBytes: z.number().int().optional(),
  reason: z.enum(['platform', 'memory']).optional(),
  error: z.enum(['download', 'checksum', 'engine']).optional(),
});
export type PicturesSetupStatus = z.infer<typeof PicturesSetupStatus>;

/**
 * GET /api/admin/search-setup: web search set up by Hemmia on a Mac. ready: a SearXNG answers
 * (Hemmia's or another) · starting · off: possible · installing · failed · unsupported.
 */
export const SearchSetupStatus = z.object({
  state: z.enum(['off', 'installing', 'starting', 'ready', 'failed', 'unsupported']),
  phase: z.enum(['tool', 'engine']).optional(),
  error: z.enum(['download', 'checksum', 'engine']).optional(),
});
export type SearchSetupStatus = z.infer<typeof SearchSetupStatus>;

/** GET /api/capabilities: what this computer can do (signed-in users). */
export const SystemCapabilities = z.object({
  platform: z.string(),
  arch: z.string(),
  memoryGiB: z.number(),
  diskFreeGiB: z.number().nullable(),
  ollama: z.object({ reachable: z.boolean(), version: z.string().nullable() }),
  /** Picture generation (mflux): Apple silicon with uv and the image worker installed. */
  images: z.boolean(),
  /** Web search (SearXNG) answers. Reading linked pages works without it. */
  webSearch: z.boolean(),
});
export type SystemCapabilities = z.infer<typeof SystemCapabilities>;
