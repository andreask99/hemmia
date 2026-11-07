import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { StepPhone } from './StepPhone.tsx';
import { StepRemote } from './StepRemote.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const status = (relayConfigured: boolean, hostname: string | null = null) => ({
  relayConfigured,
  connect: hostname !== null,
  hostname,
  state: hostname ? 'connected' : 'off',
  since: 0,
  lastError: null,
  certificate: null,
  quota: null,
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider language="en">{ui}</I18nProvider>
    </QueryClientProvider>,
  );
}

function stubRemote(relayConfigured: boolean, hostname: string | null = null) {
  return stubFetch((url, init) => {
    if (url !== '/api/admin/remote') return undefined;
    if ((init?.method ?? 'GET') === 'GET') return json(status(relayConfigured, hostname));
    return json(status(true, 'k7f3q2.h.relay.test'));
  });
}

describe('StepRemote', () => {
  it('turns on Connect by default when the build has a relay, then goes on', async () => {
    const calls = stubRemote(true);
    const onNext = vi.fn();
    wrap(<StepRemote onNext={onNext} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on Connect' }));
    await waitFor(() => {
      expect(onNext).toHaveBeenCalledTimes(1);
    });
    const posts = calls.filter((c) => c.init?.method === 'POST');
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0]?.init?.body as string)).toEqual({ connect: true });
  });

  it('without a relay: Connect is off, Tailscale explains itself, Continue sends nothing', async () => {
    const calls = stubRemote(false);
    const onNext = vi.fn();
    wrap(<StepRemote onNext={onNext} />);
    await screen.findByText('Not available in this build');
    const connect = screen.getByRole<HTMLInputElement>('radio', { name: /Hemmia Connect/ });
    expect(connect.disabled).toBe(true);
    expect(
      screen.getByText('Install Tailscale on each phone and sign in to the same network.'),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: /Not now/ }));
    expect(
      screen.queryByText('Install Tailscale on each phone and sign in to the same network.'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });
});

describe('StepPhone', () => {
  it('lists what is ready and finishes', async () => {
    stubFetch((url) =>
      url === '/api/admin/remote' ? json(status(true, 'k7f3q2.h.relay.test')) : undefined,
    );
    const onDone = vi.fn();
    wrap(<StepPhone username="anna" onDone={onDone} />);
    expect(screen.getByText('✓ Account anna (admin)')).toBeDefined();
    expect(await screen.findByText('✓ Hemmia Connect: k7f3q2.h.relay.test')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
