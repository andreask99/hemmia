import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { DevicesSection } from './DevicesSection.tsx';

const DEVICES = {
  devices: [
    { id: 'd1', label: 'iPhone · Safari', createdAt: 1, lastSeenAt: 2, current: true },
    { id: 'd2', label: 'Mac · Firefox', createdAt: 1, lastSeenAt: 2, current: false },
  ],
};
const LINK = {
  code: 'A'.repeat(43),
  kind: 'device',
  expiresAt: Date.now() + 86_400_000,
  shareLink: null,
  directLink: `https://homehub.example.ts.net/join#d~${'A'.repeat(43)}`,
};
const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

function renderIt(props: { userId?: string; userName?: string } = {}) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider language="en">
        <DevicesSection {...props} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DevicesSection', () => {
  it('lists devices and removes another one after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const calls = stubFetch((url, init) => {
      if (url === '/api/devices' && isGet(init)) return json(DEVICES);
      if (url === '/api/devices/d2') return new Response(null, { status: 204 });
      return undefined;
    });
    renderIt();
    expect(await screen.findByText('Mac · Firefox')).toBeDefined();
    expect(screen.getByText('This device')).toBeDefined();
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    expect(removes).toHaveLength(1);
    fireEvent.click(removes[0] as HTMLElement);
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/devices/d2' && c.init?.method === 'DELETE')).toBe(
        true,
      );
    });
  });

  it('adds a device and shows its code', async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/devices' && isGet(init)) return json({ devices: [] });
      if (url === '/api/links') return json(LINK, 201);
      return undefined;
    });
    renderIt();
    expect(await screen.findByText('No devices paired yet.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add a device' }));
    expect(await screen.findByRole('img', { name: 'Device code' })).toBeDefined();
    expect(JSON.parse(calls.find((c) => c.url === '/api/links')?.init?.body as string)).toEqual({
      kind: 'device',
    });
    expect(screen.getByText('Valid for 24 hours.')).toBeDefined();
  });

  it("works on another user's devices for admins", async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/users/u2/devices' && isGet(init)) return json({ devices: [] });
      if (url === '/api/links') return json(LINK, 201);
      return undefined;
    });
    renderIt({ userId: 'u2', userName: 'ben' });
    fireEvent.click(await screen.findByRole('button', { name: 'Add a device for ben' }));
    await screen.findByRole('img', { name: 'Device code' });
    expect(JSON.parse(calls.find((c) => c.url === '/api/links')?.init?.body as string)).toEqual({
      kind: 'device',
      userId: 'u2',
    });
  });
});
