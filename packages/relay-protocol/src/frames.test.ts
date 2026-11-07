import { describe, expect, it } from 'vitest';
import {
  AuthPayload,
  ChallengePayload,
  decodeJson,
  decodeWindow,
  encodeFrame,
  encodeJsonFrame,
  encodeWindow,
  type Frame,
  FrameDecoder,
  FrameType,
  ProtocolError,
} from './frames.ts';

function decodeAll(bytes: Buffer, chunk = bytes.length): Frame[] {
  const d = new FrameDecoder();
  const out: Frame[] = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    d.push(bytes.subarray(i, i + chunk));
    for (let f = d.next(); f; f = d.next()) out.push(f);
  }
  return out;
}

describe('frames', () => {
  it('round-trips every frame type, also split byte by byte', () => {
    const frames = Buffer.concat([
      encodeJsonFrame(FrameType.CHALLENGE, 0, ChallengePayload, { v: 1, nonce: 'A'.repeat(43) }),
      encodeFrame(FrameType.PING, 0, Buffer.alloc(8, 1)),
      encodeFrame(FrameType.PONG, 0, Buffer.alloc(8, 1)),
      encodeFrame(FrameType.OPEN, 7, Buffer.from('{}')),
      encodeFrame(FrameType.DATA, 7, Buffer.alloc(32768, 9)),
      encodeWindow(7, 131072),
      encodeFrame(FrameType.FIN, 7),
      encodeFrame(FrameType.RESET, 0xffffffff, Buffer.from('{"code":"error"}')),
    ]);
    for (const chunk of [frames.length, 1, 7, 4096]) {
      const out = decodeAll(frames, chunk);
      expect(out.map((f) => [f.type, f.streamId, f.payload.length])).toEqual([
        [FrameType.CHALLENGE, 0, 61],
        [FrameType.PING, 0, 8],
        [FrameType.PONG, 0, 8],
        [FrameType.OPEN, 7, 2],
        [FrameType.DATA, 7, 32768],
        [FrameType.WINDOW, 7, 4],
        [FrameType.FIN, 7, 0],
        [FrameType.RESET, 0xffffffff, 16],
      ]);
      const window = out[5];
      if (!window) throw new Error('missing');
      expect(decodeWindow(window)).toBe(131072);
    }
  });

  it('validates JSON payloads with their schema', () => {
    const f = decodeAll(
      encodeJsonFrame(FrameType.AUTH, 0, AuthPayload, {
        v: 1,
        hubId: 'zt0jr4qknd6e',
        sig: 'abc',
        agent: 'kchat/0.1.0',
      }),
    )[0];
    if (!f) throw new Error('missing');
    expect(decodeJson(f, AuthPayload).hubId).toBe('zt0jr4qknd6e');
    expect(() => decodeJson(f, ChallengePayload)).toThrow(ProtocolError);
    const bad: Frame = { type: FrameType.AUTH, streamId: 0, payload: Buffer.from('{not json') };
    expect(() => decodeJson(bad, AuthPayload)).toThrow(ProtocolError);
  });

  it.each([
    ['unknown type', Buffer.from([0x99, 0, 0, 0, 0, 0, 0, 0, 0])],
    [
      'connection frame on a stream',
      Buffer.from([0x06, 0, 0, 0, 1, 0, 0, 0, 8, 1, 2, 3, 4, 5, 6, 7, 8]),
    ],
    ['stream frame on stream 0', Buffer.from([0x11, 0, 0, 0, 0, 0, 0, 0, 1, 1])],
    ['oversized DATA', Buffer.from([0x11, 0, 0, 0, 1, 0, 0, 0x80, 0x01])],
    ['oversized control', Buffer.from([0x10, 0, 0, 0, 1, 0, 0, 0x10, 0x01])],
    ['empty DATA', Buffer.from([0x11, 0, 0, 0, 1, 0, 0, 0, 0])],
    ['FIN with payload', Buffer.from([0x13, 0, 0, 0, 1, 0, 0, 0, 1, 0])],
    ['short WINDOW', Buffer.from([0x12, 0, 0, 0, 1, 0, 0, 0, 2, 0, 1])],
    ['short PING', Buffer.from([0x06, 0, 0, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4])],
  ])('rejects %s from the header alone', (_name, bytes) => {
    const d = new FrameDecoder();
    d.push(bytes.subarray(0, 9));
    expect(() => d.next()).toThrow(ProtocolError);
  });

  it('rejects zero and oversized window increments', () => {
    expect(() => encodeWindow(1, 0)).toThrow(ProtocolError);
    expect(() => encodeWindow(1, 2 ** 31)).toThrow(ProtocolError);
    const zero: Frame = { type: FrameType.WINDOW, streamId: 1, payload: Buffer.alloc(4) };
    expect(() => decodeWindow(zero)).toThrow(ProtocolError);
  });

  it('refuses to encode invalid frames', () => {
    expect(() => encodeFrame(FrameType.DATA, 0, Buffer.alloc(1))).toThrow(ProtocolError);
    expect(() => encodeFrame(FrameType.DATA, -1, Buffer.alloc(1))).toThrow(ProtocolError);
    expect(() => encodeFrame(FrameType.DATA, 1, Buffer.alloc(32769))).toThrow(ProtocolError);
  });

  it('never throws anything but ProtocolError on random input', () => {
    let seed = 1;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let i = 0; i < 10_000; i++) {
      const len = rand() % 64;
      const buf = Buffer.alloc(len);
      for (let j = 0; j < len; j++) buf[j] = rand() & 0xff;
      // Bias towards known types so deeper checks run too.
      if (len > 0 && i % 2 === 0)
        buf[0] = [0x01, 0x06, 0x10, 0x11, 0x12, 0x13, 0x14][rand() % 7] ?? 0;
      const d = new FrameDecoder();
      d.push(buf);
      try {
        while (d.next());
      } catch (err) {
        expect(err).toBeInstanceOf(ProtocolError);
      }
    }
  });
});
