/**
 * Tunnel frames between hub and relay (RELAY.md §4.1–§4.2): type (1 byte), stream id (u32 BE),
 * length (u32 BE), payload. Owned by Claude.
 */
import { z } from 'zod';

export const FrameType = {
  CHALLENGE: 0x01,
  AUTH: 0x02,
  READY: 0x03,
  ERROR: 0x04,
  GOAWAY: 0x05,
  PING: 0x06,
  PONG: 0x07,
  OPEN: 0x10,
  DATA: 0x11,
  WINDOW: 0x12,
  FIN: 0x13,
  RESET: 0x14,
} as const;
export type FrameType = (typeof FrameType)[keyof typeof FrameType];

const CONNECTION_TYPES: ReadonlySet<number> = new Set([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
const STREAM_TYPES: ReadonlySet<number> = new Set([0x10, 0x11, 0x12, 0x13, 0x14]);

export const HEADER_BYTES = 9;
export const MAX_DATA_PAYLOAD = 32768;
export const MAX_CONTROL_PAYLOAD = 4096;
export const MAX_STREAM_ID = 0xffffffff;

export class ProtocolError extends Error {
  override name = 'ProtocolError';
}

export interface Frame {
  type: FrameType;
  streamId: number;
  payload: Buffer;
}

function maxPayload(type: number): number {
  return type === FrameType.DATA ? MAX_DATA_PAYLOAD : MAX_CONTROL_PAYLOAD;
}

/** Checks type, stream id and length rules; throws ProtocolError. */
function check(type: number, streamId: number, length: number): void {
  if (CONNECTION_TYPES.has(type)) {
    if (streamId !== 0) throw new ProtocolError('connection frame on a stream');
  } else if (STREAM_TYPES.has(type)) {
    if (streamId === 0) throw new ProtocolError('stream frame on stream 0');
  } else {
    throw new ProtocolError('unknown frame type');
  }
  if (length > maxPayload(type)) throw new ProtocolError('frame too large');
  if (type === FrameType.DATA && length === 0) throw new ProtocolError('empty DATA');
  if (type === FrameType.FIN && length !== 0) throw new ProtocolError('FIN with payload');
  if (type === FrameType.WINDOW && length !== 4) throw new ProtocolError('bad WINDOW');
  if ((type === FrameType.PING || type === FrameType.PONG) && length !== 8) {
    throw new ProtocolError('bad PING');
  }
}

export function encodeFrame(
  type: FrameType,
  streamId: number,
  payload: Uint8Array = new Uint8Array(0),
): Buffer {
  if (!Number.isInteger(streamId) || streamId < 0 || streamId > MAX_STREAM_ID) {
    throw new ProtocolError('bad stream id');
  }
  check(type, streamId, payload.length);
  const out = Buffer.allocUnsafe(HEADER_BYTES + payload.length);
  out.writeUInt8(type, 0);
  out.writeUInt32BE(streamId, 1);
  out.writeUInt32BE(payload.length, 5);
  out.set(payload, HEADER_BYTES);
  return out;
}

/** A frame with a JSON payload validated by its schema. */
export function encodeJsonFrame<T>(
  type: FrameType,
  streamId: number,
  schema: z.ZodType<T>,
  value: T,
): Buffer {
  return encodeFrame(type, streamId, Buffer.from(JSON.stringify(schema.parse(value)), 'utf8'));
}

/** Parses a frame's JSON payload with its schema; throws ProtocolError. */
export function decodeJson<T>(frame: Frame, schema: z.ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(frame.payload.toString('utf8'));
  } catch {
    throw new ProtocolError('bad JSON');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProtocolError('bad payload');
  return parsed.data;
}

export function encodeWindow(streamId: number, increment: number): Buffer {
  if (!Number.isInteger(increment) || increment < 1 || increment > 0x7fffffff) {
    throw new ProtocolError('bad window increment');
  }
  const p = Buffer.allocUnsafe(4);
  p.writeUInt32BE(increment, 0);
  return encodeFrame(FrameType.WINDOW, streamId, p);
}

export function decodeWindow(frame: Frame): number {
  const n = frame.payload.readUInt32BE(0);
  if (n < 1 || n > 0x7fffffff) throw new ProtocolError('bad window increment');
  return n;
}

/**
 * Streaming decoder: push bytes as they arrive, take complete frames. Throws ProtocolError on
 * the first violation (the connection must then be closed). Buffers at most one frame.
 */
export class FrameDecoder {
  #chunks: Buffer[] = [];
  #buffered = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.#chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.length));
    this.#buffered += chunk.length;
  }

  #peek(n: number): Buffer {
    if (this.#chunks.length === 1 || (this.#chunks[0]?.length ?? 0) >= n) {
      return (this.#chunks[0] ?? Buffer.alloc(0)).subarray(0, n);
    }
    const joined = Buffer.concat(this.#chunks);
    this.#chunks = [joined];
    return joined.subarray(0, n);
  }

  #take(n: number): Buffer {
    const all =
      this.#chunks.length === 1
        ? (this.#chunks[0] ?? Buffer.alloc(0))
        : Buffer.concat(this.#chunks);
    const out = Buffer.from(all.subarray(0, n));
    const rest = all.subarray(n);
    this.#chunks = rest.length > 0 ? [rest] : [];
    this.#buffered -= n;
    return out;
  }

  /** The next complete frame, or null when more bytes are needed. */
  next(): Frame | null {
    if (this.#buffered < HEADER_BYTES) return null;
    const header = this.#peek(HEADER_BYTES);
    const type = header.readUInt8(0);
    const streamId = header.readUInt32BE(1);
    const length = header.readUInt32BE(5);
    check(type, streamId, length);
    if (this.#buffered < HEADER_BYTES + length) return null;
    const bytes = this.#take(HEADER_BYTES + length);
    return { type: type as FrameType, streamId, payload: bytes.subarray(HEADER_BYTES) };
  }

  /** Bytes waiting (for tests). */
  get buffered(): number {
    return this.#buffered;
  }
}

// --- JSON payloads (RELAY.md §4.2) ---

const B64URL = /^[A-Za-z0-9_-]+$/;

export const ChallengePayload = z
  .object({ v: z.literal(1), nonce: z.string().regex(B64URL).length(43) })
  .strict();
export type ChallengePayload = z.infer<typeof ChallengePayload>;

export const AuthPayload = z
  .object({
    v: z.number().int(),
    hubId: z.string().regex(/^[0-9a-hjkmnp-tv-z]{12}$/),
    sig: z.string().regex(B64URL).max(200),
    agent: z.string().max(64),
  })
  .strict();
export type AuthPayload = z.infer<typeof AuthPayload>;

export const ReadyPayload = z
  .object({
    v: z.literal(1),
    hostname: z.string().max(253),
    maxStreams: z.number().int().min(1).max(4096),
    initialWindow: z
      .number()
      .int()
      .min(1024)
      .max(16 * 1024 * 1024),
    pingSeconds: z.number().int().min(5).max(300),
  })
  .strict();
export type ReadyPayload = z.infer<typeof ReadyPayload>;

export const TunnelErrorCode = z.enum([
  'unknown_hub',
  'blocked',
  'bad_signature',
  'bad_version',
  'timeout',
  /** The hub is older than the relay's minimum version (P2.17). */
  'outdated',
]);
export type TunnelErrorCode = z.infer<typeof TunnelErrorCode>;
export const ErrorPayload = z.object({ code: TunnelErrorCode }).strict();

export const GoawayPayload = z.object({ reason: z.enum(['shutdown', 'replaced']) }).strict();
export type GoawayPayload = z.infer<typeof GoawayPayload>;

export const OpenPayload = z
  .object({ clientIp: z.string().max(64), sni: z.string().max(253) })
  .strict();
export type OpenPayload = z.infer<typeof OpenPayload>;

export const ResetCode = z.enum(['refused', 'timeout', 'error', 'quota']);
export type ResetCode = z.infer<typeof ResetCode>;
export const ResetPayload = z.object({ code: ResetCode }).strict();

/** Tunnel defaults the relay announces in READY. */
export const TUNNEL_DEFAULTS = {
  maxStreams: 256,
  initialWindow: 262144,
  pingSeconds: 25,
  /** No frame at all for this long closes the connection. */
  deadSeconds: 60,
  /** A stream with no DATA either way for this long is reset. */
  idleStreamSeconds: 600,
  /** The hub must answer CHALLENGE within this. */
  authSeconds: 10,
} as const;

export const TUNNEL_ALPN = 'kchat-tunnel/1';
