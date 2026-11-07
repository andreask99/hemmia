/**
 * The user's profile (notes the model gets as context): view, edit, wipe, and undo a note
 * the model saved. Owned by Claude. Adults only: teen accounts have no profile.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type ProfileResponse, SaveProfileRequest } from '@hemmia/shared';
import { type ProfileRepo, USER_PROFILE } from '../db/profile.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

const NoteParams = z.object({ noteId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });

export function registerProfileRoutes(app: FastifyInstance, deps: { profiles: ProfileRepo }): void {
  const adult = (req: Parameters<typeof currentUser>[0]) => {
    const user = currentUser(req);
    if (user.restricted) throw new HttpError(403, 'forbidden');
    return user;
  };

  app.get('/api/profile', { preHandler: requireUser }, async (req): Promise<ProfileResponse> => {
    const user = currentUser(req);
    if (user.restricted) return { available: false, notes: [], updatedAt: null };
    return { available: true, ...deps.profiles.get(user, USER_PROFILE) };
  });

  app.put('/api/profile', { preHandler: requireUser }, async (req): Promise<ProfileResponse> => {
    const user = adult(req);
    const { notes } = SaveProfileRequest.parse(req.body);
    deps.profiles.save(user, USER_PROFILE, notes);
    return { available: true, ...deps.profiles.get(user, USER_PROFILE) };
  });

  app.delete('/api/profile', { preHandler: requireUser }, async (req, reply) => {
    deps.profiles.wipe(adult(req), USER_PROFILE);
    return reply.code(204).send();
  });

  // The undo under a reply: removes that note from whichever of the user's profiles has it.
  app.delete('/api/profile/notes/:noteId', { preHandler: requireUser }, async (req, reply) => {
    const { noteId } = NoteParams.parse(req.params);
    if (!deps.profiles.removeNote(adult(req), noteId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });
}
