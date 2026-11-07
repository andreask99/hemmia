/**
 * Agents: list (with templates), create, edit, delete, pin, and drafting with the model.
 * Owned by Claude (per-user isolation: see db/agents.ts).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  type Agent,
  AgentDraftRequest,
  type AgentDraft,
  type AgentListResponse,
  Id,
  PinAgentRequest,
  SaveAgentRequest,
} from '@hemmia/shared';
import { agentTemplates } from '../agents/templates.ts';
import { DraftUnavailableError, draftAgent } from '../agents/draft.ts';
import { AgentForbiddenError, type AgentRepo } from '../db/agents.ts';
import { BusyError, type Scheduler } from '../jobs/scheduler.ts';
import type { LlmClient } from '../llm/types.ts';
import { isCloud, type ModelRegistry } from '../models/types.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

export interface AgentRouteDeps {
  agents: AgentRepo;
  registry: ModelRegistry;
  /** Drafting with the model; the route is registered only with both. */
  llm?: LlmClient;
  scheduler?: Scheduler;
  paused?: () => boolean;
}

const AgentParams = z.object({ agentId: Id });

export function registerAgentRoutes(app: FastifyInstance, deps: AgentRouteDeps): void {
  const { agents, registry } = deps;
  const forbidden = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof AgentForbiddenError) throw new HttpError(403, 'forbidden');
      throw err;
    }
  };
  /** A preferred model must be one this user may use. */
  const checkModel = async (modelId: string | null, user: { restricted: boolean }) => {
    if (modelId !== null && !(await registry.chatModel(modelId, user))) {
      throw new HttpError(400, 'bad_request');
    }
  };

  app.get('/api/agents', { preHandler: requireUser }, async (req): Promise<AgentListResponse> => {
    const user = currentUser(req);
    return { agents: agents.list(user), templates: agentTemplates(user.language) };
  });

  app.post('/api/agents', { preHandler: requireUser }, async (req, reply): Promise<Agent> => {
    const user = currentUser(req);
    const { family, ...fields } = SaveAgentRequest.parse(req.body);
    await checkModel(fields.modelId, user);
    const agent = forbidden(() => agents.create(user, fields, family));
    void reply.code(201);
    return agent;
  });

  app.put('/api/agents/:agentId', { preHandler: requireUser }, async (req): Promise<Agent> => {
    const user = currentUser(req);
    const { agentId } = AgentParams.parse(req.params);
    const { family, ...fields } = SaveAgentRequest.parse(req.body);
    await checkModel(fields.modelId, user);
    const agent = forbidden(() => agents.update(user, agentId, fields, family));
    if (!agent) throw new HttpError(404, 'not_found');
    return agent;
  });

  app.delete('/api/agents/:agentId', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { agentId } = AgentParams.parse(req.params);
    if (!forbidden(() => agents.delete(user, agentId))) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.put('/api/agents/:agentId/pin', { preHandler: requireUser }, async (req): Promise<Agent> => {
    const user = currentUser(req);
    const { agentId } = AgentParams.parse(req.params);
    const { pinned, order } = PinAgentRequest.parse(req.body);
    const agent = agents.pin(user, agentId, pinned, order);
    if (!agent) throw new HttpError(404, 'not_found');
    return agent;
  });

  const { llm, scheduler } = deps;
  if (llm && scheduler) {
    app.post('/api/agents/draft', { preHandler: requireUser }, async (req): Promise<AgentDraft> => {
      const user = currentUser(req);
      const body = AgentDraftRequest.parse(req.body);
      if (deps.paused?.()) throw new HttpError(409, 'paused');
      // Drafting runs on the Mac: a cloud default model isn't used for it.
      const own = user.defaultModelId ? await registry.chatModel(user.defaultModelId, user) : null;
      const fallback = registry.defaultChatModelId();
      const model =
        own && !isCloud(own) && own.engine === 'ollama'
          ? own
          : fallback === null
            ? null
            : await registry.chatModel(fallback, user);
      if (!model && fallback === null) throw new HttpError(409, 'no_model');
      if (!model) throw new HttpError(400, 'bad_request');
      try {
        return await draftAgent({ llm, scheduler }, user, model, body);
      } catch (err) {
        if (err instanceof BusyError) throw new HttpError(409, 'busy');
        if (err instanceof DraftUnavailableError) {
          if (err.code === 'failed') throw new HttpError(502, 'internal');
          throw new HttpError(409, err.code);
        }
        throw err;
      }
    });
  }
}
