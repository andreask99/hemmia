/**
 * Push notification subscriptions for the signed-in user's devices. Owned by Claude.
 */
import type { FastifyInstance } from 'fastify';
import {
  NativePushRequest,
  PushSubscribeRequest,
  PushUnsubscribeRequest,
  type PushKeyResponse,
  ResolvePushRequest,
  type ResolvePushResponse,
} from '@hemmia/shared';
import type { DB } from '../db/database.ts';
import { RelayApiError } from '../relay/client.ts';
import type { PushRefs } from '../security/pushref.ts';
import { type Push, PushRejectedError } from '../security/push.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

export function registerPushRoutes(
  app: FastifyInstance,
  push: Push,
  deps: { db?: DB; refs?: PushRefs } = {},
): void {
  // Native apps (P4.4): device tokens go to the relay; refs resolve to the user's own chats.
  app.post('/api/push/native', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const body = NativePushRequest.parse(req.body);
    try {
      await push.subscribeNative(user, body);
    } catch (err) {
      if (err instanceof PushRejectedError) throw new HttpError(409, 'relay_not_configured');
      if (err instanceof RelayApiError) throw new HttpError(502, 'relay_unavailable');
      throw err;
    }
    return reply.code(204).send();
  });

  app.delete('/api/push/native', { preHandler: requireUser }, async (req, reply) => {
    await push.unsubscribeNative(currentUser(req).sessionId);
    return reply.code(204).send();
  });

  app.post(
    '/api/push/resolve',
    { preHandler: requireUser },
    async (req): Promise<ResolvePushResponse> => {
      const user = currentUser(req);
      const { ref } = ResolvePushRequest.parse(req.body);
      const chatId = deps.refs?.decryptRef(ref) ?? null;
      if (chatId === null) throw new HttpError(404, 'not_found');
      if (chatId === '') return { path: '/' };
      const own = deps.db
        ?.prepare('SELECT 1 FROM chats WHERE id = ? AND user_id = ?')
        .get(chatId, user.userId);
      if (!own) throw new HttpError(404, 'not_found');
      return { path: `/chats/${chatId}` };
    },
  );

  app.get('/api/push/key', { preHandler: requireUser }, async (): Promise<PushKeyResponse> => {
    return { publicKey: push.publicKey() };
  });

  app.post('/api/push/subscription', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const body = PushSubscribeRequest.parse(req.body);
    try {
      push.subscribe(user, body);
    } catch (err) {
      if (err instanceof PushRejectedError) throw new HttpError(400, 'bad_request');
      throw err;
    }
    return reply.code(204).send();
  });

  app.delete('/api/push/subscription', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { endpoint } = PushUnsubscribeRequest.parse(req.body);
    push.unsubscribe(user.userId, endpoint);
    return reply.code(204).send();
  });
}
