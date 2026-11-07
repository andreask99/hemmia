import { describe, expect, it } from 'vitest';
import type { FetchLike } from './cloudhttp.ts';
import { createOpenRouterClient } from './openrouter.ts';
import type { ChatChunk } from './types.ts';

function recorder(answer: (url: string) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(answer(url));
  };
  return { calls, fetch };
}

describe('OpenRouter client', () => {
  it('streams through Chat Completions with privacy settings and no identifying headers', async () => {
    const r = recorder(
      () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n' +
            'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":1}}\n\ndata: [DONE]\n\n',
        ),
    );
    const client = createOpenRouterClient({ fetch: r.fetch });
    const out: ChatChunk[] = [];
    for await (const c of client.chat({
      model: 'google/gemma-4-26b-a4b-it',
      messages: [{ role: 'user', content: 'Hello' }],
      think: true,
      maxOutputTokens: 50,
      apiKey: 'sk-or-v1-test',
      signal: new AbortController().signal,
    }))
      out.push(c);
    expect(out).toEqual([
      { type: 'content', text: 'Hi' },
      { type: 'done', promptTokens: 4, outputTokens: 1, loadMs: 0 },
    ]);
    const call = r.calls[0];
    expect(call?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-or-v1-test');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('http-referer');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('x-title');
    const body = JSON.parse(call?.init.body as string) as Record<string, unknown>;
    expect(body.provider).toEqual({ data_collection: 'deny' });
    expect(body.reasoning).toEqual({ effort: 'high' });
  });

  it('sends no reasoning setting when thinking is off', async () => {
    const r = recorder(
      () =>
        new Response('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}\n\n'),
    );
    const client = createOpenRouterClient({ fetch: r.fetch });
    for await (const _ of client.chat({
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Hello' }],
      think: false,
      maxOutputTokens: 50,
      apiKey: 'k',
      signal: new AbortController().signal,
    })) {
      // drain
    }
    const body = JSON.parse(r.calls[0]?.init.body as string) as Record<string, unknown>;
    expect(body.reasoning).toBeUndefined();
  });

  it('checks a key with GET /api/v1/key', async () => {
    const r = recorder(
      (url) => new Response('{}', { status: url.endsWith('/api/v1/key') ? 200 : 404 }),
    );
    const client = createOpenRouterClient({ fetch: r.fetch });
    expect(await client.checkKey('k', new AbortController().signal)).toBe(true);
    expect(r.calls[0]?.url).toBe('https://openrouter.ai/api/v1/key');
    const bad = createOpenRouterClient({
      fetch: () => Promise.resolve(new Response('', { status: 401 })),
    });
    expect(await bad.checkKey('k', new AbortController().signal)).toBe(false);
    const down = createOpenRouterClient({
      fetch: () => Promise.resolve(new Response('', { status: 503 })),
    });
    await expect(down.checkKey('k', new AbortController().signal)).rejects.toMatchObject({
      code: 'overloaded',
    });
  });
});
