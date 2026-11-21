/**
 * Settings → Models: the download catalogue (P1.9, P11.4), downloads with progress (P1.8),
 * updates to newer model versions (P11.5, P11.7), and replacing and deleting models (P11.6).
 * Admin only. Downloads by name accept Ollama library models only.
 */
import { fullText } from '../config/schema.ts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LibraryModelName } from '@hemmia/relay-protocol';
import {
  type CatalogResponse,
  CatalogCheckRequest,
  DismissUpdateRequest,
  type InstalledModelsResponse,
  type ModelUpdatesResponse,
  type PullEvent,
  RemoveModelRequest,
  ReplaceModelRequest,
  type ReplaceModelResponse,
  StartPullRequest,
  type StartPullResponse,
} from '@hemmia/shared';
import { openSse } from '../chat/sse.ts';
import type { CatalogEntry } from '../config/schema.ts';
import type { LlmClient } from '../llm/types.ts';
import { LifecycleError, type ModelLifecycle } from '../models/lifecycle.ts';
import type { OverrideStore } from '../models/overrides.ts';
import { PullRefusedError, type PullManager } from '../models/pulls.ts';
import { type UpdateNotices, withTag } from '../models/updates.ts';
import { HttpError, requireAdmin } from '../security/http.ts';
import type { Capabilities } from '../system/capabilities.ts';

export interface AdminModelRouteDeps {
  /** The current catalogue (bundled plus the signed one from the relay). */
  catalog: () => readonly CatalogEntry[];
  capabilities: Capabilities;
  llm: Pick<LlmClient, 'installed'>;
  pulls: PullManager;
  lifecycle: ModelLifecycle;
  notices: UpdateNotices;
  overrides: OverrideStore;
  /** Ollama models the family is offered now. */
  offered: () => readonly string[];
  now?: () => number;
}

const PullParams = z.object({ id: z.uuid() });
const NEW_DAYS = 30;

/** Whether a catalogue entry is the one to recommend for this much total memory. */
export function recommendedFor(entry: CatalogEntry, memoryGiB: number): boolean {
  const r = entry.recommendedFor;
  return r !== undefined && memoryGiB >= r.minGiB && (r.maxGiB === null || memoryGiB <= r.maxGiB);
}

function lifecycleError(err: unknown): never {
  if (!(err instanceof LifecycleError)) throw err;
  if (err.code === 'unavailable') throw new HttpError(409, 'unreachable');
  throw new HttpError(409, err.code);
}

export function registerAdminModelRoutes(app: FastifyInstance, deps: AdminModelRouteDeps): void {
  const now = deps.now ?? Date.now;

  app.get(
    '/api/admin/catalog',
    { preHandler: requireAdmin },
    async (): Promise<CatalogResponse> => {
      const { memoryGiB } = deps.capabilities.current();
      const installed = new Set(
        (await deps.llm.installed().catch(() => [])).map((m) => withTag(m.model)),
      );
      const offered = new Set(deps.offered().map(withTag));
      const catalog = deps.catalog();
      // Popularity among the catalogue's own models, by Ollama's pull counts.
      const ranked = catalog
        .filter((e) => e.remote)
        .map((e) => ({ model: e.ollamaModel.split(':')[0] ?? '', pulls: e.remote?.pulls ?? 0 }))
        .sort((a, b) => b.pulls - a.pulls);
      const rankOf = new Map<string, number>();
      for (const r of ranked) if (!rankOf.has(r.model)) rankOf.set(r.model, rankOf.size + 1);
      const cutoff = new Date(now() - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
      return {
        memoryGiB,
        entries: catalog.map((e) => ({
          ollamaModel: e.ollamaModel,
          label: fullText(e.label),
          description: fullText(e.description),
          downloadGiB: e.downloadGiB,
          memoryGiB: e.memoryGiB,
          minTotalMemoryGiB: e.minTotalMemoryGiB,
          vision: e.vision,
          tools: e.tools,
          think: e.think,
          contextTokens: e.contextTokens,
          fits: e.minTotalMemoryGiB <= memoryGiB,
          recommended: recommendedFor(e, memoryGiB),
          installed: installed.has(withTag(e.ollamaModel)),
          isNew: e.remote !== undefined && e.remote.addedAt >= cutoff,
          popularRank: e.remote ? (rankOf.get(e.ollamaModel.split(':')[0] ?? '') ?? null) : null,
          releasedAt: e.remote?.releasedAt ?? null,
          inUse: offered.has(withTag(e.ollamaModel)),
        })),
      };
    },
  );

  app.get(
    '/api/admin/models/updates',
    { preHandler: requireAdmin },
    async (): Promise<ModelUpdatesResponse> => {
      const updates = await deps.notices.refresh(false);
      const installed = new Set(
        (await deps.llm.installed().catch(() => [])).map((m) => withTag(m.model)),
      );
      return {
        updates: updates.map((u) => ({
          key: u.key,
          from: u.from,
          to: u.to,
          kind: u.kind,
          label: fullText(u.entry.label),
          downloadGiB: u.entry.downloadGiB,
          installed: u.kind === 'version' && installed.has(withTag(u.to)),
        })),
        unseen: deps.notices.unseen(),
        catalogCheck: deps.overrides.get().catalogCheck,
      };
    },
  );

  app.post('/api/admin/models/updates/seen', { preHandler: requireAdmin }, async (_req, reply) => {
    deps.notices.seen();
    return reply.code(204).send();
  });

  app.post(
    '/api/admin/models/updates/dismiss',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { key } = DismissUpdateRequest.parse(req.body);
      deps.notices.dismiss(key);
      return reply.code(204).send();
    },
  );

  app.put('/api/admin/models/catalog-check', { preHandler: requireAdmin }, async (req, reply) => {
    const { on } = CatalogCheckRequest.parse(req.body);
    deps.overrides.set({ ...deps.overrides.get(), catalogCheck: on });
    return reply.code(204).send();
  });

  app.get(
    '/api/admin/models/installed',
    { preHandler: requireAdmin },
    async (): Promise<InstalledModelsResponse> => {
      const list = await deps.llm.installed().catch(() => null);
      if (list === null) throw new HttpError(409, 'unreachable');
      const caps = await deps.capabilities.refresh().catch(() => deps.capabilities.current());
      return {
        diskFreeGiB: caps.diskFreeGiB,
        models: list
          .map((m) => ({
            model: m.model,
            sizeGiB: Math.round(m.sizeGiB * 10) / 10,
            offeredId: deps.lifecycle.offeredId(m.model),
          }))
          .sort((a, b) => b.sizeGiB - a.sizeGiB),
      };
    },
  );

  app.post(
    '/api/admin/models/replace',
    { preHandler: requireAdmin },
    async (req): Promise<ReplaceModelResponse> => {
      const { from, to } = ReplaceModelRequest.parse(req.body);
      try {
        const r = await deps.lifecycle.replace(from, to);
        req.log.info({ from, to, moved: r.moved }, 'model replaced');
        return { modelId: r.toId, moved: r.moved };
      } catch (err) {
        return lifecycleError(err);
      }
    },
  );

  app.post('/api/admin/models/remove', { preHandler: requireAdmin }, async (req, reply) => {
    const { model } = RemoveModelRequest.parse(req.body);
    try {
      await deps.lifecycle.remove(model);
    } catch (err) {
      lifecycleError(err);
    }
    req.log.info({ model }, 'model deleted');
    return reply.code(204).send();
  });

  app.post(
    '/api/admin/models/pulls',
    { preHandler: requireAdmin },
    async (req, reply): Promise<StartPullResponse> => {
      const { model } = StartPullRequest.parse(req.body);
      // Library models only (no user/model namespaces, no cloud tags).
      if (!LibraryModelName.safeParse(withTag(model)).success) {
        throw new HttpError(400, 'bad_model');
      }
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
