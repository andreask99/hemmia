/**
 * Requests to admin-configured local model servers (LM Studio, llama.cpp, vLLM; P1.7,
 * docs/public/SECURITY.md §6.3). Owned by Claude (outbound requests from the server).
 *
 * The inverse of webfetch.ts's public-only rule: a host is allowed only when every address it
 * resolves to is loopback (127.0.0.0/8, ::1) or private (10/8, 172.16/12, 192.168/16,
 * fc00::/7). The connection uses the checked address (custom lookup), so DNS rebinding between
 * check and connect doesn't work. http or https, any port, no credentials, query or fragment in
 * the base URL, no redirects. Checked on save and on every connection.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import type { FetchLike } from '@hemmia/providers';

const local = new BlockList();
for (const [net, prefix] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  local.addSubnet(net, prefix, 'ipv4');
}
local.addSubnet('::1', 128, 'ipv6');
local.addSubnet('fc00::', 7, 'ipv6');

/** True for loopback and private-network addresses. */
export function isLocalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return local.check(address, 'ipv4');
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped?.[1]) return isLocalAddress(mapped[1]);
    const hex = /^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hex?.[1] && hex[2]) {
      const a = parseInt(hex[1], 16);
      const b = parseInt(hex[2], 16);
      return isLocalAddress(
        `${String(a >> 8)}.${String(a & 255)}.${String(b >> 8)}.${String(b & 255)}`,
      );
    }
    if (lower.startsWith('::ffff:')) return false;
    return local.check(address, 'ipv6');
  }
  return false;
}

export type LocalEngineRefusal = 'bad_url' | 'scheme' | 'credentials' | 'address' | 'redirect';

export class LocalEngineRefusedError extends Error {
  override name = 'LocalEngineRefusedError';
  readonly reason: LocalEngineRefusal;
  constructor(reason: LocalEngineRefusal) {
    super(reason);
    this.reason = reason;
  }
}

/** Validates a base URL's form and returns it normalised (no trailing slash). */
export function checkEngineUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LocalEngineRefusedError('bad_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LocalEngineRefusedError('scheme');
  }
  if (url.username || url.password) throw new LocalEngineRefusedError('credentials');
  if (url.search || url.hash || raw.includes('?') || raw.includes('#')) {
    throw new LocalEngineRefusedError('bad_url');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isLocalAddress(host)) throw new LocalEngineRefusedError('address');
  return url.href.replace(/\/+$/, '');
}

export type LookupFn = (
  hostname: string,
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const systemLookup: LookupFn = (hostname, callback) => {
  dnsLookup(hostname, { all: true }, callback);
};

/**
 * A fetch for local engines: every connection resolves the host, requires all addresses to be
 * local and connects to a checked one. Redirects are refused. Streams the response body.
 */
export function createLocalEngineFetch(options: { lookup?: LookupFn } = {}): FetchLike {
  const resolve = options.lookup ?? systemLookup;
  return (raw, init) =>
    new Promise<Response>((done, fail) => {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        fail(new LocalEngineRefusedError('bad_url'));
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        fail(new LocalEngineRefusedError('scheme'));
        return;
      }
      if (url.username || url.password) {
        fail(new LocalEngineRefusedError('credentials'));
        return;
      }
      const host = url.hostname.replace(/^\[|\]$/g, '');
      // Node skips `lookup` for IP literals, so check those here.
      if (isIP(host) && !isLocalAddress(host)) {
        fail(new LocalEngineRefusedError('address'));
        return;
      }
      const lookup = (
        hostname: string,
        opts: { all?: boolean } | number | undefined,
        callback: (
          err: NodeJS.ErrnoException | null,
          address: string | LookupAddress[],
          family?: number,
        ) => void,
      ) => {
        resolve(hostname, (err, addresses) => {
          if (err) {
            callback(err, '');
            return;
          }
          if (addresses.length === 0 || addresses.some((a) => !isLocalAddress(a.address))) {
            callback(new LocalEngineRefusedError('address'), '');
            return;
          }
          if (typeof opts === 'object' && opts.all === true) {
            callback(null, addresses);
            return;
          }
          const first = addresses[0];
          if (!first) {
            callback(new LocalEngineRefusedError('address'), '');
            return;
          }
          callback(null, first.address, first.family);
        });
      };
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((value, name) => {
        headers[name] = value;
      });
      const body = typeof init.body === 'string' ? init.body : undefined;
      if (init.body !== undefined && init.body !== null && body === undefined) {
        fail(new TypeError('local engine requests take string bodies only'));
        return;
      }
      if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        url,
        {
          method: init.method ?? 'GET',
          headers,
          lookup,
          ...(init.signal ? { signal: init.signal } : {}),
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            fail(new LocalEngineRefusedError('redirect'));
            return;
          }
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') responseHeaders.set(name, value);
          }
          const stream = Readable.toWeb(res) as ReadableStream<Uint8Array>;
          done(
            new Response(status === 204 || status === 304 ? null : stream, {
              status: status < 200 || status > 599 ? 502 : status,
              headers: responseHeaders,
            }),
          );
        },
      );
      req.on('error', fail);
      if (body !== undefined) req.write(body);
      req.end();
    });
}

/** Checks that a host name resolves only to local addresses (on save). */
export function assertResolvesLocal(
  baseUrl: string,
  lookup: LookupFn = systemLookup,
): Promise<void> {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    return isLocalAddress(host)
      ? Promise.resolve()
      : Promise.reject(new LocalEngineRefusedError('address'));
  }
  return new Promise((done, fail) => {
    lookup(host, (err, addresses) => {
      if (err || addresses.length === 0 || addresses.some((a) => !isLocalAddress(a.address))) {
        fail(new LocalEngineRefusedError('address'));
        return;
      }
      done();
    });
  });
}
