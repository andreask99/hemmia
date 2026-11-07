/**
 * First-run setup (SECURITY.md §6.1, mockups H1–H3): the state for the wizard and the first
 * admin account. Both answer 404 once the hub has a user. Owned by Claude.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { type AccountResponse, SetupAccountRequest, type SetupState } from '@hemmia/shared';
import type { DB } from '../db/database.ts';
import type { Auth } from '../security/auth.ts';
import { type CookieSettings, HttpError, setSessionCookie } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';
import type { Setup } from '../security/setup.ts';
import type { Capabilities } from '../system/capabilities.ts';
import { toMe, userAgentLabel } from './auth.ts';

const WINDOW_MS = 15 * 60_000;

export function familyName(db: DB): string | null {
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
    .get('family');
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as { name?: unknown };
    return typeof v.name === 'string' ? v.name : null;
  } catch {
    return null;
  }
}

export function registerSetupRoutes(
  app: FastifyInstance,
  deps: {
    db: DB;
    auth: Auth;
    setup: Setup;
    cookie: CookieSettings;
    capabilities: Capabilities;
    /** Called after the admin exists, before answering (the device gate sets its cookie). */
    onCreated?: (
      req: FastifyRequest,
      reply: FastifyReply,
      userId: string,
      sessionId: string,
    ) => void;
    now?: () => number;
  },
): void {
  const now = deps.now ?? Date.now;
  const limiter = deps.now ? { now: deps.now } : {};
  const perIp = createRateLimiter({ max: 20, windowMs: WINDOW_MS, ...limiter });
  // Wrong codes count per address (with backoff) and, more loosely, for the whole hub: one
  // address that spams wrong codes can't lock the owner out of their own setup.
  const wrongCodes = createRateLimiter({ max: 5, windowMs: WINDOW_MS, backoff: true, ...limiter });
  const wrongCodesHub = createRateLimiter({ max: 100, windowMs: WINDOW_MS, ...limiter });
  const limited = (r: { allowed: boolean; retryAfterMs: number }) => {
    if (!r.allowed)
      throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(r.retryAfterMs / 1000)));
  };

  app.get('/api/setup/state', async (): Promise<SetupState> => {
    if (!deps.setup.needsSetup()) throw new HttpError(404, 'not_found');
    const c = deps.capabilities.current();
    return {
      needsSetup: true,
      machine: { platform: c.platform, memoryGiB: c.memoryGiB, diskFreeGiB: c.diskFreeGiB },
      familyName: familyName(deps.db),
    };
  });

  app.post('/api/setup/account', async (req, reply): Promise<AccountResponse> => {
    if (!deps.setup.needsSetup()) throw new HttpError(404, 'not_found');
    limited(perIp.hit(`setup-ip:${req.ip}`));
    const body = SetupAccountRequest.parse(req.body);
    const ipKey = `setup:${req.ip}`;
    limited(wrongCodes.check(ipKey));
    limited(wrongCodesHub.check('setup'));
    if (!deps.setup.verify(body.setupCode)) {
      wrongCodes.hit(ipKey);
      wrongCodesHub.hit('setup');
      throw new HttpError(403, 'forbidden');
    }
    const res = await deps.auth.createFirstAdmin({
      username: body.username,
      password: body.password,
      language: body.lang,
      userAgentLabel: userAgentLabel(req.headers['user-agent']),
    });
    deps.setup.complete();
    deps.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('family', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(JSON.stringify({ name: body.familyName }), now());
    setSessionCookie(reply, deps.cookie, res.session.token);
    deps.onCreated?.(req, reply, res.userId, res.session.sessionId);
    const user = deps.auth.resolveSession(res.session.token);
    if (!user) throw new HttpError(500, 'internal');
    try {
      return { me: toMe(user), recoveryCode: res.recoveryCode };
    } finally {
      user.dek.fill(0);
    }
  });
}
