import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { RemoteAccess } from './RemoteAccess.tsx';

const base = {
  relayConfigured: true,
  connect: false,
  hostname: null,
  state: 'off',
  since: 1,
  lastError: null,
  certificate: null,
  quota: null,
};
const connected = {
  ...base,
  connect: true,
  state: 'connected',
  hostname: 'zt0jr4qknd6e.h.relay.test',
  certificate: { notAfter: Date.UTC(2027, 0, 12) },
  quota: { bytes: 1_200_000_000, limitBytes: 50_000_000_000 },
};

function renderIt() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider language="en">
        <RemoteAccess />
      </I18nProvider>
    </QueryClientProvider>,
  );
}
const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RemoteAccess', () => {
  it('says when the build has no relay', async () => {
    stubFetch((url) =>
      url === '/api/admin/remote' ? json({ ...base, relayConfigured: false }) : undefined,
    );
    renderIt();
    expect(await screen.findByText('Not available in this build')).toBeDefined();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows a connected hub with address, certificate and traffic', async () => {
    stubFetch((url) => (url === '/api/admin/remote' ? json(connected) : undefined));
    renderIt();
    expect(await screen.findByText('Connected')).toBeDefined();
    expect(screen.getByText('zt0jr4qknd6e.h.relay.test')).toBeDefined();
    expect(screen.getByText('This month: 1.2 GB of 50.0 GB')).toBeDefined();
    expect(screen.getByText('Certificate valid until 12 Jan 2027')).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>('switch').checked).toBe(true);
  });

  it('turns Connect on', async () => {
    const calls = stubFetch((url, init) => {
      if (url !== '/api/admin/remote') return undefined;
      return isGet(init) ? json(base) : json(connected);
    });
    renderIt();
    fireEvent.click(await screen.findByRole('switch'));
    expect(await screen.findByText('Connected')).toBeDefined();
    const posts = calls.filter((c) => c.init?.method === 'POST');
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0]?.init?.body as string)).toEqual({ connect: true });
  });

  it('forgets the address after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = stubFetch((url, init) => {
      if (url !== '/api/admin/remote') return undefined;
      return isGet(init) ? json(connected) : json(base);
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Forget this address' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.init?.method === 'DELETE').length).toBe(1);
    });
  });
});
