import { describe, expect, it } from 'vitest';
import { createAnthropicClient } from './anthropic.ts';
import type { FetchLike } from './cloudhttp.ts';
import { listModels } from './keycheck.ts';

function recorder(status: number | 'down') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    return status === 'down'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(new Response('{}', { status }));
  };
  return { calls, fetch };
}

describe('listModels key check', () => {
  it.each([
    [200, 'ok'],
    [401, 'refused'],
    [403, 'refused'],
    [500, 'busy'],
    [429, 'busy'],
    ['down', 'offline'],
  ] as const)('%s → %s', async (status, expected) => {
    const r = recorder(status);
    expect(await listModels('openai', 'sk-test', r.fetch, new AbortController().signal)).toBe(
      expected,
    );
  });

  it('asks the fixed origins with the right headers', async () => {
    const a = recorder(200);
    await listModels('anthropic', 'sk-ant-x', a.fetch, new AbortController().signal);
    expect(a.calls[0]?.url).toBe('https://api.anthropic.com/v1/models');
    expect(a.calls[0]?.init.headers).toMatchObject({
      'x-api-key': 'sk-ant-x',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    const o = recorder(200);
    await listModels('openai', 'sk-x', o.fetch, new AbortController().signal);
    expect(o.calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(o.calls[0]?.init.headers).toEqual({ authorization: 'Bearer sk-x' });
  });
});

describe('Anthropic browser option', () => {
  async function headersOf(browser: boolean | undefined) {
    const r = recorder(200);
    const client = createAnthropicClient({
      fetch: r.fetch,
      ...(browser === undefined ? {} : { browser }),
    });
    await client.checkKey('k', new AbortController().signal);
    return r.calls[0]?.init.headers as Record<string, string>;
  }
  it('adds the browser access header only when asked', async () => {
    expect((await headersOf(true))['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(
      (await headersOf(undefined))['anthropic-dangerous-direct-browser-access'],
    ).toBeUndefined();
    expect((await headersOf(false))['anthropic-dangerous-direct-browser-access']).toBeUndefined();
  });
});
