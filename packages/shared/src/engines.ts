import { z } from 'zod';

/**
 * Model engines on the hub (P1.7): Ollama, plus admin-added local servers that speak the
 * OpenAI Chat Completions protocol (LM Studio, llama.cpp, vLLM), on this computer or the home
 * network only.
 */

/** "ollama", or "custom:<id>" for an admin-added local server. */
export const EngineRef = z.string().regex(/^(ollama|custom:[a-z0-9]{8})$/);
export type EngineRef = z.infer<typeof EngineRef>;

export const CustomEngineInfo = z.object({
  id: z.string().regex(/^[a-z0-9]{8}$/),
  label: z.string(),
  baseUrl: z.string(),
  reachable: z.boolean(),
  /** Model ids the server offers (GET <base>/models), empty when unreachable. */
  models: z.array(z.string()),
});
export type CustomEngineInfo = z.infer<typeof CustomEngineInfo>;

/** GET /api/admin/engines. */
export const AdminEnginesResponse = z.object({
  ollama: z.object({ url: z.string(), reachable: z.boolean(), version: z.string().nullable() }),
  custom: z.array(CustomEngineInfo),
});
export type AdminEnginesResponse = z.infer<typeof AdminEnginesResponse>;

/** POST /api/admin/engines/custom. */
export const AddCustomEngineRequest = z
  .object({
    label: z.string().trim().min(1).max(40),
    baseUrl: z.string().trim().min(8).max(200),
  })
  .strict();
export type AddCustomEngineRequest = z.infer<typeof AddCustomEngineRequest>;

/** At most this many custom servers. */
export const MAX_CUSTOM_ENGINES = 5;
