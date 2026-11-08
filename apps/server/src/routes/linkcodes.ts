/**
 * Sign-in links, device codes and redeeming any link (SECURITY.md §4). Owned by Claude.
 */
import type { FastifyInstance } from 'fastify';
import {
  CreateLinkRequest,
  type CreateLinkResponse,
  RedeemLinkRequest,
  type RedeemLinkResponse,
} from '@hemmia/shared';
import { formatDirectLink, formatShareLink, type LinkKind } from '@hemmia/relay-protocol/links';
import type { DB } from '../db/database.ts';
import type { Auth } from '../security/auth.ts';
import { wipe } from '../security/crypto.ts';
import type { Gate } from '../security/gate.ts';
import {
  type CookieSettings,
  currentUser,
  HttpError,
  requireUser,
  setSessionCookie,
} from '../security/http.ts';
import type { LinkCodes } from '../security/linkcodes.ts';
import { createRateLimiter, ipBucket } from '../security/rate-limit.ts';
import { userAgentLabel } from './auth.ts';

const FRESH_SESSION_MS = 15 * 60_000;

/** Share and direct links for a code, from the hub's current public addresses. */
export function linksFor(
  o: { relayDomain: string | null; hubHost: () => string | null; publicHost: () => string | null },
  kind: LinkKind,
  code: string,
): { shareLink: string | null; directLink: string | null } {
  const hub = o.hubHost();
  const direct = hub ?? o.publicHost();
  return {
    shareLink: hub && o.relayDomain ? formatShareLink(o.relayDomain, hub, kind, code) : null,
    directLink: direct ? formatDirectLink(direct, kind, code) : null,
  };
}

export function registerLinkRoutes(
  app: FastifyInstance,
  deps: {
    db: DB;
    auth: Auth;
    gate: Gate;
    links: LinkCodes;
    cookie: CookieSettings;
    linkAddresses: Parameters<typeof linksFor>[0];
    now?: () => number;
  },
): void {
  const now = deps.now ?? Date.now;
  const opts = deps.now ? { now: deps.now } : {};
  const perIp = createRateLimiter({ max: 10, windowMs: 15 * 60_000, ...opts });
  const perHub = createRateLimiter({ max: 100, windowMs: 60 * 60_000, ...opts });
  const passwordTries = createRateLimiter({
    max: 5,
    windowMs: 15 * 60_000,
    backoff: true,
    ...opts,
  });
  const limited = (r: { allowed: boolean; retryAfterMs: number }) => {
    if (!r.allowed)
      throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(r.retryAfterMs / 1000)));
  };
  const audit = (event: string, userId: string) => {
    deps.db
      .prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)')
      .run(userId, event, now());
  };

  app.post(
    '/api/links',
    { preHandler: requireUser },
    async (req, reply): Promise<CreateLinkResponse> => {
      const user = currentUser(req);
      const body = CreateLinkRequest.parse(req.body);
      if (body.kind === 'signin') {
        // Only a session started with the passphrase counts as fresh, not one from a sign-in
        // link: a link must not let its holder make more links (security review 2026-11-07).
        const started = deps.auth.sessionPasswordAt(user.sessionId) ?? 0;
        if (now() - started > FRESH_SESSION_MS) {
          // Asking without a passphrase (to learn whether one is needed) costs no try.
          if (!body.password) throw new HttpError(401, 'invalid_credentials');
          const key = `link-password:${user.userId}`;
          // Recorded before the slow check, so parallel requests can't pass the limit together.
          limited(passwordTries.hit(key));
          if (!(await deps.auth.verifyPassword(user.userId, body.password))) {
            throw new HttpError(401, 'invalid_credentials');
          }
          passwordTries.reset(key);
        }
        const link = deps.links.createSignin(user.userId, user.dek);
        audit('link_created', user.userId);
        void reply.code(201);
        return {
          code: link.code,
          kind: 'signin',
          expiresAt: link.expiresAt,
          ...linksFor(deps.linkAddresses, 'l', link.code),
        };
      }
      const target = body.userId ?? user.userId;
      if (target !== user.userId) {
        if (user.role !== 'admin') throw new HttpError(403, 'forbidden');
        const exists = deps.db
          .prepare('SELECT 1 FROM users WHERE id = ? AND disabled_at IS NULL')
          .get(target);
        if (!exists) throw new HttpError(404, 'not_found');
      }
      const link = deps.links.createDevice(target, user.userId);
      audit('link_created', target);
      void reply.code(201);
      return {
        code: link.code,
        kind: 'device',
        expiresAt: link.expiresAt,
        ...linksFor(deps.linkAddresses, 'd', link.code),
      };
    },
  );

  app.post('/api/links/redeem', async (req, reply): Promise<RedeemLinkResponse> => {
    limited(perIp.hit(`redeem:${ipBucket(req.ip)}`));
    // Hub-wide, only failed attempts count: guessing is what this limits, and counting every
    // attempt would let anyone lock the family out of pairing (security review 2026-11-07, M8).
    limited(perHub.check('redeem'));
    const body = RedeemLinkRequest.safeParse(req.body);
    // Every failure looks the same (SECURITY.md §9).
    const invalid = () => {
      perHub.hit('redeem');
      return new HttpError(400, 'link_invalid');
    };
    if (!body.success) throw invalid();
    const { kind, code } = body.data;
    const label = userAgentLabel(req.headers['user-agent']);

    if (kind === 'i') {
      if (!deps.auth.inviteUsable(code)) throw invalid();
      // The invite itself is used later by the invite screen; this only pairs the device.
      if (req.device === null) req.device = deps.gate.create(reply, null, label);
      return { next: 'invite' };
    }
    if (kind === 'd') {
      const r = deps.links.redeem('device', code);
      if (!r) throw invalid();
      if (req.device === null) req.device = deps.gate.create(reply, r.userId, label);
      else deps.gate.assign(req.device, r.userId);
      audit('link_redeemed', r.userId);
      return { next: 'login' };
    }
    const r = deps.links.redeem('signin', code);
    if (r?.kind !== 'signin') throw invalid();
    try {
      const session = deps.auth.sessionWithDek(r.userId, r.dek, label);
      if (!session) throw invalid();
      if (req.device === null) req.device = deps.gate.create(reply, r.userId, label);
      deps.gate.bindSession(req, reply, r.userId, session.sessionId, label);
      setSessionCookie(reply, deps.cookie, session.token);
      audit('link_redeemed', r.userId);
      return { next: 'app' };
    } finally {
      wipe(r.dek);
    }
  });
}
