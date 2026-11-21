// Questions and feedback sent to the Hemmia team (POST /v1/feedback on the relay's API host),
// from the website's guides and from a hub's setup screens. Browser-safe (no node imports).
import { z } from 'zod';

export const FEEDBACK_MAX_CHARS = 4000;

export const FeedbackSource = z.enum(['site', 'hub']);
export type FeedbackSource = z.infer<typeof FeedbackSource>;

export const FeedbackRequest = z.object({
  message: z.string().trim().min(1).max(FEEDBACK_MAX_CHARS),
  /** Optional, only to answer; never required. */
  email: z.union([z.email().max(254), z.literal('')]).optional(),
  source: FeedbackSource,
  lang: z.enum(['en', 'de', 'fr', 'it']).default('en'),
  /** Where it was asked: a site path or a hub setup step (no ids, no query). */
  page: z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9/_.#-]*$/)
    .optional(),
  /** The hub's version, when asked from a hub. */
  version: z
    .string()
    .max(40)
    .regex(/^[0-9A-Za-z.+-]*$/)
    .optional(),
  /** Left empty by people; bots fill it in (answered as if accepted, not stored). */
  website: z.string().max(200).optional(),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;
