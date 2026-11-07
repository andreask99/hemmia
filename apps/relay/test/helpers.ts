/** Shared test setup for the relay: config, a test CA and TLS clients. */
import { request } from 'node:http';
import tls from 'node:tls';
import { pino } from 'pino';
import { loadRelayConfig, type RelayConfig } from '../src/config.ts';

export const DOMAIN = 'relay.test';
export const silent = pino({ level: 'silent' });

export function testConfig(over: Record<string, string> = {}): RelayConfig {
  return {
    ...loadRelayConfig({
      RELAY_DOMAIN: DOMAIN,
      RELAY_DNS_PROVIDER: 'fake',
      RELAY_ACME_EMAIL: 'relay@example.test',
      RELAY_DATA_DIR: '/nonexistent',
      ...over,
    }),
    port: 0,
    host: '127.0.0.1',
    dev: null,
  };
}

/** A TLS client to the relay port with the given SNI, trusting only `ca`. */
export function connect(
  port: number,
  servername: string,
  ca: string,
  alpn: string[] = ['http/1.1'],
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host: '127.0.0.1', port, servername, ca, ALPNProtocols: alpn });
    s.once('secureConnect', () => {
      resolve(s);
    });
    s.once('error', reject);
    s.once('close', () => {
      reject(new Error('closed before handshake'));
    });
  });
}

/** Sends a raw HTTP/1.1 request over a socket and returns status and body. */
export function rawHttp(
  socket: tls.TLSSocket,
  method: string,
  path: string,
  host: string,
  headers: Record<string, string> = {},
  body = '',
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (c: string) => {
      data += c;
      const end = data.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = data.slice(0, end).split('\r\n');
      const status = Number(head[0]?.split(' ')[1]);
      const h: Record<string, string> = {};
      for (const line of head.slice(1)) {
        const i = line.indexOf(':');
        h[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
      }
      const len = Number(h['content-length'] ?? '0');
      const rest = data.slice(end + 4);
      if (rest.length >= len) resolve({ status, headers: h, body: rest.slice(0, len) });
    });
    socket.on('error', reject);
    const extra = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}\r\n`)
      .join('');
    socket.write(
      `${method} ${path} HTTP/1.1\r\nhost: ${host}\r\n${extra}content-length: ${String(Buffer.byteLength(body))}\r\nconnection: close\r\n\r\n${body}`,
    );
  });
}

/** A plain HTTP request to an API handler under test (Host set to api.<domain>). */
export function apiRequest(
  port: number,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: string; host?: string } = {},
): Promise<{
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          host: opts.host ?? `api.${DOMAIN}`,
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...opts.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: text === '' ? null : (JSON.parse(text) as unknown),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    req.end(opts.body);
  });
}
