/**
 * Photo and document upload, attachment download. Owned by Claude (upload validation, access control).
 */
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Id, type UploadResponse } from '@hemmia/shared';
import { type AttachmentStore, ImageRejectedError, sniffImage } from '../security/attachments.ts';
import { DocumentRejectedError, MAX_DOCUMENT_BYTES, sniffDocument } from '../security/documents.ts';
import { currentUser, HttpError, requireUser, SECURITY_HEADERS } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';

export interface AttachmentRouteDeps {
  store: AttachmentStore;
  now?: () => number;
}

const Params = z.object({ id: Id });

export async function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: AttachmentRouteDeps,
): Promise<void> {
  const { store } = deps;
  // Uploads per user: generous for a family, but stops a runaway client filling the disk.
  const uploads = createRateLimiter({
    max: 100,
    windowMs: 60 * 60_000,
    ...(deps.now ? { now: deps.now } : {}),
  });

  // Multipart only in this encapsulated scope; everything else stays JSON-only.
  await app.register(async (scope) => {
    await scope.register(multipart, {
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0, parts: 1, headerPairs: 50 },
    });

    scope.post('/api/attachments', { preHandler: requireUser }, async (req, reply) => {
      const user = currentUser(req);
      const limit = uploads.hit(user.userId);
      if (!limit.allowed) {
        throw new HttpError(429, 'rate_limited', Math.ceil(limit.retryAfterMs / 1000));
      }
      if (!req.isMultipart()) throw new HttpError(415, 'bad_request');
      const file = await req.file();
      if (!file) throw new HttpError(400, 'bad_request');
      let bytes: Buffer;
      try {
        bytes = await file.toBuffer();
      } catch {
        throw new HttpError(413, 'payload_too_large');
      }
      if (file.file.truncated) throw new HttpError(413, 'payload_too_large');
      try {
        // The bytes decide what this is, never the file name or the client's MIME type.
        let ref: UploadResponse;
        if (sniffImage(bytes)) ref = await store.saveUpload(user, bytes);
        else if (sniffDocument(bytes)) ref = await store.saveDocument(user, bytes, file.filename);
        else throw new HttpError(400, 'bad_request');
        return await reply.code(201).send(ref);
      } catch (err) {
        if (err instanceof ImageRejectedError || err instanceof DocumentRejectedError) {
          throw new HttpError(400, 'bad_request');
        }
        throw err;
      }
    });
  });

  app.get('/api/attachments/:id', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { id } = Params.parse(req.params);
    const found = await store.read(user, id);
    if (!found) throw new HttpError(404, 'not_found');
    const isImage = found.mime === 'image/jpeg' || found.mime === 'image/png';
    return reply
      .headers({
        ...SECURITY_HEADERS,
        'content-type': found.mime,
        // Documents are downloads, never rendered in the app's origin.
        'content-disposition': isImage
          ? 'inline'
          : `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(found.name ?? 'document')}`,
        'cache-control': 'private, no-store',
      })
      .send(found.bytes);
  });
}
