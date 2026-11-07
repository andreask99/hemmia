/**
 * Push handles and sends (RELAY.md §7): a hub registers a device token and gets an opaque
 * handle; sending names the handle, a kind and an opaque ref. The relay never sees chat ids or
 * content. Owned by Claude.
 */
import { randomBytes } from 'node:crypto';
import type { Logger } from 'pino';
import { hubHostname, PushHandleRequest, PushSendRequest } from '@hemmia/relay-protocol';
import type { RelayDb } from '../db.ts';
import { ApiHttpError } from '../http.ts';
import { handleHash, openToken, sealToken } from '../push/crypto.ts';
import type { PushSender } from '../push/sender.ts';
import type { Route } from './server.ts';

const MAX_HANDLES_PER_HUB = 50;
const HANDLE_IDLE_MS = 90 * 24 * 60 * 60_000;
const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;

export function pushRoutes(o: {
  db: RelayDb;
  relayDomain: string;
  dataKey: Buffer | null;
  appId: string | null;
  sender: PushSender | null;
  log: Logger;
  now?: () => number;
}): Route[] {
  const now = o.now ?? Date.now;
  const available = () => {
    if (!o.dataKey || !o.sender || !o.appId) throw new ApiHttpError(503, 'unavailable');
    return { key: o.dataKey, sender: o.sender };
  };
  const prune = () => {
    o.db.prepare('DELETE FROM push_handles WHERE last_used_at < ?').run(now() - HANDLE_IDLE_MS);
    o.db.prepare('DELETE FROM push_log WHERE at < ?').run(now() - DAY);
  };

  return [
    {
      method: 'POST',
      path: /^\/v1\/push\/handles$/,
      signed: true,
      handle(ctx) {
        const { key } = available();
        const body = PushHandleRequest.parse(ctx.json());
        if (body.appId !== o.appId) throw new ApiHttpError(400, 'bad_app');
        prune();
        const count =
          o.db
            .prepare<[string], { n: number }>(
              'SELECT COUNT(*) AS n FROM push_handles WHERE hub_id = ?',
            )
            .get(ctx.hubId)?.n ?? 0;
        if (count >= MAX_HANDLES_PER_HUB) throw new ApiHttpError(409, 'too_many');
        const handle = randomBytes(32).toString('base64url');
        const hash = handleHash(handle);
        const env = body.platform === 'ios' ? body.env : 'production';
        o.db
          .prepare(
            'INSERT INTO push_handles (handle_hash, hub_id, platform, env, token, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            hash,
            ctx.hubId,
            body.platform,
            env,
            sealToken(key, ctx.hubId, hash, body.token),
            now(),
            now(),
          );
        return { status: 201, body: { handle } };
      },
    },
    {
      method: 'DELETE',
      path: /^\/v1\/push\/handles\/([A-Za-z0-9_-]{43})$/,
      signed: true,
      handle(ctx) {
        o.db
          .prepare('DELETE FROM push_handles WHERE handle_hash = ? AND hub_id = ?')
          .run(handleHash(ctx.params[0] ?? ''), ctx.hubId);
        return { status: 204 };
      },
    },
    {
      method: 'POST',
      path: /^\/v1\/push\/send$/,
      signed: true,
      async handle(ctx) {
        const { key, sender } = available();
        const body = PushSendRequest.parse(ctx.json());
        const hash = handleHash(body.handle);
        const row = o.db
          .prepare<
            [Buffer],
            {
              hub_id: string;
              platform: 'ios' | 'android';
              env: 'production' | 'sandbox';
              token: Buffer;
            }
          >('SELECT hub_id, platform, env, token FROM push_handles WHERE handle_hash = ?')
          .get(hash);
        // Another hub's handle looks exactly like an unknown one.
        if (row?.hub_id !== ctx.hubId) throw new ApiHttpError(404, 'unknown_handle');
        const perHub =
          o.db
            .prepare<[string, number], { n: number }>(
              'SELECT COUNT(*) AS n FROM push_log WHERE hub_id = ? AND at > ?',
            )
            .get(ctx.hubId, now() - DAY)?.n ?? 0;
        const perHandle =
          o.db
            .prepare<[Buffer, number], { n: number }>(
              'SELECT COUNT(*) AS n FROM push_log WHERE handle_hash = ? AND at > ?',
            )
            .get(hash, now() - HOUR)?.n ?? 0;
        if (perHub >= 2000 || perHandle >= 60) {
          o.log.info({ hubId: ctx.hubId }, 'push rate limit');
          throw new ApiHttpError(429, 'rate_limited');
        }
        o.db
          .prepare('INSERT INTO push_log (hub_id, handle_hash, at) VALUES (?, ?, ?)')
          .run(ctx.hubId, hash, now());
        let token: string;
        try {
          token = openToken(key, ctx.hubId, hash, row.token);
        } catch {
          throw new ApiHttpError(500, 'internal');
        }
        const result = await sender.send(row.platform, row.env, token, {
          kind: body.kind,
          ref: body.ref,
          hubHost: hubHostname(ctx.hubId, o.relayDomain),
          hubId: ctx.hubId,
        });
        o.log.info({ hubId: ctx.hubId, kind: body.kind, outcome: result }, 'push');
        if (result === 'gone') {
          o.db.prepare('DELETE FROM push_handles WHERE handle_hash = ?').run(hash);
          throw new ApiHttpError(410, 'gone');
        }
        if (result === 'error') throw new ApiHttpError(502, 'provider_error');
        o.db
          .prepare('UPDATE push_handles SET last_used_at = ? WHERE handle_hash = ?')
          .run(now(), hash);
        return { status: 202 };
      },
    },
  ];
}
