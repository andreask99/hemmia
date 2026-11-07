import { describe, expect, it } from 'vitest';
import {
  chatCompletions,
  type ChatCompletionsRequest,
  toChatCompletions,
} from './chatcompletions.ts';
import type { FetchLike } from './cloudhttp.ts';
import { type ChatChunk, LlmError } from './types.ts';

function sse(...events: unknown[]): string {
  return events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
}

function fakeFetch(
  body: string | (() => ReadableStream<Uint8Array>),
  status = 200,
): { fetch: FetchLike; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      const stream =
        typeof body === 'string'
          ? new ReadableStream<Uint8Array>({
              start(c) {
                // Split mid-line to exercise buffering.
                const bytes = new TextEncoder().encode(body);
                const half = Math.floor(bytes.length / 2);
                c.enqueue(bytes.slice(0, half));
                c.enqueue(bytes.slice(half));
                c.close();
              },
            })
          : body();
      return Promise.resolve(new Response(stream, { status }));
    },
  };
}

const req = (over: Partial<ChatCompletionsRequest> = {}): ChatCompletionsRequest => ({
  model: 'm',
  messages: [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Hi' },
  ],
  think: false,
  maxOutputTokens: 100,
  signal: new AbortController().signal,
  ...over,
});

async function collect(it: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

const delta = (d: Record<string, unknown>, finish: string | null = null) => ({
  choices: [{ index: 0, delta: d, finish_reason: finish }],
});

describe('chatCompletions', () => {
  it('streams text and reports usage', async () => {
    const f = fakeFetch(
      sse(
        delta({ role: 'assistant', content: 'Hel' }),
        delta({ content: 'lo' }),
        delta({}, 'stop'),
        { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } },
        '[DONE]',
      ),
    );
    const out = await collect(
      chatCompletions({ baseUrl: 'http://127.0.0.1:1234/v1', fetch: f.fetch, apiKey: 'k' }, req()),
    );
    expect(out).toEqual([
      { type: 'content', text: 'Hel' },
      { type: 'content', text: 'lo' },
      { type: 'done', promptTokens: 12, outputTokens: 3, loadMs: 0 },
    ]);
    const call = f.calls[0];
    expect(call?.url).toBe('http://127.0.0.1:1234/v1/chat/completions');
    expect(call?.init.redirect).toBe('error');
    expect(call?.init.credentials).toBe('omit');
    expect((call?.init.headers as Record<string, string>).authorization).toBe('Bearer k');
    const body = JSON.parse(call?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'm',
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Hi' },
      ],
    });
  });

  it('sends no authorization header without a key', async () => {
    const f = fakeFetch(sse(delta({ content: 'x' }, 'stop'), '[DONE]'));
    await collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: f.fetch }, req()));
    expect((f.calls[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('maps reasoning and reasoning_content to thinking', async () => {
    const f = fakeFetch(
      sse(
        delta({ reasoning: 'Let me ' }),
        delta({ reasoning_content: 'think.' }),
        delta({ content: 'Answer' }, 'stop'),
        '[DONE]',
      ),
    );
    const out = await collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: f.fetch }, req()));
    expect(out.slice(0, 3)).toEqual([
      { type: 'thinking', text: 'Let me ' },
      { type: 'thinking', text: 'think.' },
      { type: 'content', text: 'Answer' },
    ]);
  });

  it('accumulates tool calls split over chunks, by index', async () => {
    const f = fakeFetch(
      sse(
        delta({
          tool_calls: [
            { index: 0, id: 'c1', type: 'function', function: { name: 'web_', arguments: '' } },
          ],
        }),
        delta({ tool_calls: [{ index: 0, function: { name: 'search', arguments: '{"que' } }] }),
        delta({
          tool_calls: [{ index: 1, id: 'c2', function: { name: 'remember', arguments: '{}' } }],
        }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'ry":"rain"}' } }] }, 'tool_calls'),
        '[DONE]',
      ),
    );
    const out = await collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: f.fetch }, req()));
    expect(out).toEqual([
      { type: 'tool_call', id: 'c1', name: 'web_search', arguments: { query: 'rain' } },
      { type: 'tool_call', id: 'c2', name: 'remember', arguments: {} },
      { type: 'done', promptTokens: 0, outputTokens: 0, loadMs: 0 },
    ]);
  });

  it('sends tools, images and structured output in the protocol form', async () => {
    const f = fakeFetch(sse(delta({ content: '{}' }, 'stop'), '[DONE]'));
    await collect(
      chatCompletions(
        {
          baseUrl: 'http://x/v1',
          fetch: f.fetch,
          extraBody: () => ({ reasoning: { effort: 'low' } }),
        },
        req({
          messages: [{ role: 'user', content: 'What is this?', images: ['/9j/AAAA'] }],
          tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
          format: { type: 'object' },
        }),
      ),
    );
    const body = JSON.parse(f.calls[0]?.init.body as string) as Record<string, unknown>;
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/AAAA' } },
        ],
      },
    ]);
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: { name: 't', description: 'd', parameters: { type: 'object' } },
      },
    ]);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'answer', schema: { type: 'object' } },
    });
    expect(body.reasoning).toEqual({ effort: 'low' });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'model_not_found'],
    [402, 'rate_limited'],
    [429, 'rate_limited'],
    [500, 'overloaded'],
    [503, 'overloaded'],
    [400, 'bad_response'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const f = fakeFetch('{"error":{"message":"the prompt was: secret"}}', status);
    const err = await collect(
      chatCompletions({ baseUrl: 'http://x/v1', fetch: f.fetch }, req()),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe(code);
    expect((err as LlmError).message).not.toContain('secret');
  });

  it('maps errors inside the stream and content filters', async () => {
    const inStream = fakeFetch(
      sse(delta({ content: 'a' }), { error: { code: 429, message: 'x' } }),
    );
    await expect(
      collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: inStream.fetch }, req())),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    const filtered = fakeFetch(sse(delta({}, 'content_filter'), '[DONE]'));
    await expect(
      collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: filtered.fetch }, req())),
    ).rejects.toMatchObject({ code: 'refused' });
  });

  it('treats a stream that ends early as unavailable', async () => {
    const f = fakeFetch(sse(delta({ content: 'a' })));
    await expect(
      collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: f.fetch }, req())),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('reports aborted and network failures', async () => {
    const ac = new AbortController();
    ac.abort();
    const failing: FetchLike = () => Promise.reject(new Error('boom'));
    await expect(
      collect(
        chatCompletions({ baseUrl: 'http://x/v1', fetch: failing }, req({ signal: ac.signal })),
      ),
    ).rejects.toMatchObject({ code: 'aborted' });
    await expect(
      collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: failing }, req())),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('times out waiting for headers', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    await expect(
      collect(chatCompletions({ baseUrl: 'http://x/v1', fetch: hanging, timeoutMs: 10 }, req())),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('toChatCompletions', () => {
  it('pairs tool results with calls and fills in missing results', () => {
    const out = toChatCompletions([
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'a', name: 'x', arguments: { q: 1 } },
          { id: 'b', name: 'y', arguments: {} },
        ],
      },
      { role: 'tool', content: 'result a', toolCallId: 'a', toolName: 'x' },
      { role: 'assistant', content: 'Done' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'Q' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'x', arguments: '{"q":1}' } },
          { id: 'b', type: 'function', function: { name: 'y', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'a', content: 'result a' },
      { role: 'tool', tool_call_id: 'b', content: 'Not run: this tool is not available now.' },
      { role: 'assistant', content: 'Done' },
    ]);
  });

  it('gives calls without ids generated ids and answers them in order', () => {
    const out = toChatCompletions([
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: '', toolCalls: [{ name: 'x', arguments: {} }] },
      { role: 'tool', content: 'r', toolName: 'x' },
    ]);
    expect(out[1]).toMatchObject({ tool_calls: [{ id: 'call_1' }] });
    expect(out[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'r' });
  });
});
