import { describe, expect, it } from 'vitest';
import type { FetchLike } from './cloudhttp.ts';
import { createOpenAiClient, replayOf, toOpenAi } from './openai.ts';
import { type ChatChunk, type CloudChatRequest, LlmError } from './types.ts';

const KEY = 'sk-proj-test-0123456789abcdefghij';
const JPEG = '/9j/4AAQSkZJRgABAQ';

function sse(events: readonly object[]): string {
  return events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
}

function fakeFetch(status: number, body: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return { fetch, calls };
}

function request(extra: Partial<CloudChatRequest> = {}): CloudChatRequest {
  return {
    model: 'gpt-6.1-sol',
    apiKey: KEY,
    messages: [
      { role: 'system', content: 'Be kind.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'What is this?', images: [JPEG] },
    ],
    think: true,
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

const REASONING = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'ENC' };
const COMPLETED = {
  type: 'response.completed',
  response: {
    output: [
      REASONING,
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'A cat.', annotations: [] }],
      },
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'web_search',
        arguments: '{"query":"cats"}',
        status: 'completed',
      },
    ],
    usage: { input_tokens: 90, output_tokens: 30 },
  },
};
const STREAM = sse([
  { type: 'response.created', response: { id: 'resp_1' } },
  { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1' } },
  { type: 'response.output_text.delta', output_index: 1, delta: 'A ' },
  { type: 'response.output_text.delta', output_index: 1, delta: 'cat.' },
  COMPLETED,
]);

describe('openai client', () => {
  it('sends the chat statelessly to the Responses API with the key, effort and tools', async () => {
    const { fetch, calls } = fakeFetch(200, STREAM);
    await collect(
      createOpenAiClient({ fetch }).chat(
        request({
          tools: [{ name: 'web_search', description: 'Search', parameters: { type: 'object' } }],
        }),
      ),
    );
    const call = calls[0];
    expect(call?.url).toBe('https://api.openai.com/v1/responses');
    expect(call?.init.redirect).toBe('error');
    expect((call?.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(call?.init.body as string)).toEqual({
      model: 'gpt-6.1-sol',
      stream: true,
      store: false,
      include: ['reasoning.encrypted_content'],
      instructions: 'Be kind.',
      input: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'What is this?' },
            { type: 'input_image', image_url: `data:image/jpeg;base64,${JPEG}` },
          ],
        },
      ],
      reasoning: { effort: 'high' },
      max_output_tokens: 32000,
      tools: [
        {
          type: 'function',
          name: 'web_search',
          description: 'Search',
          parameters: { type: 'object' },
        },
      ],
    });
  });

  it('streams text, then tool calls with ids, usage and the replay', async () => {
    const { fetch } = fakeFetch(200, STREAM);
    expect(await collect(createOpenAiClient({ fetch }).chat(request()))).toEqual([
      { type: 'thinking', text: '' },
      { type: 'content', text: 'A ' },
      { type: 'content', text: 'cat.' },
      { type: 'tool_call', id: 'call_1', name: 'web_search', arguments: { query: 'cats' } },
      {
        type: 'done',
        promptTokens: 90,
        outputTokens: 30,
        loadMs: 0,
        replay: [
          REASONING,
          { role: 'assistant', content: 'A cat.' },
          {
            type: 'function_call',
            call_id: 'call_1',
            name: 'web_search',
            arguments: '{"query":"cats"}',
          },
        ],
      },
    ]);
  });

  it('keeps a reply cut off by the output limit, and maps failures to codes', async () => {
    const incomplete = fakeFetch(
      200,
      sse([
        { type: 'response.output_text.delta', delta: 'Part' },
        {
          type: 'response.incomplete',
          response: {
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'Part' }] }],
            usage: { input_tokens: 5, output_tokens: 9 },
            incomplete_details: { reason: 'max_output_tokens' },
          },
        },
      ]),
    );
    const chunks = await collect(createOpenAiClient(incomplete).chat(request()));
    expect(chunks.at(-1)).toMatchObject({ type: 'done', promptTokens: 5, outputTokens: 9 });

    const code = async (status: number, events: object[] = []) => {
      const { fetch } = fakeFetch(status, sse(events));
      return collect(createOpenAiClient({ fetch }).chat(request())).catch((e: unknown) =>
        e instanceof LlmError ? e.code : e,
      );
    };
    expect(await code(401)).toBe('auth');
    expect(await code(429)).toBe('rate_limited');
    expect(await code(503)).toBe('overloaded');
    expect(
      await code(200, [{ type: 'response.failed', response: { error: { code: 'server_error' } } }]),
    ).toBe('overloaded');
    expect(await code(200, [{ type: 'error', code: 'rate_limit_exceeded', message: 'x' }])).toBe(
      'rate_limited',
    );
    expect(
      await code(200, [
        {
          type: 'response.incomplete',
          response: { incomplete_details: { reason: 'content_filter' } },
        },
      ]),
    ).toBe('refused');
    expect(
      await code(200, [
        {
          type: 'response.completed',
          response: {
            output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }],
          },
        },
      ]),
    ).toBe('refused');
    expect(await code(200, [{ type: 'response.output_text.delta', delta: 'cut' }])).toBe(
      'unavailable',
    );
  });

  it('checks a key without sending content', async () => {
    const ok = fakeFetch(200, '{}');
    expect(await createOpenAiClient(ok).checkKey(KEY, new AbortController().signal)).toBe(true);
    expect(ok.calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(ok.calls[0]?.init.body).toBeUndefined();
    expect(
      await createOpenAiClient(fakeFetch(401, '')).checkKey(KEY, new AbortController().signal),
    ).toBe(false);
  });
});

describe('toOpenAi', () => {
  it('sends a tool round back with one output per call', () => {
    const replay = [
      REASONING,
      { type: 'function_call', call_id: 'a', name: 'web_search', arguments: '{}' },
      { type: 'function_call', call_id: 'b', name: 'unknown', arguments: '{}' },
    ];
    const { input } = toOpenAi([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'ignored', replay },
      { role: 'tool', toolName: 'web_search', toolCallId: 'a', content: 'results' },
      { role: 'assistant', content: 'Done.' },
    ]);
    expect(input).toEqual([
      { role: 'user', content: 'Hi' },
      ...replay,
      { type: 'function_call_output', call_id: 'a', output: 'results' },
      {
        type: 'function_call_output',
        call_id: 'b',
        output: 'Not run: this tool is not available now.',
      },
      { role: 'assistant', content: 'Done.' },
    ]);
  });

  it('reduces output items to what the next round needs', () => {
    expect(
      replayOf([
        { type: 'message', id: 'm', content: [] },
        { type: 'web_search_call', id: 'w' },
      ]),
    ).toEqual([]);
  });
});
