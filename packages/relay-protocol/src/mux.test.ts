import { describe, expect, it } from 'vitest';
import { encodeFrame, FrameDecoder, FrameType } from './frames.ts';
import { StreamResetError, TunnelMux, type TunnelStream } from './mux.ts';

/** Two muxes connected back to back; frames are delivered asynchronously like a socket. */
function pair(initialWindow = 1024, idleMs = 0) {
  const toB: Buffer[] = [];
  const toA: Buffer[] = [];
  let onOpen: ((s: TunnelStream) => void) | null = null;
  const a = new TunnelMux({ initialWindow, send: (f) => toB.push(f), idleMs });
  const b = new TunnelMux({ initialWindow, send: (f) => toA.push(f), idleMs });
  const decA = new FrameDecoder();
  const decB = new FrameDecoder();
  const sent = { aToB: 0 };
  const pump = () => {
    let moved = true;
    while (moved) {
      moved = false;
      for (const f of toB.splice(0)) {
        moved = true;
        sent.aToB += f.length;
        decB.push(f);
        for (let fr = decB.next(); fr; fr = decB.next()) {
          if (fr.type === FrameType.OPEN) onOpen?.(b.accept(fr.streamId));
          else b.handle(fr);
        }
      }
      for (const f of toA.splice(0)) {
        moved = true;
        decA.push(f);
        for (let fr = decA.next(); fr; fr = decA.next()) a.handle(fr);
      }
    }
  };
  const timer = setInterval(pump, 1);
  return {
    a,
    b,
    sent,
    open(): Promise<[TunnelStream, TunnelStream]> {
      return new Promise((resolve) => {
        const s = a.create();
        onOpen = (remote) => {
          resolve([s, remote]);
        };
        a.sendFrame(encodeFrame(FrameType.OPEN, s.id, Buffer.from('{}')));
      });
    },
    stop: () => {
      clearInterval(timer);
    },
  };
}

const collect = (s: TunnelStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = [];
    s.on('data', (c: Buffer) => parts.push(c));
    s.on('end', () => {
      resolve(Buffer.concat(parts));
    });
    s.on('error', reject);
  });

describe('tunnel streams', () => {
  it('carries data both ways and half-closes with FIN', async () => {
    const p = pair();
    const [relay, hub] = await p.open();
    const atHub = collect(hub);
    const atRelay = collect(relay);
    relay.end(Buffer.from('hello hub'));
    expect((await atHub).toString()).toBe('hello hub');
    // The hub can still answer after the relay finished sending.
    hub.end(Buffer.from('hello relay'));
    expect((await atRelay).toString()).toBe('hello relay');
    await new Promise((r) => setTimeout(r, 10));
    expect(relay.destroyed && hub.destroyed).toBe(true);
    expect(p.a.size + p.b.size).toBe(0);
    p.stop();
  });

  it('skips empty writes (TLS sockets make them), never sending an empty DATA frame', async () => {
    const p = pair();
    const [relay, hub] = await p.open();
    const atRelay = collect(relay);
    hub.cork();
    hub.write(Buffer.alloc(0));
    hub.write(Buffer.from('after empty'));
    hub.write(Buffer.alloc(0));
    hub.uncork();
    hub.end();
    expect((await atRelay).toString()).toBe('after empty');
    p.stop();
  });

  it('moves more than a window and never sends beyond it', async () => {
    const p = pair(1024);
    const [relay, hub] = await p.open();
    const big = Buffer.alloc(200_000, 7);
    const atHub = collect(hub);
    relay.end(big);
    const got = await atHub;
    expect(got.equals(big)).toBe(true);
    expect(relay.bytesOut).toBe(200_000);
    expect(hub.bytesIn).toBe(200_000);
    p.stop();
  });

  it('stalls the sender while the reader does not read (back-pressure)', async () => {
    const p = pair(1024);
    const [relay, hub] = await p.open();
    hub.pause();
    let done = false;
    relay.write(Buffer.alloc(10_000, 1), () => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    // Only one window crossed while nobody reads.
    expect(relay.bytesOut).toBeLessThanOrEqual(1024);
    expect(done).toBe(false);
    hub.resume();
    const finished = () => done;
    for (let i = 0; i < 100 && !finished(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(done).toBe(true);
    expect(hub.bytesIn).toBe(10_000);
    p.stop();
  });

  it('propagates RESET with its code', async () => {
    const p = pair();
    const [relay, hub] = await p.open();
    const err = new Promise<unknown>((resolve) => hub.on('error', resolve));
    relay.on('error', () => undefined);
    relay.destroy(new StreamResetError('quota'));
    const e = await err;
    expect(e).toBeInstanceOf(StreamResetError);
    expect((e as StreamResetError).code).toBe('quota');
    p.stop();
  });

  it('resets a stream whose peer sends beyond the window', async () => {
    const p = pair(1024);
    const [relay, hub] = await p.open();
    hub.pause();
    hub.on('error', () => undefined);
    const err = new Promise<unknown>((resolve) => relay.on('error', resolve));
    // Bypass flow control: raw DATA frames over the window.
    // (The first is acknowledged while the reader's buffer still has room.)
    for (let i = 0; i < 3; i++) {
      p.a.sendFrame(encodeFrame(FrameType.DATA, relay.id, Buffer.alloc(1000)));
    }
    expect(((await err) as StreamResetError).code).toBe('error');
    expect(hub.destroyed).toBe(true);
    p.stop();
  });

  it('resets idle streams', async () => {
    const p = pair(1024, 20);
    const [relay, hub] = await p.open();
    hub.on('error', () => undefined);
    const err = await new Promise<unknown>((resolve) => relay.on('error', resolve));
    expect((err as StreamResetError).code).toBe('timeout');
    p.stop();
  });

  it('refuses reused stream ids', () => {
    const m = new TunnelMux({ initialWindow: 1024, send: () => undefined });
    m.accept(3);
    expect(() => m.accept(3)).toThrow();
    expect(() => m.accept(2)).toThrow();
    expect(() => {
      m.handle({ type: FrameType.FIN, streamId: 9, payload: Buffer.alloc(0) });
    }).toThrow();
  });
});
