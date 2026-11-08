/**
 * The control API on api.<relay-domain> (RELAY.md §5): routes, body limit, signed hub requests
 * with a replay cache. Owned by Claude.
 */
import type http from 'node:http';
import type { Logger } from 'pino';
import { MAX_API_BODY, verifyRequest } from '@hemmia/relay-protocol';
import type { RelayDb } from '../db.ts';
import { ApiHttpError, readBody, sendError, sendJson } from '../http.ts';
import { plainIp, truncateIp } from '../logger.ts';

export interface RouteContext {
  req: http.IncomingMessage;
  body: Buffer;
  clientIp: string;
  /** Set on signed routes: the verified hub. */
  hubId: string;
  params: string[];
  /** The JSON body (throws 400 bad_request when it isn't JSON). */
  json(): unknown;
}

export interface RouteResult {
  status: number;
  body?: unknown;
}

export interface Route {
  method: 'GET' | 'POST' | 'DELETE';
  /** Matched against the path without query; capture groups become `params`. */
  path: RegExp;
  signed: boolean;
  handle(ctx: RouteContext): Promise<RouteResult> | RouteResult;
}

export interface ApiDeps {
  db: RelayDb;
  relayDomain: string;
  log: Logger;
  routes: Route[];
  now?: () => number;
}

const REPLAY_WINDOW_MS = 600_000;

const MAX_SEEN = 200_000;

export function createApiHandler(deps: ApiDeps) {
  const now = deps.now ?? Date.now;
  const seen = new Map<string, number>();
  const keyStmt = deps.db.prepare<[string], { public_key: Buffer; blocked_at: number | null }>(
    'SELECT public_key, blocked_at FROM hubs WHERE id = ?',
  );

  // Signatures older than the replay window can't be accepted again (their time is too old).
  const sweep = setInterval(() => {
    const t = now();
    for (const [s, at] of seen) if (t - at > REPLAY_WINDOW_MS) seen.delete(s);
  }, 60_000);
  sweep.unref();

  function remember(signature: string): boolean {
    const t = now();
    // Keyed by the signature's bytes: base64url has more than one spelling of the same bytes.
    const key = Buffer.from(signature, 'base64url').toString('hex');
    const at = seen.get(key);
    if (at !== undefined && t - at <= REPLAY_WINDOW_MS) return false;
    // Bounded: past this many signed requests in one window, refuse rather than grow.
    if (seen.size >= MAX_SEEN) return false;
    seen.set(key, t);
    return true;
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? '/';
    const clientIp = plainIp(req.socket.remoteAddress);
    let matched: { route: Route; params: string[] } | null = null;
    let pathKnown = false;
    for (const route of deps.routes) {
      const m = route.path.exec(path);
      if (!m) continue;
      pathKnown = true;
      if (route.method !== req.method) continue;
      matched = { route, params: m.slice(1) };
      break;
    }
    if (!matched) {
      req.resume();
      sendError(res, pathKnown ? 405 : 404, pathKnown ? 'bad_request' : 'not_found');
      return;
    }
    const body = await readBody(req, MAX_API_BODY);
    let hubId = '';
    if (matched.route.signed) {
      const check = verifyRequest(
        {
          headers: req.headers,
          method: req.method ?? 'GET',
          pathWithQuery: url,
          relayDomain: deps.relayDomain,
          body,
          nowSeconds: Math.floor(now() / 1000),
        },
        (id) => keyStmt.get(id)?.public_key ?? null,
      );
      if (!check.ok || !remember(check.signature)) {
        deps.log.info({ ip: truncateIp(clientIp) }, 'signature refused');
        sendError(res, 401, 'bad_signature');
        return;
      }
      if ((keyStmt.get(check.hubId)?.blocked_at ?? null) !== null) {
        sendError(res, 403, 'blocked');
        return;
      }
      hubId = check.hubId;
    }
    const ctx: RouteContext = {
      req,
      body,
      clientIp,
      hubId,
      params: matched.params,
      json() {
        try {
          return JSON.parse(body.toString('utf8')) as unknown;
        } catch {
          throw new ApiHttpError(400, 'bad_request');
        }
      },
    };
    const result = await matched.route.handle(ctx);
    if (result.status === 204) {
      res.writeHead(204, { 'cache-control': 'no-store' });
      res.end();
    } else {
      sendJson(res, result.status, result.body);
    }
  }

  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    if ((req.headers.host ?? '').split(':')[0]?.toLowerCase() !== `api.${deps.relayDomain}`) {
      req.resume();
      sendError(res, 404, 'not_found');
      return;
    }
    handle(req, res).catch((err: unknown) => {
      if (err instanceof ApiHttpError) {
        if (!res.headersSent) sendError(res, err.status, err.code);
        return;
      }
      if (err instanceof Error && err.name === 'ZodError') {
        if (!res.headersSent) sendError(res, 400, 'bad_request');
        return;
      }
      deps.log.error({ err: err instanceof Error ? err.name : 'unknown' }, 'api error');
      if (!res.headersSent) sendError(res, 500, 'internal');
    });
  };
}
