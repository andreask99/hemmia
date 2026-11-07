import { z } from 'zod';
import { CloudProvider } from './chat.ts';

/**
 * Cloud models (Claude, OpenAI) with each person's own API key. The key is stored encrypted
 * with the user's data key and never sent back to the app; only a hint (its last characters)
 * is shown. Spending is tracked as token counts and an estimated cost, never content.
 */

/** An API key as pasted from the provider's console (no spaces; long random tokens). */
export const CloudApiKey = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_\-.]{20,300}$/);

export const CloudKeyInfo = z.object({
  provider: CloudProvider,
  /** The key's last 4 characters, to tell keys apart. */
  hint: z.string().max(8),
  addedAt: z.number().int(),
});
export type CloudKeyInfo = z.infer<typeof CloudKeyInfo>;

/** Largest monthly cap a user can set, in US cents ($1000). */
export const MAX_CLOUD_CAP_CENTS = 100_000;
/** Cap for users who haven't chosen one, in US cents ($20). */
export const DEFAULT_CLOUD_CAP_CENTS = 2_000;

export const CloudSettingsResponse = z.object({
  /** The admin allows cloud models for this account. */
  allowed: z.boolean(),
  keys: z.array(CloudKeyInfo),
  /** Monthly spending cap in US cents; null = no cap (the provider's own limit applies). */
  capCents: z.number().int().min(1).max(MAX_CLOUD_CAP_CENTS).nullable(),
  /** This calendar month so far (estimated from token counts and list prices). */
  month: z.object({
    costCents: z.number().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
});
export type CloudSettingsResponse = z.infer<typeof CloudSettingsResponse>;

/** PUT /api/cloud/keys/:provider. The key is checked with the provider before it's saved. */
export const SaveCloudKeyRequest = z.object({ key: CloudApiKey }).strict();
export type SaveCloudKeyRequest = z.infer<typeof SaveCloudKeyRequest>;

/** PUT /api/cloud/cap. */
export const SetCloudCapRequest = z
  .object({ capCents: z.number().int().min(1).max(MAX_CLOUD_CAP_CENTS).nullable() })
  .strict();
export type SetCloudCapRequest = z.infer<typeof SetCloudCapRequest>;
