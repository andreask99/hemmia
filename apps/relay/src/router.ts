/**
 * The relay's port 443 (RELAY.md §3): reads the ClientHello's server name without terminating
 * TLS, then hands the connection to the relay's own TLS server (api., tunnel., join.) or into
 * a hub's tunnel (<hub-id>.h.). Everything else is dropped. Owned by Claude.
 */
import type net from 'node:net';
import type { Logger } from 'pino';
import { hubIdOfHost, MAX_CLIENT_HELLO_BYTES, parseClientHelloSni } from '@hemmia/relay-protocol';
import { plainIp, truncateIp } from './logger.ts';

export interface RouterLimits {
  perIpConcurrent: number;
  perIpPerMinute: number;
  helloTimeoutMs: number;
}

export const DEFAULT_LIMITS: RouterLimits = {
  perIpConcurrent: 64,
  perIpPerMinute: 120,
  helloTimeoutMs: 5000,
};

export interface RouterDeps {
  relayDomain: string;
  /** api., tunnel. and join.: the buffered bytes are already pushed back into the socket. */
  own: (socket: net.Socket) => void;
  /** A hub host: the ClientHello bytes read so far go first into the tunnel stream. */
  hub: (socket: net.Socket, hubId: string, sni: string, hello: Buffer, clientIp: string) => void;
  log: Logger;
  limits?: Partial<RouterLimits>;
  now?: () => number;
}

/**
 * The key the per-client limits count under: the address for IPv4, the /64 network for IPv6
 * (one home connection gets a whole /64 and could otherwise rotate addresses).
 */
export function limitKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [head = '', tail] = ip.toLowerCase().split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export function createSniRouter(deps: RouterDeps) {
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const now = deps.now ?? Date.now;
  const ownHosts = new Set(['api', 'tunnel', 'join'].map((h) => `${h}.${deps.relayDomain}`));
  const open = new Map<string, number>();
  const recent = new Map<string, { windowStart: number; count: number }>();

  function admit(ip: string): boolean {
    const t = now();
    const r = recent.get(ip);
    if (!r || t - r.windowStart >= 60_000) recent.set(ip, { windowStart: t, count: 1 });
    else if (++r.count > limits.perIpPerMinute) return false;
    const n = open.get(ip) ?? 0;
    if (n >= limits.perIpConcurrent) return false;
    open.set(ip, n + 1);
    return true;
  }

  function release(ip: string): void {
    const n = (open.get(ip) ?? 1) - 1;
    if (n <= 0) open.delete(ip);
    else open.set(ip, n);
  }

  // Forget old rate windows now and then.
  const sweep = setInterval(() => {
    const t = now();
    for (const [ip, r] of recent) if (t - r.windowStart >= 60_000) recent.delete(ip);
  }, 60_000);
  sweep.unref();

  function handle(socket: net.Socket): void {
    const ip = plainIp(socket.remoteAddress);
    const key = limitKey(ip);
    if (!admit(key)) {
      deps.log.info({ ip: truncateIp(ip) }, 'connection limit');
      socket.destroy();
      return;
    }
    socket.once('close', () => {
      release(key);
    });
    socket.on('error', () => undefined);
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => socket.destroy(), limits.helloTimeoutMs);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const r = parseClientHelloSni(buf);
      if ('need' in r && buf.length <= MAX_CLIENT_HELLO_BYTES + 20) return;
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.pause();
      if (!('sni' in r)) {
        socket.destroy();
        return;
      }
      if (ownHosts.has(r.sni)) {
        socket.unshift(buf);
        deps.own(socket);
        return;
      }
      const hubId = hubIdOfHost(r.sni, deps.relayDomain);
      if (hubId === null) {
        socket.destroy();
        return;
      }
      deps.hub(socket, hubId, r.sni, buf, ip);
    };
    socket.on('data', onData);
  }

  return {
    handle,
    close: () => {
      clearInterval(sweep);
    },
    /** Open connections per client address (tests). */
    openCount: (ip: string) => open.get(limitKey(ip)) ?? 0,
  };
}
export type SniRouter = ReturnType<typeof createSniRouter>;
