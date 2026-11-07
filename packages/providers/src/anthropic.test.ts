import { describe, expect, it } from 'vitest';
import { createAnthropicClient, replayOf, toAnthropic } from './anthropic.ts';
import type { FetchLike } from './cloudhttp.ts';
import { type ChatChunk, type CloudChatRequest, LlmError } from './types.ts';

const KEY = 'sk-ant-test-0123456789abcdefghij';
const JPEG = '/9j/4AAQSkZJRgABAQ';
const PNG = 'iVBORw0KGgoAAAANSUhEUg';

function sse(events: readonly object[]): string {
  return events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
}

/** A fetch that records the request and answers with this status and body. */
function fakeFetch(status: number, body: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    // Split the body to exercise buffering across chunks.
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    return new Response(stream, { status });
  };
  return { fetch, calls };
}

function request(extra: Partial<CloudChatRequest> = {}): CloudChatRequest {
  return {
    model: 'claude-sonnet-5-5',
    apiKey: KEY,
    messages: [
      { role: 'system', content: 'Be kind.' },
      { role: 'user', content: 'What is this?', images: [JPEG, PNG] },
    ],
    think: false,
    maxOutputTokens: 32000,
    signal: new AbortController().signal,
    ...extra,
  };
}

async function collect(it: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

const TEXT_STREAM = sse([
  { type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 1 } } },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'ping' },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'A ' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'cat.' } },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: {} },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: '{"query":' },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: '"cats"}' },
  },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 42 } },
  { type: 'message_stop' },
]);

describe('anthropic client', () => {
  it('sends the chat to the Messages API with the key, effort and tools', async () => {
    const { fetch, calls } = fakeFetch(200, TEXT_STREAM);
    const client = createAnthropicClient({ fetch });
    await collect(
      client.chat(
        request({
          tools: [{ name: 'web_search', description: 'Search', parameters: { type: 'object' } }],
          serverFallback: true,
        }),
      ),
    );
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call?.init.redirect).toBe('error');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    const body = JSON.parse(call?.init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 32000,
      stream: true,
      system: 'Be kind.',
      output_config: { effort: 'low' },
      fallbacks: 'default',
      tools: [{ name: 'web_search', description: 'Search', input_schema: { type: 'object' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG } },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
            { type: 'text', text: 'What is this?' },
          ],
        },
      ],
    });
    expect(body).not.toHaveProperty('thinking');
  });

  it('asks for high effort when the chat thinks harder, and no fallback unless configured', async () => {
    const { fetch, calls } = fakeFetch(200, TEXT_STREAM);
    await collect(createAnthropicClient({ fetch }).chat(request({ think: true })));
    const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
    expect(body.output_config).toEqual({ effort: 'high' });
    expect(body).not.toHaveProperty('fallbacks');
    expect(calls[0]?.init.headers).not.toHaveProperty('anthropic-beta');
  });

  it('streams thinking, text and tool calls with ids, then usage and the replay', async () => {
    const { fetch } = fakeFetch(200, TEXT_STREAM);
    const chunks = await collect(createAnthropicClient({ fetch }).chat(request()));
    expect(chunks).toEqual([
      { type: 'thinking', text: '' },
      { type: 'content', text: 'A ' },
      { type: 'content', text: 'cat.' },
      { type: 'tool_call', id: 'toolu_1', name: 'web_search', arguments: { query: 'cats' } },
      {
        type: 'done',
        promptTokens: 120,
        outputTokens: 42,
        loadMs: 0,
        replay: [
          { type: 'thinking', thinking: '', signature: 'SIG' },
          { type: 'text', text: 'A cat.' },
          { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: { query: 'cats' } },
        ],
      },
    ]);
  });

  it('reports a tool call with broken arguments as invalid but keeps it answerable', async () => {
    const { fetch } = fakeFetch(
      200,
      sse([
        { type: 'message_start', message: { usage: { input_tokens: 1 } } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 't1', name: 'remember', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"note": "x' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'max_tokens' },
          usage: { output_tokens: 3 },
        },
        { type: 'message_stop' },
      ]),
    );
    const chunks = await collect(createAnthropicClient({ fetch }).chat(request()));
    expect(chunks[0]).toEqual({ type: 'tool_call', id: 't1', name: 'remember', arguments: null });
    const done = chunks[1];
    expect(done?.type === 'done' && done.replay).toEqual([
      { type: 'tool_use', id: 't1', name: 'remember', input: {} },
    ]);
  });

  it('maps failures to codes without reading error bodies', async () => {
    const cases: [number, string, string][] = [
      [401, '{"error":{"message":"secret prompt"}}', 'auth'],
      [404, '', 'model_not_found'],
      [429, '', 'rate_limited'],
      [529, '', 'overloaded'],
      [400, '', 'bad_response'],
    ];
    for (const [status, body, code] of cases) {
      const { fetch } = fakeFetch(status, body);
      const err = await collect(createAnthropicClient({ fetch }).chat(request())).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).code).toBe(code);
      expect((err as LlmError).message).not.toContain('secret');
    }
  });

  it('turns a refusal, an error event and a cut stream into errors', async () => {
    const run = async (events: object[]) => {
      const { fetch } = fakeFetch(200, sse(events));
      return collect(createAnthropicClient({ fetch }).chat(request())).catch((e: unknown) =>
        e instanceof LlmError ? e.code : e,
      );
    };
    const start = { type: 'message_start', message: { usage: { input_tokens: 1 } } };
    expect(
      await run([
        start,
        { type: 'message_delta', delta: { stop_reason: 'refusal' } },
        { type: 'message_stop' },
      ]),
    ).toBe('refused');
    expect(await run([start, { type: 'error', error: { type: 'overloaded_error' } }])).toBe(
      'overloaded',
    );
    expect(await run([start])).toBe('unavailable');
  });

  it('checks a key without sending content', async () => {
    const ok = fakeFetch(200, '{}');
    expect(await createAnthropicClient(ok).checkKey(KEY, new AbortController().signal)).toBe(true);
    expect(ok.calls[0]?.url).toBe('https://api.anthropic.com/v1/models?limit=1');
    expect(ok.calls[0]?.init.method).toBe('GET');
    expect(ok.calls[0]?.init.body).toBeUndefined();
    const bad = fakeFetch(401, '');
    expect(await createAnthropicClient(bad).checkKey(KEY, new AbortController().signal)).toBe(
      false,
    );
  });
});

describe('toAnthropic', () => {
  it('sends a tool round back unchanged, results first and one per call', () => {
    const replay = [
      { type: 'thinking', thinking: '', signature: 'SIG' },
      { type: 'tool_use', id: 'a', name: 'web_search', input: { query: 'x' } },
      { type: 'tool_use', id: 'b', name: 'unknown_tool', input: {} },
    ];
    const { messages } = toAnthropic([
      { role: 'system', content: 'S' },
      { role: 'assistant', content: 'orphan before the first user turn' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'ignored: replay wins', replay },
      { role: 'tool', toolName: 'web_search', toolCallId: 'a', content: 'results' },
    ]);
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      { role: 'assistant', content: replay },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'results' },
          {
            type: 'tool_result',
            tool_use_id: 'b',
            content: 'Not run: this tool is not available now.',
            is_error: true,
          },
        ],
      },
    ]);
  });

  it('merges same-role turns, drops empty ones and never ends with the assistant', () => {
    const { messages } = toAnthropic([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'three' },
      { role: 'assistant', content: 'trailing' },
    ]);
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'three' }] },
    ]);
  });
});

describe('replayOf', () => {
  it('drops thinking and tool calls before a fallback (echo rules) and the marker', () => {
    expect(
      replayOf([
        { type: 'thinking', thinking: '', signature: 'old' },
        { type: 'text', text: 'Part' },
        { type: 'tool_use', id: 'x', name: 'n', input: {} },
        { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } },
        { type: 'thinking', thinking: '', signature: 'new' },
        { type: 'text', text: 'rest' },
      ]),
    ).toEqual([
      { type: 'text', text: 'Part' },
      { type: 'thinking', thinking: '', signature: 'new' },
      { type: 'text', text: 'rest' },
    ]);
  });
});
