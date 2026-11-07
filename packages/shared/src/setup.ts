import { z } from 'zod';
import { Language, NewPassword, Username } from './auth.ts';

/** GET /api/setup/state (only in setup mode; 404 afterwards). */
export const SetupState = z.object({
  needsSetup: z.literal(true),
  machine: z.object({
    platform: z.string(),
    memoryGiB: z.number(),
    diskFreeGiB: z.number().nullable(),
  }),
  familyName: z.string().nullable(),
});
export type SetupState = z.infer<typeof SetupState>;

/** POST /api/setup/account: the first admin. Answers like an invite acceptance (AccountResponse). */
export const SetupAccountRequest = z
  .object({
    setupCode: z.string().min(16).max(40),
    username: Username,
    password: NewPassword,
    familyName: z.string().trim().min(1).max(60),
    lang: Language,
  })
  .strict();
export type SetupAccountRequest = z.infer<typeof SetupAccountRequest>;
