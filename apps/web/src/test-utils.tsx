import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nProvider, type Language } from './i18n/index.tsx';
import { routes } from './router.tsx';

export const ME = {
  id: 'u1',
  username: 'anna',
  role: 'member',
  restricted: false,
  language: 'en',
  defaultModelId: null,
} as const;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export type Handler = (url: string, init: RequestInit | undefined) => Response | undefined;

/** Stubs fetch with a URL router; unmatched requests get a 404 JSON error. Returns the calls. */
export function stubFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(handler(url, init) ?? json({ error: { code: 'not_found' } }, 404));
    }),
  );
  return calls;
}

export function renderRoute(path: string, language: Language = 'en') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider language={language}>
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    ),
  };
}
