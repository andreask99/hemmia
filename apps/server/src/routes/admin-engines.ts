/**
 * Settings → Models → Other local servers (P1.7): admin-added Chat Completions servers on this
 * computer or the home network. Owned by Claude (the address rule is enforced on save here
 * and on every connection by security/localengine.ts).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AddCustomEngineRequest,
  type AdminEnginesResponse,
  MAX_CUSTOM_ENGINES,
} from '@hemmia/shared';
import type { FetchLike } from '@hemmia/providers';
import { type EngineStore, listEngineModels } from '../models/engines.ts';
import type { OverrideStore } from '../models/overrides.ts';
import { HttpError, requireAdmin } from '../security/http.ts';
import {
  assertResolvesLocal,
  checkEngineUrl,
  LocalEngineRefusedError,
  type LookupFn,
} from '../security/localengine.ts';
import type { Capabilities } from '../system/capabilities.ts';

export interface AdminEngineDeps {
  engines: EngineStore;
  overrides: OverrideStore;
  capabilities: Capabilities;
  ollamaUrl: string;
  localFetch: FetchLike;
  lookup?: LookupFn;
}

export function registerAdminEngineRoutes(app: FastifyInstance, deps: AdminEngineDeps): void {
  const listing = async (): Promise<AdminEnginesResponse> => {
    const ollama = deps.capabilities.current().ollama;
    const custom = await Promise.all(
      deps.engines.list().map(async (e) => {
        try {
          const models = await listEngineModels(deps.localFetch, e.baseUrl);
          return { ...e, reachable: true, models };
        } catch {
          return { ...e, reachable: false, models: [] };
        }
      }),
    );
    return { ollama: { url: deps.ollamaUrl, ...ollama }, custom };
  };

  app.get('/api/admin/engines', { preHandler: requireAdmin }, listing);

  app.post(
    '/api/admin/engines/custom',
    { preHandler: requireAdmin },
    async (req): Promise<AdminEnginesResponse> => {
      const body = AddCustomEngineRequest.parse(req.body);
      let baseUrl: string;
      try {
        baseUrl = checkEngineUrl(body.baseUrl);
        await assertResolvesLocal(baseUrl, deps.lookup);
      } catch (err) {
        if (err instanceof LocalEngineRefusedError) {
          throw new HttpError(
            400,
            err.reason === 'address' ? 'address_not_allowed' : 'bad_request',
          );
        }
        throw err;
      }
      if (deps.engines.list().length >= MAX_CUSTOM_ENGINES) throw new HttpError(409, 'too_many');
      try {
        await listEngineModels(deps.localFetch, baseUrl);
      } catch (err) {
        if (err instanceof LocalEngineRefusedError && err.reason === 'address') {
          throw new HttpError(400, 'address_not_allowed');
        }
        throw new HttpError(400, 'unreachable');
      }
      deps.engines.add({ label: body.label, baseUrl });
      return listing();
    },
  );

  app.delete(
    '/api/admin/engines/custom/:id',
    { preHandler: requireAdmin },
    async (req): Promise<AdminEnginesResponse> => {
      const { id } = z.object({ id: z.string().regex(/^[a-z0-9]{8}$/) }).parse(req.params);
      if (!deps.engines.remove(id)) throw new HttpError(404, 'not_found');
      // Its models leave the offer too.
      const current = deps.overrides.get();
      const gone = current.extraModels.filter((m) => m.engine === `custom:${id}`).map((m) => m.id);
      deps.overrides.set({
        ...current,
        extraModels: current.extraModels.filter((m) => !gone.includes(m.id)),
        disabled: current.disabled.filter((d) => !gone.includes(d)),
        defaultChatModel:
          current.defaultChatModel !== null && gone.includes(current.defaultChatModel)
            ? null
            : current.defaultChatModel,
      });
      return listing();
    },
  );
}
