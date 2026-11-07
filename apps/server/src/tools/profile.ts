/**
 * The remember tool: the chat model saves a lasting note about the user to their profile
 * (db/profile.ts). Notes are shown under the reply with an undo.
 */
import { z } from 'zod';
import { MAX_NOTE_CHARS } from '@hemmia/shared';
import type { ToolSpec } from '../llm/types.ts';

/** Notes one reply may save; more calls are refused. */
export const MAX_NOTES_PER_REPLY = 3;

export const REMEMBER_TOOL: ToolSpec = {
  name: 'remember',
  description:
    'Save one lasting fact about the user to their profile (who they are, family, work or school, ' +
    'interests, preferences, how they like answers). Only from what the user said about themselves.',
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: `One short third-person sentence in the user's language, at most ${String(MAX_NOTE_CHARS)} characters, e.g. "Has two daughters, Mia (8) and Lena (12)".`,
      },
    },
    required: ['note'],
  },
};

/** Long notes are cut at a word boundary rather than refused. */
export const RememberArgs = z.object({
  note: z
    .string()
    .trim()
    .min(1)
    .transform((s) =>
      s.length <= MAX_NOTE_CHARS ? s : `${s.slice(0, MAX_NOTE_CHARS - 1).replace(/\s+\S*$/, '')}…`,
    ),
});
