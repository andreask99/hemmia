/** A minimal hub for relay tests: connects the tunnel, answers frames, terminates client TLS. */
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
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
  hubIdFromPublicKey,
  OpenPayload,
  publicKeyRaw,
  ReadyPayload,
  signTunnelChallenge,
  TUNNEL_ALPN,
  TunnelMux,
  type TunnelStream,
} from '@hemmia/relay-protocol';
import type { RelayDb } from '../src/db.ts';
import { DOMAIN } from './helpers.ts';

export function newHubKey(): { key: KeyObject; hubId: string; raw: Uint8Array } {
  const { privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKeyRaw(privateKey);
  return { key: privateKey, hubId: hubIdFromPublicKey(raw), raw };
}

export function registerInDb(db: RelayDb, h: { hubId: string; raw: Uint8Array }): void {
  db.prepare('INSERT INTO hubs (id, public_key, created_at, created_ip) VALUES (?, ?, 0, ?)').run(
    h.hubId,
    Buffer.from(h.raw),
    '127.0.0.0/24',
  );
}

export interface FakeHub {
  socket: tls.TLSSocket;
  frames: Frame[];
  ready: Promise<{ hostname: string } | { error: string } | { goaway: string }>;
  /** Streams the relay opened, with their OPEN payload. */
  opened: { stream: TunnelStream; clientIp: string; sni: string }[];
  onOpen: (fn: (s: TunnelStream, open: { clientIp: string; sni: string }) => void) => void;
  closed: Promise<void>;
  goaway: Promise<string>;
}

export function connectFakeHub(
  port: number,
  ca: string,
  hub: { key: KeyObject; hubId: string },
  opts: { version?: number; answerPings?: boolean; signWith?: KeyObject; agent?: string } = {},
): FakeHub {
  const socket = tls.connect({
    host: '127.0.0.1',
    port,
    servername: `tunnel.${DOMAIN}`,
    ca,
    ALPNProtocols: [TUNNEL_ALPN],
  });
  socket.on('error', () => undefined);
  const frames: Frame[] = [];
  const opened: FakeHub['opened'] = [];
  let openFn: ((s: TunnelStream, o: { clientIp: string; sni: string }) => void) | null = null;
  const mux = new TunnelMux({ initialWindow: 262144, send: (f) => socket.write(f) });
  const decoder = new FrameDecoder();
  let resolveReady: (
    v: { hostname: string } | { error: string } | { goaway: string },
  ) => void = () => undefined;
  let resolveGoaway: (v: string) => void = () => undefined;
  const ready = new Promise<{ hostname: string } | { error: string } | { goaway: string }>(
    (r) => (resolveReady = r),
  );
  const goaway = new Promise<string>((r) => (resolveGoaway = r));
  socket.on('data', (chunk: Buffer) => {
    decoder.push(chunk);
    for (let f = decoder.next(); f; f = decoder.next()) {
      frames.push(f);
      switch (f.type) {
        case FrameType.CHALLENGE: {
          const { nonce } = decodeJson(f, ChallengePayload);
          socket.write(
            encodeJsonFrame(FrameType.AUTH, 0, AuthPayload, {
              v: opts.version ?? 1,
              hubId: hub.hubId,
              sig: signTunnelChallenge(opts.signWith ?? hub.key, hub.hubId, DOMAIN, nonce),
              agent: opts.agent ?? 'fakehub/1',
            }),
          );
          break;
        }
        case FrameType.READY:
          resolveReady({ hostname: decodeJson(f, ReadyPayload).hostname });
          break;
        case FrameType.ERROR:
          resolveReady({ error: decodeJson(f, ErrorPayload).code });
          break;
        case FrameType.GOAWAY: {
          const reason = decodeJson(f, GoawayPayload).reason;
          resolveReady({ goaway: reason });
          resolveGoaway(reason);
          break;
        }
        case FrameType.PING:
          if (opts.answerPings !== false) socket.write(encodeFrame(FrameType.PONG, 0, f.payload));
          break;
        case FrameType.OPEN: {
          const o = decodeJson(f, OpenPayload);
          const s = mux.accept(f.streamId);
          opened.push({ stream: s, ...o });
          openFn?.(s, o);
          break;
        }
        default:
          mux.handle(f);
      }
    }
  });
  const closed = new Promise<void>((r) =>
    socket.on('close', () => {
      r();
    }),
  );
  return {
    socket,
    frames,
    ready,
    opened,
    onOpen: (fn) => {
      openFn = fn;
    },
    closed,
    goaway,
  };
}
