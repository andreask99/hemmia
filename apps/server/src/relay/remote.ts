/**
 * Remote access through the relay ("kchat Connect", P2.12): registration, certificate and
 * tunnel, switched on and off by the admin (or HEMMIA_CONNECT=1 at start). While it is on, the
 * hub host is an allowed Host. Owned by Claude.
 */
import type http from 'node:http';
import type { RemoteStatus } from '@hemmia/shared';
import type { Config } from '../config/schema.ts';
import type { DB } from '../db/database.ts';
import {
  deleteRelayKeys,
  loadOrCreateIdentity,
  type RelayIdentity,
} from '../security/relay-identity.ts';
import { createHubCertificate, type HubCertificate } from './certificate.ts';
import {
  createRelayClient,
  RelayApiError,
  type RelayClient,
  type RelayEndpoint,
} from './client.ts';
import { createRemoteSettings } from './settings.ts';
import { createTunnelClient, type TunnelClient } from './tunnel.ts';

export interface RemoteLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface RemoteAccess {
  status(): Promise<RemoteStatus>;
  /** On: register if needed, certificate, tunnel. Resolves when connected or after `waitMs`. */
  enable(waitMs?: number): Promise<RemoteStatus>;
  disable(): Promise<RemoteStatus>;
  /** Off, unregister at the relay, delete the keys (a new address next time). */
  forget(): Promise<RemoteStatus>;
  /** The relay client while Connect is on (native push), else null. */
  relayClient(): RelayClient | null;
  /** Hosts to accept in the Host header right now. */
  hostnames(): readonly string[];
  /** Turns Connect on at start when the settings (or HEMMIA_CONNECT=1) say so. */
  startup(): void;
  close(): void;
}

export function createRemoteAccess(o: {
  config: Pick<Config, 'relayDomain' | 'relayAddress' | 'relayCa' | 'dataDir' | 'connectOnStart'>;
  db: DB;
  server: () => http.Server;
  log: RemoteLog;
  agent: string;
  now?: () => number;
  /** Tests: faster certificate polling and reconnects. */
  fast?: boolean;
}): RemoteAccess {
  const now = o.now ?? Date.now;
  const settings = createRemoteSettings(o.db, now);
  const domain = o.config.relayDomain;
  const endpoint: RelayEndpoint | null = domain
    ? { domain, address: o.config.relayAddress, ca: o.config.relayCa }
    : null;
  let identity: RelayIdentity | null = null;
  const id = () => (identity ??= loadOrCreateIdentity(o.config.dataDir));
  let client: RelayClient | null = null;
  let certificate: HubCertificate | null = null;
  let tunnel: TunnelClient | null = null;
  let hostname: string | null = null;
  let quota: { bytes: number; limitBytes: number; at: number } | null = null;
  let lastError: string | null = null;

  function parts() {
    if (!endpoint) throw new Error('relay not configured');
    client ??= createRelayClient({ endpoint, identity: id, now });
    certificate ??= createHubCertificate({
      dataDir: o.config.dataDir,
      client,
      hostname: () => hostname ?? '',
      now,
      ...(o.fast ? { pollMs: 20 } : {}),
    });
    const cert = certificate;
    tunnel ??= createTunnelClient({
      endpoint,
      identity: id,
      secureContext: () => cert.current(),
      server: o.server(),
      agent: o.agent,
      log: o.log,
      ...(o.fast ? { backoffScale: 0.01 } : {}),
    });
    return { client, certificate: cert, tunnel };
  }

  async function refreshQuota(): Promise<void> {
    if (!client || (quota && now() - quota.at < 60_000)) return;
    try {
      const self = await client.self();
      if (self) quota = { bytes: self.quota.bytes, limitBytes: self.quota.limitBytes, at: now() };
    } catch {
      // Shown as unknown; the status says why if it matters.
    }
  }

  async function status(): Promise<RemoteStatus> {
    const s = settings.get();
    const t = tunnel?.status();
    if (s.connect && t?.state === 'connected') await refreshQuota();
    const notAfter = certificate?.info()?.notAfter;
    return {
      relayConfigured: endpoint !== null,
      connect: s.connect,
      hostname: hostname ?? (s.hubId && domain ? `${s.hubId}.h.${domain}` : null),
      state: t?.state ?? (s.connect ? 'connecting' : 'off'),
      since: t?.since ?? now(),
      lastError: t?.lastError ?? lastError,
      certificate: notAfter ? { notAfter } : null,
      quota: quota ? { bytes: quota.bytes, limitBytes: quota.limitBytes } : null,
    };
  }

  async function bringUp(): Promise<void> {
    const p = parts();
    const reg = await p.client.register();
    hostname = reg.hostname;
    settings.set({
      ...settings.get(),
      hubId: reg.hubId,
      registeredAt: settings.get().registeredAt ?? now(),
      relayDomain: domain,
    });
    await p.certificate.ensure();
    p.certificate.start((err) => {
      o.log.warn(
        { err: err instanceof Error ? err.name : 'unknown' },
        'certificate renewal failed',
      );
    });
    p.tunnel.start();
    lastError = null;
  }

  /**
   * After a failed start (relay down, hub blocked) Connect stays on and tries again: 1, 2, 5, 10
   * and 15 minutes later, then every 30 minutes, until it works or the admin switches it off.
   */
  const RETRY_MINUTES = [1, 2, 5, 10, 15, 30];
  let retries = 0;
  let retryTimer: NodeJS.Timeout | null = null;
  function cancelRetry(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }
  function scheduleRetry(): void {
    if (retryTimer || !settings.get().connect) return;
    const minutes = RETRY_MINUTES[Math.min(retries, RETRY_MINUTES.length - 1)] ?? 30;
    retries++;
    retryTimer = setTimeout(
      () => {
        retryTimer = null;
        if (settings.get().connect) start().catch(() => undefined);
      },
      minutes * 60_000 * (o.fast ? 0.0001 : 1),
    );
    retryTimer.unref();
  }

  let starting: Promise<void> | null = null;
  function start(): Promise<void> {
    starting ??= bringUp()
      .then(() => {
        retries = 0;
        cancelRetry();
      })
      .catch((err: unknown) => {
        lastError =
          err instanceof RelayApiError
            ? err.code
            : err instanceof Error && 'code' in err
              ? String(err.code)
              : 'failed';
        o.log.warn({ error: lastError }, 'remote access could not start');
        scheduleRetry();
        throw err;
      })
      .finally(() => {
        starting = null;
      });
    return starting;
  }

  function stopParts(): void {
    cancelRetry();
    retries = 0;
    tunnel?.stop();
    certificate?.stop();
  }

  return {
    status,
    async enable(waitMs = 90_000) {
      if (!endpoint) throw new RelayApiError(0, 'unavailable');
      settings.set({ ...settings.get(), connect: true });
      await start().catch(() => undefined);
      const end = now() + waitMs;
      while (tunnel && tunnel.status().state === 'connecting' && now() < end) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return status();
    },
    async disable() {
      settings.set({ ...settings.get(), connect: false });
      stopParts();
      return status();
    },
    async forget() {
      settings.set({ ...settings.get(), connect: false });
      stopParts();
      if (client) await client.forget().catch(() => undefined);
      deleteRelayKeys(o.config.dataDir);
      identity = null;
      client = null;
      certificate = null;
      tunnel = null;
      hostname = null;
      quota = null;
      settings.set({ connect: false, hubId: null, registeredAt: null, relayDomain: null });
      return status();
    },
    relayClient() {
      return settings.get().connect && endpoint ? parts().client : null;
    },
    hostnames() {
      const s = settings.get();
      if (!s.connect || !domain) return [];
      const host =
        hostname ?? (s.hubId && s.relayDomain === domain ? `${s.hubId}.h.${domain}` : null);
      return host ? [host] : [];
    },
    startup() {
      if (!endpoint) return;
      const s = settings.get();
      if (!s.connect && !o.config.connectOnStart) return;
      if (!s.connect) settings.set({ ...s, connect: true });
      start().catch(() => undefined);
    },
    close() {
      stopParts();
    },
  };
}
