import { z } from 'zod';
import { LocalizedText } from './chat.ts';

/** GET /api/admin/catalog: models the admin can download into Ollama (P1.9). */
export const CatalogItem = z.object({
  ollamaModel: z.string(),
  label: LocalizedText,
  description: LocalizedText,
  downloadGiB: z.number(),
  memoryGiB: z.number(),
  minTotalMemoryGiB: z.number(),
  vision: z.boolean(),
  tools: z.boolean(),
  /** Runs well on this computer (enough total memory). */
  fits: z.boolean(),
  /** The one to pick for this computer's memory. */
  recommended: z.boolean(),
  /** Already downloaded into Ollama. */
  installed: z.boolean(),
  think: z.boolean(),
  contextTokens: z.number(),
  /** Joined the catalogue in the last 30 days (P11.5). */
  isNew: z.boolean(),
  /** 1 = most pulled on Ollama among the catalogue's models; null for bundled-only entries. */
  popularRank: z.number().nullable(),
  /** When Ollama last updated it (YYYY-MM-DD), if known. */
  releasedAt: z.string().nullable(),
  /** The family is offered it now (in the model picker). */
  inUse: z.boolean(),
});
export type CatalogItem = z.infer<typeof CatalogItem>;

export const CatalogResponse = z.object({
  memoryGiB: z.number(),
  entries: z.array(CatalogItem),
});
export type CatalogResponse = z.infer<typeof CatalogResponse>;

const OllamaName = z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,80}(:[a-z0-9._-]{1,40})?$/);

/** GET /api/admin/models/updates (P11.5, P11.7): new versions of the models the family uses. */
export const ModelUpdateItem = z.object({
  key: z.string(),
  /** The Ollama model in use now. */
  from: z.string(),
  /** The one to download (the same tag when Ollama re-published its weights). */
  to: z.string(),
  kind: z.enum(['version', 'weights']),
  label: LocalizedText,
  downloadGiB: z.number(),
  /** Already downloaded: only the switch is left. */
  installed: z.boolean(),
});
export type ModelUpdateItem = z.infer<typeof ModelUpdateItem>;

export const ModelUpdatesResponse = z.object({
  updates: z.array(ModelUpdateItem),
  /** An admin hasn't opened Settings → Models since a new update was announced. */
  unseen: z.boolean(),
  /** The admin's switch "Look for new models". */
  catalogCheck: z.boolean(),
});
export type ModelUpdatesResponse = z.infer<typeof ModelUpdatesResponse>;

/** POST /api/admin/models/updates/dismiss: "Later". */
export const DismissUpdateRequest = z.object({ key: z.string().min(1).max(300) }).strict();
export type DismissUpdateRequest = z.infer<typeof DismissUpdateRequest>;

/** PUT /api/admin/models/catalog-check: the switch "Look for new models". */
export const CatalogCheckRequest = z.object({ on: z.boolean() }).strict();
export type CatalogCheckRequest = z.infer<typeof CatalogCheckRequest>;

/** GET /api/admin/models/installed: what is on disk in Ollama (P11.6). */
export const InstalledModelsResponse = z.object({
  diskFreeGiB: z.number().nullable(),
  models: z.array(
    z.object({
      model: z.string(),
      sizeGiB: z.number(),
      /** The model id the family is offered it under, or null. */
      offeredId: z.string().nullable(),
    }),
  ),
});
export type InstalledModelsResponse = z.infer<typeof InstalledModelsResponse>;

/** POST /api/admin/models/replace: move everything from one model to another (downloaded). */
export const ReplaceModelRequest = z.object({ from: OllamaName, to: OllamaName }).strict();
export type ReplaceModelRequest = z.infer<typeof ReplaceModelRequest>;
export const ReplaceModelResponse = z.object({ modelId: z.string(), moved: z.number() });
export type ReplaceModelResponse = z.infer<typeof ReplaceModelResponse>;

/** POST /api/admin/models/remove: delete a model from Ollama and from the family's models. */
export const RemoveModelRequest = z.object({ model: OllamaName }).strict();
export type RemoveModelRequest = z.infer<typeof RemoveModelRequest>;

/** POST /api/admin/models/pulls. Ollama model names, e.g. "gemma4:26b". */
export const StartPullRequest = z
  .object({ model: z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,80}(:[a-z0-9._-]{1,40})?$/) })
  .strict();
export type StartPullRequest = z.infer<typeof StartPullRequest>;

export const StartPullResponse = z.object({ pullId: z.string() });
export type StartPullResponse = z.infer<typeof StartPullResponse>;

/** Events on GET /api/admin/models/pulls/:id/events (SSE, event name = type). */
export const PullEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    /** Bytes so far and in total for the whole model, when Ollama has said. */
    completed: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
  z.object({ type: z.literal('done'), modelId: z.string() }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['not_found', 'disk_full', 'unavailable', 'cancelled', 'failed']),
  }),
]);
export type PullEvent = z.infer<typeof PullEvent>;
