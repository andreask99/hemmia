import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ChatListResponse,
  ChatSummary,
  CreateChatRequest,
  Id,
  MessagesResponse,
  OpenBriefingRequest,
  type OpenBriefingResponse,
  UpdateChatRequest,
} from '@hemmia/shared';
import { createBriefings } from '../chat/briefings.ts';
import type { AgentRepo } from '../db/agents.ts';
import type { ChatRepo } from '../db/chats.ts';
import type { ModelRegistry } from '../models/types.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

export interface ChatRouteDeps {
  repo: ChatRepo;
  registry: ModelRegistry;
  /** Deletes the encrypted blob files of these attachments (M3); may be a no-op. */
  deleteBlobs: (attachmentIds: string[]) => Promise<void>;
  /** Agents; without it, agentId in requests is refused. */
  agents?: AgentRepo;
  now?: () => number;
}

const ChatParams = z.object({ chatId: Id });

export function registerChatRoutes(app: FastifyInstance, deps: ChatRouteDeps): void {
  const { repo, registry, deleteBlobs } = deps;
  const briefings = createBriefings(deps);

  app.get('/api/chats', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const chats = repo.listChats(user);
    return reply.send(ChatListResponse.parse({ chats }));
  });

  app.post('/api/chats', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const body = CreateChatRequest.parse(req.body);
    // Explicit choice, else the user's own default (if still usable), else the family default.
    const own =
      user.defaultModelId !== null && (await registry.chatModel(user.defaultModelId, user))
        ? user.defaultModelId
        : null;
    // An agent must be visible to the user; its preferred model applies if usable.
    const agent = body.agentId !== undefined ? deps.agents?.get(user, body.agentId) : undefined;
    if (body.agentId !== undefined && !agent) throw new HttpError(400, 'bad_request');
    const agentModel =
      agent?.modelId && (await registry.chatModel(agent.modelId, user)) ? agent.modelId : null;
    const modelId = body.modelId ?? agentModel ?? own ?? registry.defaultChatModelId();
    if (modelId === null) throw new HttpError(409, 'no_model');
    const model = await registry.chatModel(modelId, user);
    if (!model) throw new HttpError(400, 'bad_request');

    const chat = repo.createChat(user, modelId, {
      agentId: agent?.id ?? null,
      think: (agent?.think ?? false) && model.thinking,
      ...(body.useProfile !== undefined ? { useProfile: body.useProfile } : {}),
    });
    if (agent) deps.agents?.touch(user, agent.id);
    return reply.code(201).send(ChatSummary.parse(chat));
  });

  // Planner shortcuts and notifications: today's chat of that kind, or a new hidden one.
  app.post(
    '/api/briefings',
    { preHandler: requireUser },
    async (req): Promise<OpenBriefingResponse> => {
      const { kind } = OpenBriefingRequest.parse(req.body);
      const opened = await briefings.open(currentUser(req), kind);
      if (!opened) throw new HttpError(400, 'bad_request');
      return opened;
    },
  );

  // One chat (planner chats aren't in the list).
  app.get('/api/chats/:chatId', { preHandler: requireUser }, async (req): Promise<ChatSummary> => {
    const { chatId } = ChatParams.parse(req.params);
    const chat = repo.getChat(currentUser(req), chatId);
    if (!chat) throw new HttpError(404, 'not_found');
    return chat;
  });

  app.patch('/api/chats/:chatId', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { chatId } = ChatParams.parse(req.params);
    const body = UpdateChatRequest.parse(req.body);

    // Validate the model and agent before writing anything.
    if (body.modelId !== undefined && !(await registry.chatModel(body.modelId, user))) {
      throw new HttpError(400, 'bad_request');
    }
    const agent = body.agentId ? deps.agents?.get(user, body.agentId) : undefined;
    if (body.agentId && !agent) throw new HttpError(400, 'bad_request');
    // Switching to an agent with a preferred (usable) model switches the model too.
    const agentModel =
      agent?.modelId &&
      body.modelId === undefined &&
      (await registry.chatModel(agent.modelId, user))
        ? agent.modelId
        : undefined;
    const chat = repo.updateChat(user, chatId, {
      ...body,
      ...(agentModel ? { modelId: agentModel } : {}),
      ...(agent && agent.think !== null && body.think === undefined ? { think: agent.think } : {}),
    });
    if (chat && agent) deps.agents?.touch(user, agent.id);
    if (!chat) throw new HttpError(404, 'not_found');

    return reply.send(ChatSummary.parse(chat));
  });

  app.delete('/api/chats/:chatId', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { chatId } = ChatParams.parse(req.params);

    const blobs = repo.deleteChat(user, chatId);
    if (!blobs) throw new HttpError(404, 'not_found');

    await deleteBlobs(blobs);
    return reply.code(204).send();
  });

  app.get('/api/chats/:chatId/messages', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { chatId } = ChatParams.parse(req.params);
    const query = z
      .object({
        before: z
          .string()
          .regex(/^\d{1,16}$/)
          .optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const result = repo.listMessages(user, chatId, {
      limit: query.limit,
      ...(query.before !== undefined ? { before: query.before } : {}),
    });
    if (!result) throw new HttpError(404, 'not_found');

    return reply.send(MessagesResponse.parse(result));
  });
}
