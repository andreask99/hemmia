/**
 * GET /v1/manifest?v=<x.y.z>&p=<mac|docker>&c=<stable|beta> (P6.7): serves the signed update
 * manifest the owner published into <dataDir>/manifest-<channel>.json and counts the check per
 * day, version, platform and channel. The client address is never stored: it only limits, in
 * memory, how often one address is counted per day. Owned by Claude.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ManifestChannel,
  ManifestEnvelope,
  ManifestPlatform,
  isVersion,
} from '@hemmia/relay-protocol';
import type { RelayDb } from '../db.ts';
import type { Route } from './server.ts';
import { createLimiter } from './ratelimit.ts';

const DAY_MS = 24 * 60 * 60_000;

export function manifestRoutes(deps: {
  db: RelayDb;
  dataDir: string;
  now?: () => number;
}): Route[] {
  const now = deps.now ?? Date.now;
  const counted = createLimiter({ max: 3, windowMs: DAY_MS, now });
  setInterval(() => {
    counted.sweep();
  }, 60 * 60_000).unref();
  const count = deps.db.prepare(
    `INSERT INTO manifest_checks (day, version, platform, channel, count) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(day, version, platform, channel) DO UPDATE SET count = count + 1`,
  );
  const cache = new Map<string, { mtimeMs: number; body: unknown }>();

  /** The published envelope for a channel, re-read when the file changes; null if none. */
  function published(channel: string): unknown {
    const file = join(deps.dataDir, `manifest-${channel}.json`);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      return null;
    }
    const hit = cache.get(channel);
    if (hit?.mtimeMs === mtimeMs) return hit.body;
    try {
      const parsed = ManifestEnvelope.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      const body = parsed.success ? parsed.data : null;
      cache.set(channel, { mtimeMs, body });
      return body;
    } catch {
      return null;
    }
  }

  return [
    {
      method: 'GET',
      path: /^\/v1\/manifest$/,
      signed: false,
      handle(ctx) {
        const q = new URL(ctx.req.url ?? '/', 'https://relay.invalid').searchParams;
        const version = q.get('v') ?? '';
        const platform = ManifestPlatform.safeParse(q.get('p'));
        const channel = ManifestChannel.safeParse(q.get('c') ?? 'stable');
        if (!isVersion(version) || !platform.success || !channel.success) {
          return { status: 400, body: { error: { code: 'bad_request' } } };
        }
        if (counted.hit(ctx.clientIp)) {
          const day = new Date(now()).toISOString().slice(0, 10);
          count.run(day, version, platform.data, channel.data);
        }
        const body = published(channel.data);
        return body
          ? { status: 200, body }
          : { status: 404, body: { error: { code: 'not_found' } } };
      },
    },
  ];
}

/** Daily counts for the owner (CLI `install-stats`): newest day first. */
export function installStats(
  db: RelayDb,
  days = 30,
  now = Date.now(),
): { day: string; version: string; platform: string; channel: string; count: number }[] {
  const since = new Date(now - days * DAY_MS).toISOString().slice(0, 10);
  return db
    .prepare<
      [string],
      { day: string; version: string; platform: string; channel: string; count: number }
    >(
      `SELECT day, version, platform, channel, count FROM manifest_checks WHERE day >= ?
       ORDER BY day DESC, count DESC`,
    )
    .all(since);
}
