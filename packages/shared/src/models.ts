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
});
export type CatalogItem = z.infer<typeof CatalogItem>;

export const CatalogResponse = z.object({
  memoryGiB: z.number(),
  entries: z.array(CatalogItem),
});
export type CatalogResponse = z.infer<typeof CatalogResponse>;

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
