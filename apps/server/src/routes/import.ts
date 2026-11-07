/**
 * POST /api/import/phone (PHONE-MODE.md §8, SECURITY.md §7.1): chats exported from "kchat on
 * this phone" become chats of the signed-in user, written through the normal encrypted chat
 * repository and every photo through the normal upload validation. Owned by Claude (writes
 * encrypted per-user data, upload validation). Never logs content.
 */
import type { FastifyInstance } from 'fastify';
import { PhoneExport, type PhoneImportResponse } from '@hemmia/shared';
import type { DB } from '../db/database.ts';
import type { ChatRepo } from '../db/chats.ts';
import type { ModelRegistry } from '../models/types.ts';
import { type AttachmentStore, ImageRejectedError, sniffImage } from '../security/attachments.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';

export const IMPORT_BODY_LIMIT = 200 * 1024 * 1024;

export interface ImportRouteDeps {
  db: DB;
  repo: ChatRepo;
  registry: ModelRegistry;
  attachments: AttachmentStore;
  now?: () => number;
}

export function registerImportRoutes(app: FastifyInstance, deps: ImportRouteDeps): void {
  const now = deps.now ?? Date.now;
  const perUser = createRateLimiter({ max: 3, windowMs: 60 * 60_000, now });

  app.post(
    '/api/import/phone',
    {
      // Sign-in and the rate limit are checked before the body (up to 200 MB) is read.
      onRequest: async (req) => {
        await requireUser(req);
        const limit = perUser.hit(currentUser(req).userId);
        if (!limit.allowed) {
          throw new HttpError(429, 'rate_limited', Math.ceil(limit.retryAfterMs / 1000));
        }
      },
      bodyLimit: IMPORT_BODY_LIMIT,
    },
    async (req): Promise<PhoneImportResponse> => {
      const user = currentUser(req);
      const parsed = PhoneExport.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'bad_request');

      // The phone's model if this hub offers it to the user, else the user's or family default.
      const own =
        user.defaultModelId !== null && (await deps.registry.chatModel(user.defaultModelId, user))
          ? user.defaultModelId
          : null;
      const fallback = own ?? deps.registry.defaultChatModelId();
      const usable = new Map<string, boolean>();
      const modelFor = async (id: string): Promise<string | null> => {
        if (!usable.has(id)) usable.set(id, (await deps.registry.chatModel(id, user)) !== null);
        return usable.get(id) ? id : fallback;
      };

      let chats = 0;
      let messages = 0;
      let photos = 0;
      let photosSkipped = 0;
      for (const c of parsed.data.chats) {
        const modelId = await modelFor(c.model);
        if (modelId === null) throw new HttpError(409, 'no_model');
        const chat = deps.repo.createChat(user, modelId);
        for (const m of c.messages) {
          const attachmentIds: string[] = [];
          for (const p of m.photos ?? []) {
            const bytes = Buffer.from(p, 'base64');
            // Same rule as an upload: the bytes decide, and only images pass.
            if (!sniffImage(bytes)) {
              photosSkipped++;
              continue;
            }
            try {
              attachmentIds.push((await deps.attachments.saveUpload(user, bytes)).id);
              photos++;
            } catch (err) {
              if (!(err instanceof ImageRejectedError)) throw err;
              photosSkipped++;
            }
          }
          deps.repo.addMessage(user, chat.id, {
            role: m.role,
            content: m.text,
            modelId: m.role === 'assistant' ? modelId : null,
            status: m.stopped ? 'cancelled' : 'done',
            attachmentIds,
          });
          messages++;
        }
        const title = c.title.trim();
        if (title !== '') deps.repo.updateChat(user, chat.id, { title: title.slice(0, 200) });
        chats++;
      }
      // Counts only, like every audit event.
      deps.db
        .prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)')
        .run(user.userId, 'phone_import', now());
      return { chats, messages, photos, photosSkipped };
    },
  );
}
