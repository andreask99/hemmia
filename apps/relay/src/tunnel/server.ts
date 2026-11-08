/**
 * All hub tunnels of the relay: exactly one per hub (a new one replaces the old), client
 * connections routed into them, quotas and logging (RELAY.md §4, §9, §10). Owned by Claude.
 */
import type net from 'node:net';
import { hubVersionAllowed } from '@hemmia/relay-protocol';
import { getMinHubVersion } from '../admin.ts';
import type tls from 'node:tls';
import type { Logger } from 'pino';
import type { RelayDb } from '../db.ts';
import { truncateIp } from '../logger.ts';
import { type ConnectionDeps, TunnelConnection } from './connection.ts';
import { createQuota } from './quota.ts';

export interface TunnelServerDeps {
  db: RelayDb;
  relayDomain: string;
  log: Logger;
  monthlyLimitBytes: number;
  timings?: ConnectionDeps['timings'];
  now?: () => number;
}

export function createTunnelServer(deps: TunnelServerDeps) {
  const now = deps.now ?? Date.now;
  const tunnels = new Map<string, TunnelConnection>();
  const pending = new Set<TunnelConnection>();
  const quota = createQuota({ db: deps.db, limitBytes: deps.monthlyLimitBytes, now });
  const lookupStmt = deps.db.prepare<[string], { public_key: Buffer; blocked_at: number | null }>(
    'SELECT public_key, blocked_at FROM hubs WHERE id = ?',
  );
  const touch = deps.db.prepare('UPDATE hubs SET last_connected_at = ? WHERE id = ?');

  function accept(socket: tls.TLSSocket): void {
    const conn = new TunnelConnection(socket, {
      relayDomain: deps.relayDomain,
      lookup: (hubId) => {
        const row = lookupStmt.get(hubId);
        return row ? { publicKey: row.public_key, blocked: row.blocked_at !== null } : null;
      },
      minHubVersion: () => getMinHubVersion(deps.db),
      onReady: (c) => {
        pending.delete(c);
        const id = c.hubId ?? '';
        const old = tunnels.get(id);
        tunnels.set(id, c);
        old?.goaway('replaced');
        touch.run(now(), id);
        deps.log.info({ hubId: id }, 'tunnel connected');
      },
      onClose: (c) => {
        pending.delete(c);
        if (c.hubId !== null && tunnels.get(c.hubId) === c) {
          tunnels.delete(c.hubId);
          deps.log.info(
            { hubId: c.hubId, seconds: Math.round((Date.now() - c.connectedAt) / 1000) },
            'tunnel disconnected',
          );
        }
      },
      onStreamDone: (hubId, bytesIn, bytesOut, ms) => {
        quota.count(hubId, bytesIn + bytesOut);
        deps.log.debug({ hubId, bytesIn, bytesOut, ms }, 'stream closed');
      },
      ...(deps.timings ? { timings: deps.timings } : {}),
    });
    pending.add(conn);
  }

  /** A client connection for a hub host (from the SNI router). */
  function client(
    socket: net.Socket,
    hubId: string,
    sni: string,
    hello: Buffer,
    clientIp: string,
  ): void {
    const tunnel = tunnels.get(hubId);
    if (!tunnel || quota.exceeded(hubId)) {
      if (tunnel) deps.log.info({ hubId, ip: truncateIp(clientIp) }, 'quota exceeded');
      socket.destroy();
      return;
    }
    tunnel.openClient(socket, clientIp, sni, hello);
  }

  /**
   * Blocking a hub or raising the minimum version (cli.ts, another process) also ends tunnels
   * that are already connected, within a minute (security review 2026-11-07, M3).
   */
  function recheck(): void {
    const minimum = getMinHubVersion(deps.db);
    for (const [id, c] of [...tunnels]) {
      const row = lookupStmt.get(id);
      if (!row || row.blocked_at !== null) c.fail('blocked');
      else if (!hubVersionAllowed(c.agent ?? '', minimum)) c.fail('outdated');
    }
  }
  const recheckTimer = setInterval(recheck, 60_000);
  recheckTimer.unref();

  return {
    accept,
    recheck,
    client,
    isConnected: (hubId: string) => tunnels.has(hubId),
    close: (hubId: string) => {
      tunnels.get(hubId)?.close();
    },
    /** GOAWAY shutdown to every hub (the relay is stopping). */
    shutdown(): void {
      for (const c of [...tunnels.values()]) c.goaway('shutdown');
      for (const c of [...pending]) c.close();
      clearInterval(recheckTimer);
      quota.close();
    },
    count: () => tunnels.size,
    quota,
  };
}
export type TunnelServer = ReturnType<typeof createTunnelServer>;
