/**
 * The relay's own TLS server for api., tunnel. and join.<relay-domain> (RELAY.md §3 step 4,
 * §6). It never sees hub traffic: hub hosts are forwarded by the router as raw bytes.
 * The secure context is swapped in place on renewal.
 */
import type net from 'node:net';
import tls from 'node:tls';
import { TUNNEL_ALPN } from '@hemmia/relay-protocol';

export interface OwnTlsDeps {
  relayDomain: string;
  cert: string;
  key: string;
  api: (socket: tls.TLSSocket) => void;
  tunnel: (socket: tls.TLSSocket) => void;
  join: (socket: tls.TLSSocket) => void;
}

export function createOwnTlsServer(deps: OwnTlsDeps) {
  const server = tls.createServer({
    cert: deps.cert,
    key: deps.key,
    minVersion: 'TLSv1.2',
    ALPNProtocols: [TUNNEL_ALPN, 'http/1.1'],
    handshakeTimeout: 10_000,
  });
  server.on('tlsClientError', (_err, socket) => {
    socket.destroy();
  });
  server.on('secureConnection', (socket) => {
    socket.on('error', () => undefined);
    const name = (socket.servername || '').toLowerCase();
    if (name === `tunnel.${deps.relayDomain}`) {
      if (socket.alpnProtocol !== TUNNEL_ALPN) {
        socket.destroy();
        return;
      }
      deps.tunnel(socket);
    } else if (name === `api.${deps.relayDomain}`) {
      deps.api(socket);
    } else if (name === `join.${deps.relayDomain}`) {
      deps.join(socket);
    } else {
      socket.destroy();
    }
  });
  return {
    server,
    /** Takes a socket from the router (its ClientHello bytes already pushed back). */
    accept: (socket: net.Socket) => {
      server.emit('connection', socket);
    },
    setCertificate: (cert: string, key: string) => {
      server.setSecureContext({ cert, key, minVersion: 'TLSv1.2' });
    },
  };
}
export type OwnTls = ReturnType<typeof createOwnTlsServer>;
