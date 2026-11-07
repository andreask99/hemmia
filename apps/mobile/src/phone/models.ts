/**
 * The cloud models phone mode offers (PHONE-MODE.md §2): `cloudModels` from config/models.json,
 * bundled at build time, Anthropic and OpenAI only. Only models whose provider has a key are shown.
 */
import { z } from 'zod';
import config from '../../../../config/models.json';
import type { Provider } from './keys.ts';

const Text = z.object({ en: z.string(), de: z.string() });

export const PhoneModel = z.object({
  id: z.string(),
  label: Text,
  description: Text,
  provider: z.enum(['anthropic', 'openai']),
  providerModel: z.string(),
  historyBudgetTokens: z.number().int().positive(),
  vision: z.boolean(),
  thinking: z.boolean(),
});
export type PhoneModel = z.infer<typeof PhoneModel>;

/** Bundled models; entries of other providers (OpenRouter) are left out. */
export const PHONE_MODELS: readonly PhoneModel[] = config.cloudModels.flatMap((m) => {
  const parsed = PhoneModel.safeParse(m);
  return parsed.success ? [parsed.data] : [];
});

export function modelsFor(
  keys: ReadonlySet<Provider>,
  all: readonly PhoneModel[] = PHONE_MODELS,
): PhoneModel[] {
  return all.filter((m) => keys.has(m.provider));
}

export function findModel(
  id: string,
  all: readonly PhoneModel[] = PHONE_MODELS,
): PhoneModel | null {
  return all.find((m) => m.id === id) ?? null;
}
