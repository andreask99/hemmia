/**
 * Hub registration and self-service (RELAY.md §5.2). Owned by Claude.
 */
import {
  hubHostname,
  RegisterRequest,
  type RegisterResponse,
  type HubSelfResponse,
  verifyRegistration,
} from '@hemmia/relay-protocol';
import type { Logger } from 'pino';
import { monthUtc, type RelayDb } from '../db.ts';
import { ApiHttpError } from '../http.ts';
import { truncateIp } from '../logger.ts';
import { createLimiter } from './ratelimit.ts';
import type { Route } from './server.ts';

export interface HubRouteDeps {
  db: RelayDb;
  relayDomain: string;
  monthlyLimitBytes: number;
  log: Logger;
  isConnected: (hubId: string) => boolean;
  closeTunnel: (hubId: string) => void;
  now?: () => number;
}

const DAY = 24 * 60 * 60_000;

export function hubRoutes(deps: HubRouteDeps): Route[] {
  const now = deps.now ?? Date.now;
  const perIp = createLimiter({ max: 5, windowMs: DAY, now });
  const total = createLimiter({ max: 1000, windowMs: DAY, now });
  const byId = deps.db.prepare<[string], { public_key: Buffer; blocked_at: number | null }>(
    'SELECT public_key, blocked_at FROM hubs WHERE id = ?',
  );
  const byKey = deps.db.prepare<[Buffer], { id: string; blocked_at: number | null }>(
    'SELECT id, blocked_at FROM hubs WHERE public_key = ?',
  );
  const insert = deps.db.prepare(
    'INSERT INTO hubs (id, public_key, created_at, created_ip) VALUES (?, ?, ?, ?)',
  );
  const usage = deps.db.prepare<[string, string], { bytes: number }>(
    'SELECT bytes FROM usage WHERE hub_id = ? AND month = ?',
  );

  const info = (hubId: string): RegisterResponse => ({
    hubId,
    hostname: hubHostname(hubId, deps.relayDomain),
    tunnelHost: `tunnel.${deps.relayDomain}`,
    apiHost: `api.${deps.relayDomain}`,
  });

  return [
    {
      method: 'POST',
      path: /^\/v1\/hubs$/,
      signed: false,
      handle(ctx) {
        const body = RegisterRequest.parse(ctx.json());
        const check = verifyRegistration(body, Math.floor(now() / 1000));
        if (!check.ok) {
          throw new ApiHttpError(
            check.reason === 'bad_signature' ? 401 : 400,
            check.reason === 'bad_signature' ? 'bad_signature' : 'bad_request',
          );
        }
        const key = Buffer.from(check.publicKey);
        const existing = byKey.get(key);
        if (existing) {
          if (existing.blocked_at !== null) throw new ApiHttpError(403, 'blocked');
          return { status: 200, body: info(existing.id) };
        }
        const taken = byId.get(check.hubId);
        if (taken) throw new ApiHttpError(409, 'hub_id_taken');
        const ip = truncateIp(ctx.clientIp);
        if (!perIp.allows(ip) || !total.allows('all')) {
          deps.log.info({ ip }, 'registration rate limit');
          throw new ApiHttpError(429, 'rate_limited');
        }
        perIp.hit(ip);
        total.hit('all');
        insert.run(check.hubId, key, now(), ip);
        deps.log.info({ hubId: check.hubId, ip }, 'hub registered');
        return { status: 201, body: info(check.hubId) };
      },
    },
    {
      method: 'GET',
      path: /^\/v1\/hubs\/self$/,
      signed: true,
      handle(ctx): { status: number; body: HubSelfResponse } {
        const month = monthUtc(now());
        return {
          status: 200,
          body: {
            ...info(ctx.hubId),
            connected: deps.isConnected(ctx.hubId),
            quota: {
              month,
              bytes: usage.get(ctx.hubId, month)?.bytes ?? 0,
              limitBytes: deps.monthlyLimitBytes,
            },
            blocked: false,
          },
        };
      },
    },
    {
      method: 'DELETE',
      path: /^\/v1\/hubs\/self$/,
      signed: true,
      handle(ctx) {
        deps.db.transaction(() => {
          deps.db.prepare('DELETE FROM usage WHERE hub_id = ?').run(ctx.hubId);
          deps.db.prepare('DELETE FROM hubs WHERE id = ?').run(ctx.hubId);
        })();
        deps.closeTunnel(ctx.hubId);
        deps.log.info({ hubId: ctx.hubId }, 'hub deleted');
        return { status: 204 };
      },
    },
  ];
}
