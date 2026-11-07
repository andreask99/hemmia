import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from './test-utils.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

const signedIn = () =>
  stubFetch((url, init) => {
    if (url === '/api/me' && init?.method === 'PATCH')
      return json({ ...ME, ...(JSON.parse(init.body as string) as object) });
    if (url === '/api/me') return json(ME);
    if (url === '/api/auth/logout') return new Response(null, { status: 204 });
    return undefined;
  });

describe('router', () => {
  it('/login shows the sign-in form', async () => {
    stubFetch(() => undefined);
    renderRoute('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeDefined();
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Passphrase')).toBeDefined();
  });

  it('/login in German', async () => {
    stubFetch(() => undefined);
    renderRoute('/login', 'de');
    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeDefined();
  });

  it('shows the chat page when signed in, for / and /chats/:id', async () => {
    signedIn();
    renderRoute('/');
    expect(await screen.findByText('What can I help with?')).toBeDefined();
    signedIn();
    renderRoute('/chats/abc');
    expect((await screen.findAllByText('What can I help with?')).length).toBeGreaterThan(0);
  });

  it('opens settings from the sidebar', async () => {
    signedIn();
    renderRoute('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeDefined();
  });

  it('switches the language and signs out from the account menu', async () => {
    const calls = signedIn();
    renderRoute('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'de' }));
    expect(await screen.findByText('Wobei kann ich helfen?')).toBeDefined();
    await vi.waitFor(() => {
      const patch = calls.find((c) => c.url === '/api/me' && c.init?.method === 'PATCH');
      expect(JSON.parse(patch?.init?.body as string)).toEqual({ language: 'de' });
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Abmelden' }));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === '/api/auth/logout')).toBe(true);
    });
  });

  it('goes to a new chat from the kchat logo in the menu', async () => {
    signedIn();
    renderRoute('/settings');
    fireEvent.click(await screen.findByRole('link', { name: 'Hemmia' }));
    expect(await screen.findByText('What can I help with?')).toBeDefined();
  });

  it('shows 404 for unknown paths', async () => {
    stubFetch(() => undefined);
    renderRoute('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeDefined();
  });
});
