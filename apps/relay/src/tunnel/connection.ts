/**
 * One hub's tunnel connection, relay side (RELAY.md §4.3–§4.6): challenge and authentication,
 * liveness, and the client streams it carries. Owned by Claude.
 */
import { randomBytes } from 'node:crypto';
import type net from 'node:net';
import type tls from 'node:tls';
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
  hubHostname,
  OpenPayload,
  ProtocolError,
  ReadyPayload,
  TUNNEL_DEFAULTS,
  type TunnelErrorCode,
  TunnelMux,
  verifyTunnelChallenge,
  hubVersionAllowed,
} from '@hemmia/relay-protocol';

export interface HubLookup {
  (hubId: string): { publicKey: Uint8Array; blocked: boolean } | null;
}

export interface ConnectionDeps {
  relayDomain: string;
  lookup: HubLookup;
  /** The minimum hub version for Connect, or null (P2.17). */
  minHubVersion: () => string | null;
  /** Called once authenticated; the registry replaces an older tunnel of the same hub. */
  onReady: (conn: TunnelConnection) => void;
  onClose: (conn: TunnelConnection) => void;
  /** Counts relayed DATA bytes of a stream when it ends. */
  onStreamDone: (hubId: string, bytesIn: number, bytesOut: number, ms: number) => void;
  timings?: Partial<{ authMs: number; pingMs: number; deadMs: number; idleStreamMs: number }>;
}

export class TunnelConnection {
  hubId: string | null = null;
  readonly connectedAt = Date.now();
  readonly #socket: tls.TLSSocket;
  readonly #deps: ConnectionDeps;
  readonly #decoder = new FrameDecoder();
  readonly #nonce = randomBytes(32).toString('base64url');
  readonly #mux: TunnelMux;
  #closed = false;
  #lastFrameAt = Date.now();
  readonly #timers: NodeJS.Timeout[] = [];

  constructor(socket: tls.TLSSocket, deps: ConnectionDeps) {
    this.#socket = socket;
    this.#deps = deps;
    const t = {
      authMs: TUNNEL_DEFAULTS.authSeconds * 1000,
      pingMs: TUNNEL_DEFAULTS.pingSeconds * 1000,
      deadMs: TUNNEL_DEFAULTS.deadSeconds * 1000,
      idleStreamMs: TUNNEL_DEFAULTS.idleStreamSeconds * 1000,
      ...deps.timings,
    };
    this.#mux = new TunnelMux({
      initialWindow: TUNNEL_DEFAULTS.initialWindow,
      idleMs: t.idleStreamMs,
      send: (f) => {
        if (!this.#closed) this.#socket.write(f);
      },
    });
    socket.setNoDelay(true);
    socket.on('data', (chunk: Buffer) => {
      this.#onData(chunk);
    });
    socket.on('close', () => {
      this.#teardown();
    });
    socket.on('error', () => undefined);
    this.#send(
      encodeJsonFrame(FrameType.CHALLENGE, 0, ChallengePayload, { v: 1, nonce: this.#nonce }),
    );
    this.#timers.push(
      setTimeout(() => {
        if (this.hubId === null) this.fail('timeout');
      }, t.authMs),
    );
    this.#timers.push(
      setInterval(() => {
        if (Date.now() - this.#lastFrameAt > t.deadMs) {
          this.close();
          return;
        }
        if (this.hubId !== null) this.#send(encodeFrame(FrameType.PING, 0, randomBytes(8)));
      }, t.pingMs),
    );
  }

  get streamCount(): number {
    return this.#mux.size;
  }

  #send(frame: Buffer): void {
    if (!this.#closed) this.#socket.write(frame);
  }

  #onData(chunk: Buffer): void {
    this.#lastFrameAt = Date.now();
    try {
      this.#decoder.push(chunk);
      for (let f = this.#decoder.next(); f; f = this.#decoder.next()) this.#onFrame(f);
    } catch (err) {
      if (err instanceof ProtocolError) {
        this.close();
        return;
      }
      throw err;
    }
  }

  #onFrame(f: Frame): void {
    if (this.hubId === null) {
      if (f.type !== FrameType.AUTH) throw new ProtocolError('expected AUTH');
      const auth = decodeJson(f, AuthPayload);
      if (auth.v !== 1) {
        this.fail('bad_version');
        return;
      }
      const hub = this.#deps.lookup(auth.hubId);
      if (!hub) {
        this.fail('unknown_hub');
        return;
      }
      if (
        !verifyTunnelChallenge(
          hub.publicKey,
          auth.hubId,
          this.#deps.relayDomain,
          this.#nonce,
          auth.sig,
        )
      ) {
        this.fail('bad_signature');
        return;
      }
      if (hub.blocked) {
        this.fail('blocked');
        return;
      }
      if (!hubVersionAllowed(auth.agent, this.#deps.minHubVersion())) {
        this.fail('outdated');
        return;
      }
      this.hubId = auth.hubId;
      this.#send(
        encodeJsonFrame(FrameType.READY, 0, ReadyPayload, {
          v: 1,
          hostname: hubHostname(auth.hubId, this.#deps.relayDomain),
          maxStreams: TUNNEL_DEFAULTS.maxStreams,
          initialWindow: TUNNEL_DEFAULTS.initialWindow,
          pingSeconds: TUNNEL_DEFAULTS.pingSeconds,
        }),
      );
      this.#deps.onReady(this);
      return;
    }
    switch (f.type) {
      case FrameType.PING:
        this.#send(encodeFrame(FrameType.PONG, 0, f.payload));
        return;
      case FrameType.PONG:
        return;
      case FrameType.DATA:
      case FrameType.WINDOW:
      case FrameType.FIN:
      case FrameType.RESET:
        this.#mux.handle(f);
        return;
      default:
        // CHALLENGE, READY, ERROR, GOAWAY and OPEN never come from a hub.
        throw new ProtocolError('unexpected frame from hub');
    }
  }

  /** Carries a client connection to the hub as a new stream (§4.6). */
  openClient(client: net.Socket, clientIp: string, sni: string, hello: Buffer): void {
    // The hub would reset streams beyond what READY announced; don't hold the client for it.
    if (this.#mux.size >= TUNNEL_DEFAULTS.maxStreams) {
      client.destroy();
      return;
    }
    const stream = this.#mux.create();
    const started = Date.now();
    this.#send(encodeJsonFrame(FrameType.OPEN, stream.id, OpenPayload, { clientIp, sni }));
    stream.write(hello);
    client.pipe(stream);
    stream.pipe(client);
    client.resume();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.#deps.onStreamDone(
        this.hubId ?? '',
        stream.bytesIn,
        stream.bytesOut,
        Date.now() - started,
      );
    };
    client.on('error', () => {
      stream.destroy();
    });
    client.on('close', () => {
      // A client that closed without ending its side resets the stream.
      if (!stream.writableFinished) stream.destroy();
      finish();
    });
    stream.on('error', () => {
      client.destroy();
    });
    stream.on('close', () => {
      if (!client.writableFinished) client.destroy();
      finish();
    });
  }

  /** ERROR then close (handshake failures). */
  fail(code: TunnelErrorCode): void {
    this.#send(encodeJsonFrame(FrameType.ERROR, 0, ErrorPayload, { code }));
    this.#endSoon();
  }

  goaway(reason: 'shutdown' | 'replaced'): void {
    this.#send(encodeJsonFrame(FrameType.GOAWAY, 0, GoawayPayload, { reason }));
    this.#endSoon();
  }

  /** Ends our side; a hub that doesn't close its side within a second is cut off. */
  #endSoon(): void {
    this.#socket.end();
    setTimeout(() => this.#socket.destroy(), 1000).unref();
    this.#teardown();
  }

  close(): void {
    this.#socket.destroy();
    this.#teardown();
  }

  #teardown(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const t of this.#timers) clearTimeout(t);
    this.#mux.destroyAll();
    this.#deps.onClose(this);
  }
}
