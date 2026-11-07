import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function open(ref: string, path: string | null) {
  window.history.replaceState(null, '', `/push-open#${ref}`);
  const calls = stubFetch((url) => {
    if (url === '/api/me') return json(ME);
    if (url === '/api/push/resolve')
      return path === null ? json({ error: { code: 'not_found' } }, 404) : json({ path });
    return json([]);
  });
  return { calls, ...renderRoute('/push-open') };
}

describe('PushOpenPage', () => {
  it('resolves the ref and opens the chat', async () => {
    const { calls, router } = open('REF123', '/chats/c1');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/chats/c1');
    });
    const post = calls.find((c) => c.url === '/api/push/resolve');
    expect(JSON.parse(post?.init?.body as string)).toEqual({ ref: 'REF123' });
    expect(window.location.hash).toBe('');
  });

  it('goes home for unknown refs and refuses paths to other sites', async () => {
    const a = open('X', null);
    await waitFor(() => {
      expect(a.calls.some((c) => c.url === '/api/push/resolve')).toBe(true);
      expect(a.router.state.location.pathname).toBe('/');
    });
    a.unmount();
    const b = open('Y', '//evil.example/x');
    await waitFor(() => {
      expect(b.calls.some((c) => c.url === '/api/push/resolve')).toBe(true);
      expect(b.router.state.location.pathname).toBe('/');
    });
  });
});
