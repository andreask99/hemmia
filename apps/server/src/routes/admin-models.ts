/**
 * Settings → Models: the download catalogue (P1.9) and model downloads with progress (P1.8).
 * Admin only.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  type CatalogResponse,
  type PullEvent,
  StartPullRequest,
  type StartPullResponse,
} from '@hemmia/shared';
import { openSse } from '../chat/sse.ts';
import type { CatalogEntry } from '../config/schema.ts';
import type { LlmClient } from '../llm/types.ts';
import { PullRefusedError, type PullManager } from '../models/pulls.ts';
import { HttpError, requireAdmin } from '../security/http.ts';
import type { Capabilities } from '../system/capabilities.ts';

export interface AdminModelRouteDeps {
  catalog: readonly CatalogEntry[];
  capabilities: Capabilities;
  llm: Pick<LlmClient, 'installed'>;
  pulls: PullManager;
}

const PullParams = z.object({ id: z.uuid() });

/** Whether a catalogue entry is the one to recommend for this much total memory. */
export function recommendedFor(entry: CatalogEntry, memoryGiB: number): boolean {
  const r = entry.recommendedFor;
  return r !== undefined && memoryGiB >= r.minGiB && (r.maxGiB === null || memoryGiB <= r.maxGiB);
}

export function registerAdminModelRoutes(app: FastifyInstance, deps: AdminModelRouteDeps): void {
  app.get(
    '/api/admin/catalog',
    { preHandler: requireAdmin },
    async (): Promise<CatalogResponse> => {
      const { memoryGiB } = deps.capabilities.current();
      const installed = new Set(
        (await deps.llm.installed().catch(() => [])).map((m) => m.model.replace(/:latest$/, '')),
      );
      return {
        memoryGiB,
        entries: deps.catalog.map((e) => ({
          ollamaModel: e.ollamaModel,
          label: e.label,
          description: e.description,
          downloadGiB: e.downloadGiB,
          memoryGiB: e.memoryGiB,
          minTotalMemoryGiB: e.minTotalMemoryGiB,
          vision: e.vision,
          tools: e.tools,
          fits: e.minTotalMemoryGiB <= memoryGiB,
          recommended: recommendedFor(e, memoryGiB),
          installed: installed.has(e.ollamaModel.replace(/:latest$/, '')),
        })),
      };
    },
  );

  app.post(
    '/api/admin/models/pulls',
    { preHandler: requireAdmin },
    async (req, reply): Promise<StartPullResponse> => {
      const { model } = StartPullRequest.parse(req.body);
      try {
        const started = await deps.pulls.start(model);
        void reply.code(202);
        return started;
      } catch (err) {
        if (!(err instanceof PullRefusedError)) throw err;
        if (err.code === 'unavailable') throw new HttpError(409, 'unreachable');
        throw new HttpError(409, err.code);
      }
    },
  );

  app.get('/api/admin/models/pulls/:id/events', { preHandler: requireAdmin }, (req, reply) => {
    const { id } = PullParams.parse(req.params);
    let stream: ReturnType<typeof openSse<PullEvent>> | null = null;
    const buffered: PullEvent[] = [];
    const stop = deps.pulls.watch(id, (e) => {
      if (stream) {
        stream.send(e);
        if (e.type !== 'progress') stream.end();
      } else {
        buffered.push(e);
      }
    });
    if (!stop) throw new HttpError(404, 'not_found');
    stream = openSse<PullEvent>(reply);
    for (const e of buffered) {
      stream.send(e);
      if (e.type !== 'progress') {
        stream.end();
        return;
      }
    }
    stream.onClose(stop);
  });

  app.delete('/api/admin/models/pulls/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = PullParams.parse(req.params);
    if (!deps.pulls.cancel(id)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });
}
