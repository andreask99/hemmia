/**
 * Puts the relay together: database, SNI router on the public port, the relay's own TLS
 * server, and the modules behind it (control API, tunnels, join page). `startRelay` is used by
 * main.ts and by the tests (with fakes injected).
 */
import http from 'node:http';
import net from 'node:net';
import type { Logger } from 'pino';
import type { RelayConfig } from './config.ts';
import { openDb, type RelayDb } from './db.ts';
import { createApiHandler, type Route } from './api/server.ts';
import { hubRoutes } from './api/hubs.ts';
import { pruneRelay } from './retention.ts';
import { manifestRoutes } from './api/manifest.ts';
import { certificateRoutes } from './api/certificates.ts';
import { pushRoutes } from './api/push.ts';
import type { PushSender } from './push/sender.ts';
import { createOrderQueue, type Issuer, type OrderQueue } from './acme/queue.ts';
import { createJoinHandler } from './join/server.ts';
import { createLogger } from './logger.ts';
import { createSniRouter, type RouterLimits } from './router.ts';
import { createOwnTlsServer, type OwnTls } from './tls/own.ts';
import type { ConnectionDeps } from './tunnel/connection.ts';
import { createTunnelServer, type TunnelServer } from './tunnel/server.ts';

export interface RelayDeps {
  db?: RelayDb;
  log?: Logger;
  now?: () => number;
  /** The relay's own certificate (dev files, or from ACME in production). */
  tls: { cert: string; key: string };
  limits?: Partial<RouterLimits>;
  timings?: ConnectionDeps['timings'];
  /** Issues hub certificates (ACME); without it the certificate routes answer 503. */
  issuer?: Issuer;
  /** Delivers push to Apple/Google; without it the push routes answer 503. */
  pushSender?: PushSender;
}

export interface Relay {
  port: number;
  db: RelayDb;
  tunnels: TunnelServer;
  orders: OrderQueue | null;
  ownTls: OwnTls;
  close(): Promise<void>;
}

export async function startRelay(config: RelayConfig, deps: RelayDeps): Promise<Relay> {
  const log = deps.log ?? createLogger(config.logLevel);
  const db = deps.db ?? openDb(config.dataDir);
  for (const what of config.disabled) log.warn(`off: ${what}`);

  const now = deps.now ?? Date.now;
  const tunnels = createTunnelServer({
    db,
    relayDomain: config.domain,
    log,
    monthlyLimitBytes: config.monthlyLimitBytes,
    now,
    ...(deps.timings ? { timings: deps.timings } : {}),
  });
  // Deletion periods from the privacy policy (retention.ts), hourly and once at start.
  pruneRelay(db, now());
  const retention = setInterval(() => {
    const r = pruneRelay(db, now());
    if (r.hubs > 0) log.info({ hubs: r.hubs }, 'idle hubs deleted');
  }, 60 * 60_000);
  retention.unref();
  const orders = deps.issuer ? createOrderQueue({ db, issuer: deps.issuer, log, now }) : null;
  const routes: Route[] = [
    {
      method: 'GET',
      path: /^\/v1\/health$/,
      signed: false,
      handle: () => ({ status: 200, body: { status: 'ok' } }),
    },
    ...certificateRoutes({ db, relayDomain: config.domain, queue: orders, now }),
    ...manifestRoutes({ db, dataDir: config.dataDir, now }),
    ...pushRoutes({
      db,
      relayDomain: config.domain,
      dataKey: config.dataKey,
      appId: config.appId,
      sender: deps.pushSender ?? null,
      log,
      now,
    }),
    ...hubRoutes({
      db,
      relayDomain: config.domain,
      monthlyLimitBytes: config.monthlyLimitBytes,
      log,
      isConnected: (id) => tunnels.isConnected(id),
      closeTunnel: (id) => {
        tunnels.close(id);
      },
      now,
    }),
  ];
  const api = http.createServer(
    createApiHandler({ db, relayDomain: config.domain, log, routes, now }),
  );
  api.keepAliveTimeout = 30_000;
  api.headersTimeout = 15_000;
  api.requestTimeout = 30_000;

  const join = http.createServer(
    createJoinHandler({
      relayDomain: config.domain,
      appId: config.appId,
      teamId: config.join.teamId,
      androidCertSha256: config.join.androidCertSha256,
      appStoreUrl: config.join.appStoreUrl,
      playStoreUrl: config.join.playStoreUrl,
    }),
  );

  const ownTls = createOwnTlsServer({
    relayDomain: config.domain,
    cert: deps.tls.cert,
    key: deps.tls.key,
    api: (s) => api.emit('connection', s),
    join: (s) => join.emit('connection', s),
    tunnel: (s) => {
      tunnels.accept(s);
    },
  });

  const router = createSniRouter({
    relayDomain: config.domain,
    own: (s) => {
      ownTls.accept(s);
    },
    hub: (s, hubId, sni, hello, clientIp) => {
      tunnels.client(s, hubId, sni, hello, clientIp);
    },
    log,
    ...(deps.limits ? { limits: deps.limits } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });

  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    router.handle(socket);
  });
  server.maxConnections = 20_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  log.info({ port }, 'relay listening');

  return {
    port,
    db,
    tunnels,
    orders,
    ownTls,
    async close() {
      clearInterval(retention);
      router.close();
      tunnels.shutdown();
      const closed = new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      // Existing connections are cut on shutdown.
      for (const s of sockets) s.destroy();
      await closed;
      if (!deps.db) db.close();
    },
  };
}
