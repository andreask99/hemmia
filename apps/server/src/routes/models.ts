import type { FastifyInstance } from 'fastify';
import type { ModelsResponse } from '@hemmia/shared';
import type { LlmClient } from '../llm/types.ts';
import type { ModelRegistry } from '../models/types.ts';
import { currentUser, requireUser } from '../security/http.ts';

export function registerModelRoutes(
  app: FastifyInstance,
  deps: { registry: ModelRegistry; llm?: Pick<LlmClient, 'loaded'> },
): void {
  app.get('/api/models', { preHandler: requireUser }, async (req): Promise<ModelsResponse> => {
    const list = await deps.registry.list(currentUser(req));
    // Which of these models are in memory now, so the picker can mark them "Ready".
    const inMemory = new Set(
      ((await deps.llm?.loaded().catch(() => [])) ?? []).map((m) => m.model),
    );
    return {
      ...list,
      loaded: list.chatModels.filter((m) => inMemory.has(m.engineModel)).map((m) => m.id),
    };
  });
}
