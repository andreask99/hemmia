import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@hemmia/shared';
import { parseSse, streamEvents } from './stream.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseSse', () => {
  it('parses complete blocks and keeps the rest', () => {
    const { events, rest } = parseSse(
      'event: token\ndata: {"type":"token","text":"Hi"}\n\n: ping\n\nevent: token\ndata: {"type":"tok',
    );
    expect(events).toEqual([{ type: 'token', text: 'Hi' }]);
    expect(rest).toBe('event: token\ndata: {"type":"tok');
  });

  it('rejects events that are not in the contract', () => {
    expect(() => parseSse('data: {"type":"evil"}\n\n')).toThrow();
  });
});

describe('streamEvents', () => {
  function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
  }

  it('yields events across chunk boundaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            streamOf([
              'event: started\ndata: {"type":"started","jobId":"j1","userMessageId":"m1"}\n\nevent: tok',
              'en\ndata: {"type":"token","text":"Hallo"}\n',
              '\n',
            ]),
            { status: 200, headers: { 'content-type': 'text/event-stream' } },
          ),
        ),
      ),
    );
    const out: StreamEvent[] = [];
    for await (const e of streamEvents('/chats/c1/messages', { content: 'x' })) out.push(e);
    expect(out.map((e) => e.type)).toEqual(['started', 'token']);
  });

  it('throws ApiError for error responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'busy' } }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    const it = streamEvents('/chats/c1/messages', { content: 'x' });
    await expect(it.next()).rejects.toMatchObject({ status: 409, code: 'busy' });
  });
});
