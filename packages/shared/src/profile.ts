import { z } from 'zod';
import { Id } from './chat.ts';

/**
 * The profile: short notes about the user (who they are, what they like, how they want
 * answers) that kchat gives the model as context. Notes are saved by the model while it
 * answers (shown as "Noted" with an undo) or written by the user in Settings. Encrypted per
 * user; adults only. A profile belongs to the user, or (not used yet) to one of their agents.
 */

/** One note at most this long; a profile at most this many notes and characters. */
export const MAX_NOTE_CHARS = 200;
export const MAX_PROFILE_NOTES = 60;
export const MAX_PROFILE_CHARS = 4000;

export const NoteText = z.string().trim().min(1).max(MAX_NOTE_CHARS);

export const ProfileNote = z.object({
  id: Id,
  text: NoteText,
  createdAt: z.number().int(),
});
export type ProfileNote = z.infer<typeof ProfileNote>;

/** GET /api/profile. `available` is false for teen accounts (no profile). */
export const ProfileResponse = z.object({
  available: z.boolean(),
  notes: z.array(ProfileNote),
  updatedAt: z.number().int().nullable(),
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;

/** PUT /api/profile: the whole profile, one note per entry (unchanged notes keep their id). */
export const SaveProfileRequest = z.object({
  notes: z
    .array(NoteText)
    .max(MAX_PROFILE_NOTES)
    .refine((n) => n.join('').length <= MAX_PROFILE_CHARS, 'profile too long'),
});
export type SaveProfileRequest = z.infer<typeof SaveProfileRequest>;
