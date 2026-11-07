/**
 * The hub's tunnel to the relay (RELAY.md §4.3–§4.5, §4.7): one outbound TLS connection,
 * authenticated with the hub identity, carrying client connections as streams. Each stream gets
 * a TLS server socket with the hub's own certificate (TLS ends here, not at the relay), is
 * marked "via relay" and handed to the HTTP server. Reconnects with backoff. Owned by Claude.
 */
import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import { isIP } from 'node:net';
import tls from 'node:tls';
import {
  AuthPayload,
  ChallengePayload,
  decodeJson,
  encodeFrame,
  encodeJsonFrame,
  ErrorPayload,
  type Frame,
  FrameDecoder,
  FrameType,
  GoawayPayload,
  OpenPayload,
  ProtocolError,
  ReadyPayload,
  signTunnelChallenge,
  StreamResetError,
  TUNNEL_ALPN,
  TUNNEL_DEFAULTS,
  TunnelMux,
  type TunnelStream,
} from '@hemmia/relay-protocol';
import { markViaRelay } from '../security/viarelay.ts';
import type { RelayIdentity } from '../security/relay-identity.ts';
import { type RelayEndpoint, relayTrust } from './client.ts';

export type TunnelState = 'off' | 'connecting' | 'connected' | 'blocked' | 'error';

export interface TunnelStatus {
  state: TunnelState;
  since: number;
  lastError?: string;
}

/** A client address the hub can trust for rate limits; odd ones share one bucket. */
export function safeClientIp(ip: string): string {
  const v = isIP(ip);
  if (v === 0) return '192.0.2.1';
  const lower = ip.toLowerCase();
  // IPv4-mapped forms (::ffff:127.0.0.1) are judged by their IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return safeClientIp(mapped[1]) === mapped[1] ? ip : '192.0.2.1';
  if (lower.startsWith('::ffff:')) return '192.0.2.1';
  if (v === 4 && (ip.startsWith('127.') || ip.startsWith('0.') || ip.startsWith('169.254.'))) {
    return '192.0.2.1';
  }
  if (v === 6 && (lower === '::1' || lower === '::' || lower.startsWith('fe80:')))
    return '192.0.2.1';
  return ip;
}

const BACKOFF_S = [1, 2, 4, 8, 16, 32, 60];

export interface TunnelClientOptions {
  endpoint: RelayEndpoint;
  identity: () => RelayIdentity;
  /** The hub's current certificate (null while it has none). */
  secureContext: () => tls.SecureContext | null;
  /** Where decrypted client connections go (the Fastify HTTP server). */
  server: http.Server;
  agent: string;
  onStatus?: (s: TunnelStatus) => void;
  log?: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void };
  /** Tests: shorter delays. */
  backoffScale?: number;
  random?: () => number;
}

export function createTunnelClient(o: TunnelClientOptions) {
  const random = o.random ?? Math.random;
  const scale = o.backoffScale ?? 1;
  let status: TunnelStatus = { state: 'off', since: Date.now() };
  let socket: tls.TLSSocket | null = null;
  let mux: TunnelMux | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let pingTimer: NodeJS.Timeout | null = null;
  let attempt = 0;
  let wanted = false;
  let readyAt = 0;

  const setStatus = (state: TunnelState, lastError?: string) => {
    if (status.state === state && status.lastError === lastError) return;
    status = { state, since: Date.now(), ...(lastError ? { lastError } : {}) };
    o.onStatus?.(status);
  };

  function scheduleRetry(fixedMs?: number): void {
    if (!wanted || retryTimer) return;
    const base = BACKOFF_S[Math.min(attempt, BACKOFF_S.length - 1)] ?? 60;
    attempt++;
    const jitter = 1 + (random() * 0.4 - 0.2);
    const ms = fixedMs ?? base * 1000 * jitter * scale;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, ms);
    retryTimer.unref();
  }

  function cleanup(): void {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    mux?.destroyAll();
    mux = null;
    const s = socket;
    socket = null;
    s?.destroy();
  }

  function onOpen(frame: Frame, m: TunnelMux, maxStreams: number): void {
    const open = decodeJson(frame, OpenPayload);
    const stream: TunnelStream = m.accept(frame.streamId);
    const ctx = o.secureContext();
    if (m.size > maxStreams || !ctx) {
      stream.destroy(new StreamResetError('refused'));
      return;
    }
    stream.on('error', () => undefined);
    const clientIp = safeClientIp(open.clientIp);
    const tlsSocket = new tls.TLSSocket(stream, {
      isServer: true,
      secureContext: ctx,
      ALPNProtocols: ['http/1.1'],
    });
    tlsSocket.on('error', () => {
      stream.destroy();
    });
    markViaRelay(tlsSocket);
    Object.defineProperty(tlsSocket, 'remoteAddress', { value: clientIp });
    o.server.emit('connection', tlsSocket);
  }

  function connect(): void {
    if (!wanted) return;
    setStatus('connecting', status.lastError);
    const domain = o.endpoint.domain;
    const ca = relayTrust(o.endpoint);
    const s = tls.connect({
      host: o.endpoint.address?.host ?? `tunnel.${domain}`,
      port: o.endpoint.address?.port ?? 443,
      servername: `tunnel.${domain}`,
      ALPNProtocols: [TUNNEL_ALPN],
      minVersion: 'TLSv1.2',
      ...(ca ? { ca } : {}),
    });
    socket = s;
    const decoder = new FrameDecoder();
    let lastFrame = Date.now();
    let authed = false;
    let maxStreams: number = TUNNEL_DEFAULTS.maxStreams;
    let closedReason: { retry: boolean; delayMs?: number; error?: string; blocked?: boolean } = {
      retry: true,
    };
    const send = (f: Buffer) => {
      if (socket === s && !s.destroyed) s.write(f);
    };

    s.setNoDelay(true);
    s.on('secureConnect', () => {
      if (s.alpnProtocol !== TUNNEL_ALPN) s.destroy();
    });
    s.on('data', (chunk: Buffer) => {
      lastFrame = Date.now();
      try {
        decoder.push(chunk);
        for (let f = decoder.next(); f; f = decoder.next()) {
          if (!authed) {
            if (f.type === FrameType.CHALLENGE) {
              const { nonce } = decodeJson(f, ChallengePayload);
              const id = o.identity();
              send(
                encodeJsonFrame(FrameType.AUTH, 0, AuthPayload, {
                  v: 1,
                  hubId: id.hubId,
                  sig: signTunnelChallenge(id.key, id.hubId, domain, nonce),
                  agent: o.agent.slice(0, 64),
                }),
              );
            } else if (f.type === FrameType.READY) {
              const ready = decodeJson(f, ReadyPayload);
              authed = true;
              readyAt = Date.now();
              maxStreams = ready.maxStreams;
              mux = new TunnelMux({
                initialWindow: ready.initialWindow,
                idleMs: TUNNEL_DEFAULTS.idleStreamSeconds * 1000,
                send,
              });
              pingTimer = setInterval(() => {
                if (Date.now() - lastFrame > TUNNEL_DEFAULTS.deadSeconds * 1000) {
                  s.destroy();
                  return;
                }
                send(encodeFrame(FrameType.PING, 0, randomBytes(8)));
              }, ready.pingSeconds * 1000);
              pingTimer.unref();
              setStatus('connected');
              o.log?.info({}, 'relay tunnel connected');
            } else if (f.type === FrameType.ERROR) {
              const { code } = decodeJson(f, ErrorPayload);
              closedReason =
                code === 'blocked' || code === 'unknown_hub' || code === 'outdated'
                  ? { retry: false, error: code, blocked: code === 'blocked' }
                  : { retry: true, error: code };
              s.destroy();
              return;
            } else {
              throw new ProtocolError('unexpected frame before READY');
            }
            continue;
          }
          const m = mux;
          if (!m) return;
          switch (f.type) {
            case FrameType.PING:
              send(encodeFrame(FrameType.PONG, 0, f.payload));
              break;
            case FrameType.PONG:
              break;
            case FrameType.OPEN:
              onOpen(f, m, maxStreams);
              break;
            case FrameType.GOAWAY: {
              const { reason } = decodeJson(f, GoawayPayload);
              closedReason =
                reason === 'shutdown'
                  ? { retry: true, delayMs: (1 + random() * 4) * 1000 * scale }
                  : { retry: true, error: 'replaced' };
              s.destroy();
              return;
            }
            case FrameType.DATA:
            case FrameType.WINDOW:
            case FrameType.FIN:
            case FrameType.RESET:
              m.handle(f);
              break;
            default:
              throw new ProtocolError('unexpected frame from relay');
          }
        }
      } catch (err) {
        if (!(err instanceof ProtocolError)) throw err;
        closedReason = { retry: true, error: 'protocol' };
        s.destroy();
      }
    });
    s.on('error', (err: Error) => {
      closedReason = { ...closedReason, error: closedReason.error ?? err.name };
    });
    s.on('close', () => {
      if (socket !== s) return;
      cleanup();
      if (!wanted) {
        setStatus('off');
        return;
      }
      if (readyAt && Date.now() - readyAt > 60_000) attempt = 0;
      readyAt = 0;
      if (!closedReason.retry) {
        setStatus(closedReason.blocked ? 'blocked' : 'error', closedReason.error);
        o.log?.warn({ code: closedReason.error }, 'relay refused the hub');
        return;
      }
      setStatus('connecting', closedReason.error ?? 'disconnected');
      scheduleRetry(closedReason.delayMs);
    });
  }

  return {
    start(): void {
      if (wanted) return;
      wanted = true;
      attempt = 0;
      connect();
    },
    stop(): void {
      wanted = false;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      cleanup();
      setStatus('off');
    },
    status: () => status,
  };
}
export type TunnelClient = ReturnType<typeof createTunnelClient>;
