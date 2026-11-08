/**
 * Streams inside a tunnel connection (RELAY.md §4.4), shared by the relay and the hub. Each
 * stream is a Duplex: writes become DATA frames within the peer's window, received DATA is
 * pushed to the reader and acknowledged with WINDOW once the reader has taken half a window.
 * FIN and RESET map to end and destroy. Owned by Claude.
 */
import { Duplex } from 'node:stream';
import {
  decodeJson,
  decodeWindow,
  encodeFrame,
  encodeJsonFrame,
  encodeWindow,
  type Frame,
  FrameType,
  MAX_DATA_PAYLOAD,
  ProtocolError,
  type ResetCode,
  ResetPayload,
} from './frames.ts';

export class StreamResetError extends Error {
  override name = 'StreamResetError';
  readonly code: ResetCode;
  constructor(code: ResetCode) {
    super(`stream reset: ${code}`);
    this.code = code;
  }
}

interface Pending {
  chunk: Buffer;
  callback: (err?: Error | null) => void;
}

export class TunnelStream extends Duplex {
  readonly id: number;
  /** Bytes of DATA in both directions (for quotas and logs). */
  bytesIn = 0;
  bytesOut = 0;
  lastActivity = Date.now();
  readonly #mux: TunnelMux;
  readonly #initialWindow: number;
  #sendWindow: number;
  /** Received since the last WINDOW we sent (the peer counts these against its window). */
  #unacked = 0;
  #pending: Pending[] = [];
  #finSent = false;
  #finReceived = false;
  #remoteReset = false;
  #finalCallback: ((err?: Error | null) => void) | null = null;

  constructor(mux: TunnelMux, id: number, initialWindow: number) {
    super({ allowHalfOpen: true, readableHighWaterMark: initialWindow });
    this.#mux = mux;
    this.id = id;
    this.#initialWindow = initialWindow;
    this.#sendWindow = initialWindow;
  }

  override _write(
    chunk: Buffer,
    _enc: BufferEncoding,
    callback: (err?: Error | null) => void,
  ): void {
    // TLS sockets over a stream (the hub's side) write empty buffers; there is nothing to send,
    // and an empty DATA frame is a protocol error.
    if (chunk.length === 0) {
      callback();
      return;
    }
    this.#pending.push({ chunk, callback });
    this.#flushSafely();
  }

  override _final(callback: (err?: Error | null) => void): void {
    this.#finalCallback = callback;
    this.#flushSafely();
  }

  /** A frame that can't be encoded ends this stream, never the process. */
  #flushSafely(): void {
    try {
      this.#flush();
    } catch (err) {
      this.destroy(err instanceof Error ? err : new Error('stream write failed'));
    }
  }

  override _read(): void {
    // The reader wants more: its buffer has room again.
    this.#credit();
  }

  override _destroy(err: Error | null, callback: (err?: Error | null) => void): void {
    const clean = this.#finSent && this.#finReceived;
    if (!clean && !this.#remoteReset) {
      const code: ResetCode = err instanceof StreamResetError ? err.code : 'error';
      this.#mux.sendFrame(encodeJsonFrame(FrameType.RESET, this.id, ResetPayload, { code }));
    }
    for (const p of this.#pending) p.callback(err ?? new Error('stream closed'));
    this.#pending = [];
    this.#mux.forget(this.id);
    callback(err);
  }

  /** Sends what the peer's window allows; completes writes as their bytes go out. */
  #flush(): void {
    while (this.#pending.length > 0 && this.#sendWindow > 0) {
      const p = this.#pending[0];
      if (!p) break;
      const n = Math.min(p.chunk.length, this.#sendWindow, MAX_DATA_PAYLOAD);
      this.#mux.sendFrame(encodeFrame(FrameType.DATA, this.id, p.chunk.subarray(0, n)));
      this.#sendWindow -= n;
      this.bytesOut += n;
      this.lastActivity = Date.now();
      if (n === p.chunk.length) {
        this.#pending.shift();
        p.callback();
      } else {
        p.chunk = p.chunk.subarray(n);
      }
    }
    if (this.#pending.length === 0 && this.#finalCallback && !this.#finSent) {
      this.#finSent = true;
      this.#mux.sendFrame(encodeFrame(FrameType.FIN, this.id));
      const cb = this.#finalCallback;
      this.#finalCallback = null;
      cb();
      if (this.#finReceived) this.destroy();
    }
  }

  /**
   * Gives the peer its window back once half a window has arrived. Called only while the
   * reader's buffer has room (after a push that returned true, or from _read), so a reader
   * that stops reading stops the sender within one window (at most two windows buffered).
   */
  #credit(): void {
    if (this.#unacked >= this.#initialWindow / 2 && !this.#finReceived && !this.destroyed) {
      this.#mux.sendFrame(encodeWindow(this.id, this.#unacked));
      this.#unacked = 0;
    }
  }

  /** @internal Called by the mux for this stream's frames. */
  receive(frame: Frame): void {
    switch (frame.type) {
      case FrameType.DATA: {
        if (this.#finReceived) throw new ProtocolError('DATA after FIN');
        this.#unacked += frame.payload.length;
        if (this.#unacked > this.#initialWindow) {
          this.destroy(new StreamResetError('error'));
          return;
        }
        this.bytesIn += frame.payload.length;
        this.lastActivity = Date.now();
        if (this.push(frame.payload)) this.#credit();
        return;
      }
      case FrameType.WINDOW: {
        // The peer can only return what it received: more would let it make us buffer
        // without limit (security review 2026-11-07, H4).
        const increment = decodeWindow(frame);
        if (this.#sendWindow + increment > this.#initialWindow) {
          this.destroy(new StreamResetError('error'));
          return;
        }
        this.#sendWindow += increment;
        this.#flushSafely();
        return;
      }
      case FrameType.FIN: {
        if (this.#finReceived) return;
        this.#finReceived = true;
        this.push(null);
        if (this.#finSent) this.destroy();
        return;
      }
      case FrameType.RESET: {
        const { code } = decodeJson(frame, ResetPayload);
        this.#remoteReset = true;
        this.destroy(new StreamResetError(code));
        return;
      }
      default:
        throw new ProtocolError('unexpected frame on a stream');
    }
  }
}

export interface MuxOptions {
  initialWindow: number;
  /** Writes a frame to the tunnel connection (no-op once it is closed). */
  send: (frame: Buffer) => void;
  /** No DATA either way for this long resets a stream, ms (0: never). */
  idleMs?: number;
}

/** The streams of one tunnel connection. */
export class TunnelMux {
  readonly #streams = new Map<number, TunnelStream>();
  readonly #options: MuxOptions;
  #idleTimer: NodeJS.Timeout | null = null;
  #nextId = 1;

  constructor(options: MuxOptions) {
    this.#options = options;
    if (options.idleMs) {
      const idleMs = options.idleMs;
      this.#idleTimer = setInterval(
        () => {
          const t = Date.now();
          for (const s of this.#streams.values()) {
            if (t - s.lastActivity >= idleMs) s.destroy(new StreamResetError('timeout'));
          }
        },
        Math.min(idleMs, 30_000),
      );
      this.#idleTimer.unref();
    }
  }

  get size(): number {
    return this.#streams.size;
  }

  sendFrame(frame: Buffer): void {
    this.#options.send(frame);
  }

  /** Relay side: a new stream with the next id. */
  create(): TunnelStream {
    const id = this.#nextId++;
    const s = new TunnelStream(this, id, this.#options.initialWindow);
    this.#streams.set(id, s);
    return s;
  }

  /** Hub side: a stream the relay opened. Ids must increase. */
  accept(id: number): TunnelStream {
    if (id < this.#nextId || this.#streams.has(id)) throw new ProtocolError('stream id reused');
    this.#nextId = id + 1;
    const s = new TunnelStream(this, id, this.#options.initialWindow);
    this.#streams.set(id, s);
    return s;
  }

  /** Dispatches a stream frame. Frames for unknown (closed) streams are ignored. */
  handle(frame: Frame): void {
    const s = this.#streams.get(frame.streamId);
    if (!s) {
      // A stream we already closed may still get frames in flight; anything else is a bug.
      if (frame.streamId >= this.#nextId) throw new ProtocolError('frame for an unopened stream');
      return;
    }
    s.receive(frame);
  }

  /** @internal */
  forget(id: number): void {
    this.#streams.delete(id);
  }

  /** Ends all streams (the connection is gone). */
  destroyAll(): void {
    if (this.#idleTimer) clearInterval(this.#idleTimer);
    this.#idleTimer = null;
    for (const s of [...this.#streams.values()]) s.destroy(new StreamResetError('error'));
    this.#streams.clear();
  }

  streams(): IterableIterator<TunnelStream> {
    return this.#streams.values();
  }
}
