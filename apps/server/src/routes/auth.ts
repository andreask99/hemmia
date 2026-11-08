/**
 * Auth routes. Security-sensitive: owned by Claude (see CLAUDE.md "Never delegate").
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AcceptInviteRequest,
  type AccountResponse,
  ChangePasswordRequest,
  LoginRequest,
  type MeResponse,
  RecoverRequest,
  type SessionResponse,
} from '@hemmia/shared';
import type { Auth, SessionUser } from '../security/auth.ts';
import {
  clearSessionCookie,
  type CookieSettings,
  currentUser,
  HttpError,
  requireUser,
  setSessionCookie,
} from '../security/http.ts';
import { createRateLimiter, ipBucket, type RateLimiter } from '../security/rate-limit.ts';

const WINDOW_MS = 15 * 60_000;

export interface AuthRouteDeps {
  auth: Auth;
  cookie: CookieSettings;
  now?: () => number;
  /** A session was created on this request (the device gate ties it to the device). */
  onSession?: (req: FastifyRequest, reply: FastifyReply, userId: string, sessionId: string) => void;
  /** Sign out everywhere also removes the user's other devices. */
  onLogoutAll?: (req: FastifyRequest, userId: string) => void;
}

export function toMe(user: SessionUser): MeResponse {
  return {
    id: user.userId,
    username: user.username,
    role: user.role,
    restricted: user.restricted,
    language: user.language,
    defaultModelId: user.defaultModelId,
  };
}

/** A coarse device label for the session list, e.g. "iPhone · Safari". */
export function userAgentLabel(ua: string | undefined): string {
  if (!ua) return '';
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  return [device, browser].filter(Boolean).join(' · ');
}

function limited(result: { allowed: boolean; retryAfterMs: number }): void {
  if (!result.allowed) {
    throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(result.retryAfterMs / 1000)));
  }
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { auth, cookie } = deps;
  const limiterOptions = deps.now ? { now: deps.now } : {};
  // Every unauthenticated auth attempt from one address.
  const perIp: RateLimiter = createRateLimiter({ max: 20, windowMs: WINDOW_MS, ...limiterOptions });
  // Failed attempts per username (login and recovery), with exponential backoff.
  const perUser: RateLimiter = createRateLimiter({
    max: 5,
    windowMs: WINDOW_MS,
    backoff: true,
    ...limiterOptions,
  });

  function guardIp(req: FastifyRequest): void {
    limited(perIp.hit(`ip:${ipBucket(req.ip)}`));
  }

  async function withUserLimit<T>(key: string, fn: () => Promise<T>): Promise<T> {
    limited(perUser.check(key));
    try {
      const result = await fn();
      perUser.reset(key);
      return result;
    } catch (err) {
      perUser.hit(key);
      throw err;
    }
  }

  /** Hands a new session to the device gate before the cookie goes out. */
  function bound(req: FastifyRequest, reply: FastifyReply, token: string): void {
    if (!deps.onSession) return;
    const user = auth.resolveSession(token);
    if (!user) throw new HttpError(500, 'internal');
    try {
      deps.onSession(req, reply, user.userId, user.sessionId);
    } finally {
      user.dek.fill(0);
    }
  }

  function sessionResponse(token: string): SessionResponse {
    const user = auth.resolveSession(token);
    if (!user) throw new HttpError(500, 'internal');
    try {
      return { me: toMe(user) };
    } finally {
      user.dek.fill(0);
    }
  }

  app.post('/api/auth/login', async (req, reply): Promise<SessionResponse> => {
    guardIp(req);
    const body = LoginRequest.parse(req.body);
    const key = `login:${body.username.toLowerCase()}`;
    const session = await withUserLimit(key, () =>
      auth.login({ ...body, userAgentLabel: userAgentLabel(req.headers['user-agent']) }),
    );
    bound(req, reply, session.token);
    setSessionCookie(reply, cookie, session.token);
    return sessionResponse(session.token);
  });

  app.post('/api/auth/invite/accept', async (req, reply): Promise<AccountResponse> => {
    guardIp(req);
    const body = AcceptInviteRequest.parse(req.body);
    const res = await auth.acceptInvite({
      ...body,
      userAgentLabel: userAgentLabel(req.headers['user-agent']),
    });
    bound(req, reply, res.session.token);
    setSessionCookie(reply, cookie, res.session.token);
    return { ...sessionResponse(res.session.token), recoveryCode: res.recoveryCode };
  });

  app.post('/api/auth/recover', async (req, reply): Promise<AccountResponse> => {
    guardIp(req);
    const body = RecoverRequest.parse(req.body);
    const key = `recover:${body.username.toLowerCase()}`;
    const res = await withUserLimit(key, () =>
      auth.recover({ ...body, userAgentLabel: userAgentLabel(req.headers['user-agent']) }),
    );
    bound(req, reply, res.session.token);
    setSessionCookie(reply, cookie, res.session.token);
    return { ...sessionResponse(res.session.token), recoveryCode: res.recoveryCode };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.user) auth.logout(req.user.sessionId);
    clearSessionCookie(reply, cookie);
    return reply.code(204).send();
  });

  app.post('/api/auth/logout-all', { preHandler: requireUser }, async (req, reply) => {
    auth.logoutAll(currentUser(req).userId);
    deps.onLogoutAll?.(req, currentUser(req).userId);
    clearSessionCookie(reply, cookie);
    return reply.code(204).send();
  });

  app.post('/api/auth/password', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const body = ChangePasswordRequest.parse(req.body);
    await withUserLimit(`password:${user.userId}`, () =>
      auth.changePassword({
        userId: user.userId,
        currentSessionId: user.sessionId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      }),
    );
    return reply.code(204).send();
  });

  app.get('/api/me', { preHandler: requireUser }, async (req): Promise<MeResponse> => {
    return toMe(currentUser(req));
  });
}
