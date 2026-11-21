/**
 * POST /v1/feedback: questions and feedback from people installing Hemmia, sent from the
 * website's guides (a cross-origin form, as text/plain so no preflight is needed) or forwarded by
 * a hub from its setup screens. Stored for the owner to read (CLI `feedback`, the daily digest
 * on the owner's Mac) and deleted after 12 months (retention.ts). No IP address is stored: it
 * only limits, in memory, how often one address can write. Owned by Claude.
 */
import { FeedbackRequest } from '@hemmia/relay-protocol';
import type { RelayDb } from '../db.ts';
import { createLimiter } from './ratelimit.ts';
import type { Route } from './server.ts';

const HOUR_MS = 60 * 60_000;

export function feedbackRoutes(deps: {
  db: RelayDb;
  relayDomain: string;
  now?: () => number;
}): Route[] {
  const now = deps.now ?? Date.now;
  const perAddress = createLimiter({ max: 5, windowMs: HOUR_MS, now });
  // A ceiling for everyone together, so a flood can't fill the disk.
  const overall = createLimiter({ max: 500, windowMs: 24 * HOUR_MS, now });
  setInterval(() => {
    perAddress.sweep();
    overall.sweep();
  }, HOUR_MS).unref();
  const origins = new Set([`https://${deps.relayDomain}`, `https://www.${deps.relayDomain}`]);
  const insert = deps.db.prepare(
    `INSERT INTO feedback (created_at, source, lang, page, version, email, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  return [
    {
      method: 'POST',
      path: /^\/v1\/feedback$/,
      signed: false,
      handle(ctx) {
        const origin = ctx.req.headers.origin;
        const headers: Record<string, string> =
          typeof origin === 'string' && origins.has(origin)
            ? { 'access-control-allow-origin': origin, vary: 'Origin' }
            : { vary: 'Origin' };
        // A browser on another site may not post here (the hub posts without an Origin).
        if (typeof origin === 'string' && !origins.has(origin)) {
          return { status: 403, body: { error: { code: 'bad_request' } }, headers };
        }
        if (!perAddress.allows(ctx.clientIp) || !overall.allows('all')) {
          return { status: 429, body: { error: { code: 'rate_limited' } }, headers };
        }
        const parsed = FeedbackRequest.safeParse(ctx.json());
        if (!parsed.success) {
          return { status: 400, body: { error: { code: 'bad_request' } }, headers };
        }
        perAddress.hit(ctx.clientIp);
        overall.hit('all');
        const f = parsed.data;
        if (!f.website) {
          insert.run(
            now(),
            f.source,
            f.lang,
            f.page ?? null,
            f.version ?? null,
            f.email ? f.email : null,
            f.message,
          );
        }
        return { status: 204, headers };
      },
    },
  ];
}

export interface FeedbackRow {
  id: number;
  createdAt: number;
  source: string;
  lang: string;
  page: string | null;
  version: string | null;
  email: string | null;
  message: string;
}

/** Feedback after an id (the digest remembers the last one it sent), oldest first. */
export function feedbackSince(db: RelayDb, afterId = 0, limit = 500): FeedbackRow[] {
  return db
    .prepare<
      [number, number],
      {
        id: number;
        created_at: number;
        source: string;
        lang: string;
        page: string | null;
        version: string | null;
        email: string | null;
        message: string;
      }
    >(
      `SELECT id, created_at, source, lang, page, version, email, message FROM feedback
       WHERE id > ? ORDER BY id LIMIT ?`,
    )
    .all(afterId, limit)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source,
      lang: r.lang,
      page: r.page,
      version: r.version,
      email: r.email,
      message: r.message,
    }));
}
