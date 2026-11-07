import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { api, ApiError } from './client.ts';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('parses successful responses with the schema', async () => {
    mockFetch(200, { a: 1 });
    await expect(api('/x', { schema: z.object({ a: z.number() }) })).resolves.toEqual({ a: 1 });
  });

  it('sends JSON bodies to /api', async () => {
    const fn = mockFetch(204, undefined);
    await api('/auth/logout', { method: 'POST', body: {} });
    expect(fn).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('turns error responses into ApiError codes', async () => {
    mockFetch(429, { error: { code: 'rate_limited', retryAfterSeconds: 60 } });
    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 60,
    });
  });

  it('maps unexpected error bodies and network failures', async () => {
    mockFetch(502, 'Bad gateway');
    await expect(api('/x')).rejects.toMatchObject({ code: 'internal' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    const err = await api('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('network');
  });

  it('rejects responses that do not match the schema', async () => {
    mockFetch(200, { a: 'nope' });
    await expect(api('/x', { schema: z.object({ a: z.number() }) })).rejects.toThrow();
  });
});
