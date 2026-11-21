import { z } from 'zod';

/**
 * A question or feedback for the Hemmia team, asked from the hub's setup screens; the hub
 * forwards it to the relay (POST /api/feedback). Never seen by the family's admins.
 */
export const HubFeedbackRequest = z.object({
  message: z.string().trim().min(1).max(4000),
  /** Optional, only so the team can answer. */
  email: z.union([z.email().max(254), z.literal('')]).optional(),
  /** Which screen it was asked on (e.g. "settings/system"). */
  page: z
    .string()
    .max(100)
    .regex(/^[a-z0-9/_-]*$/)
    .optional(),
});
export type HubFeedbackRequest = z.infer<typeof HubFeedbackRequest>;
