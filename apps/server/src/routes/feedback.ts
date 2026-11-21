/**
 * Questions and feedback for the Hemmia team from the hub's setup screens: forwarded to the
 * relay (POST https://api.<relay>/v1/feedback) with the hub's version and the person's language,
 * never with the hub's id, the account or the person's address. Not stored on the hub.
 */
import type { FastifyInstance } from 'fastify';
import { HubFeedbackRequest } from '@hemmia/shared';
import { currentUser, HttpError, requireUser } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';

export function registerFeedbackRoutes(
  app: FastifyInstance,
  deps: {
    relayDomain: string | null;
    version: string;
    fetch?: typeof fetch;
    now?: () => number;
  },
): void {
  const doFetch = deps.fetch ?? fetch;
  const tries = createRateLimiter({
    max: 10,
    windowMs: 60 * 60_000,
    ...(deps.now ? { now: deps.now } : {}),
  });

  app.post('/api/feedback', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const body = HubFeedbackRequest.parse(req.body);
    if (!deps.relayDomain) throw new HttpError(503, 'relay_not_configured');
    const r = tries.hit(`feedback:${user.userId}`);
    if (!r.allowed) {
      throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(r.retryAfterMs / 1000)));
    }
    let ok: boolean;
    try {
      const res = await doFetch(`https://api.${deps.relayDomain}/v1/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'hemmia-hub' },
        body: JSON.stringify({
          message: body.message,
          ...(body.email ? { email: body.email } : {}),
          source: 'hub',
          lang: user.language,
          ...(body.page ? { page: body.page } : {}),
          version: deps.version,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel().catch(() => undefined);
      ok = res.status === 204;
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(502, 'relay_unavailable');
    return reply.code(204).send();
  });
}
