/**
 * Settings → Account → Cloud AI: each person's own API keys, their monthly cap and this
 * month's use. Owned by Claude (keys).
 *
 * A key is checked with the provider (a request that sends no content) before it is stored
 * encrypted with the user's data key. It is never sent back: the app only sees its last
 * characters. The admin's family switch decides who may add and use keys.
 */
import type { FastifyInstance } from 'fastify';
import {
  CloudProvider,
  type CloudSettingsResponse,
  SaveCloudKeyRequest,
  SetCloudCapRequest,
  type WebSearchMode,
} from '@hemmia/shared';
import type { CloudRepo } from '../db/cloud.ts';
import { type CloudClient, LlmError } from '../llm/types.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';
import { z } from 'zod';

const ProviderParams = z.object({ provider: CloudProvider });

/** How long checking a key with the provider may take. */
const CHECK_TIMEOUT_MS = 10_000;

export interface CloudRouteDeps {
  cloud: CloudRepo;
  clients: Partial<Record<CloudProvider, CloudClient>>;
  /** The admin's family switch: who may use cloud models. */
  mode: () => WebSearchMode;
  now?: () => number;
}

/** Whether the family switch allows cloud models for this account. */
export function cloudAllowed(mode: WebSearchMode, viewer: { restricted: boolean }): boolean {
  return mode === 'all' || (mode === 'adults' && !viewer.restricted);
}

export function registerCloudRoutes(app: FastifyInstance, deps: CloudRouteDeps): void {
  // Each check is a request to the provider: keep guessing and hammering out.
  const checks = createRateLimiter({
    max: 10,
    windowMs: 60 * 60_000,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const settings = (user: ReturnType<typeof currentUser>): CloudSettingsResponse => {
    const month = deps.cloud.thisMonth(user.userId);
    return {
      allowed: cloudAllowed(deps.mode(), user),
      keys: deps.cloud.list(user),
      capCents: deps.cloud.cap(user.userId),
      month: {
        costCents: month.costMicros / 10_000,
        inputTokens: month.inputTokens,
        outputTokens: month.outputTokens,
      },
    };
  };

  app.get('/api/cloud', { preHandler: requireUser }, async (req): Promise<CloudSettingsResponse> =>
    settings(currentUser(req)),
  );

  app.put(
    '/api/cloud/keys/:provider',
    { preHandler: requireUser },
    async (req): Promise<CloudSettingsResponse> => {
      const user = currentUser(req);
      const { provider } = ProviderParams.parse(req.params);
      const { key } = SaveCloudKeyRequest.parse(req.body);
      if (!cloudAllowed(deps.mode(), user)) throw new HttpError(403, 'forbidden');
      const client = deps.clients[provider];
      if (!client) throw new HttpError(400, 'bad_request');
      const limit = checks.hit(user.userId);
      if (!limit.allowed) {
        throw new HttpError(429, 'rate_limited', Math.ceil(limit.retryAfterMs / 1000));
      }
      let works: boolean;
      try {
        works = await client.checkKey(key, AbortSignal.timeout(CHECK_TIMEOUT_MS));
      } catch (err) {
        if (err instanceof LlmError) throw new HttpError(502, 'cloud_unavailable');
        throw err;
      }
      if (!works) throw new HttpError(400, 'cloud_key');
      deps.cloud.save(user, provider, key);
      return settings(user);
    },
  );

  app.delete('/api/cloud/keys/:provider', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { provider } = ProviderParams.parse(req.params);
    if (!deps.cloud.remove(user.userId, provider)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.put(
    '/api/cloud/cap',
    { preHandler: requireUser },
    async (req): Promise<CloudSettingsResponse> => {
      const user = currentUser(req);
      const { capCents } = SetCloudCapRequest.parse(req.body);
      deps.cloud.setCap(user.userId, capCents);
      return settings(user);
    },
  );
}
