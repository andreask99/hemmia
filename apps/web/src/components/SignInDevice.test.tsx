import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { SignInDevice } from './SignInDevice.tsx';

const LINK = {
  code: 'A'.repeat(43),
  kind: 'signin',
  expiresAt: Date.now() + 10 * 60_000,
  shareLink: null,
  directLink: `https://homehub.example.ts.net/join#l~${'A'.repeat(43)}`,
};

function renderIt() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider language="en">
        <SignInDevice />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SignInDevice', () => {
  it('shows a QR code with a countdown right after a fresh sign-in', async () => {
    stubFetch((url) => (url === '/api/links' ? json(LINK, 201) : undefined));
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Show sign-in code' }));
    expect(await screen.findByRole('img', { name: 'Sign-in code' })).toBeDefined();
    expect(screen.getByRole('timer').textContent).toMatch(/^Valid for (10:00|9:5\d)$/);
  });

  it('offers the link to copy, for opening on the same phone', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubFetch((url) => (url === '/api/links' ? json(LINK, 201) : undefined));
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Show sign-in code' }));
    const field = await screen.findByLabelText('Sign-in link');
    expect((field as HTMLInputElement).value).toBe(LINK.directLink);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(LINK.directLink);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeDefined();
  });

  it('copies the direct link to the hub, not the join page for the app', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const share = `https://join.hemmia.app/j#1~abcdefghjkmn.h.hemmia.app~l~${'A'.repeat(43)}`;
    stubFetch((url) =>
      url === '/api/links' ? json({ ...LINK, shareLink: share }, 201) : undefined,
    );
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Show sign-in code' }));
    expect((await screen.findByLabelText<HTMLInputElement>('Sign-in link')).value).toBe(
      LINK.directLink,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(LINK.directLink);
  });

  it('says why there is no code when phones cannot reach the hub', async () => {
    stubFetch((url) =>
      url === '/api/links' ? json({ ...LINK, directLink: null }, 201) : undefined,
    );
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Show sign-in code' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/no code to scan yet/);
    expect(screen.queryByRole('img', { name: 'Sign-in code' })).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(/Scan it with/)).toBeNull();
    expect(screen.queryByLabelText('Sign-in link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide code' }));
    expect(screen.getByRole('button', { name: 'Show sign-in code' })).toBeDefined();
  });

  it('asks for the passphrase when the server wants it', async () => {
    const calls = stubFetch((_url, init) => {
      const body = JSON.parse(init?.body as string) as { password?: string };
      return body.password
        ? json(LINK, 201)
        : json({ error: { code: 'invalid_credentials' } }, 401);
    });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Show sign-in code' }));
    const field = await screen.findByLabelText('Your passphrase');
    fireEvent.change(field, { target: { value: 'blue tractor sings loudly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show sign-in code' }));
    expect(await screen.findByRole('img', { name: 'Sign-in code' })).toBeDefined();
    expect(JSON.parse(calls[1]?.init?.body as string)).toEqual({
      kind: 'signin',
      password: 'blue tractor sings loudly',
    });
  });
});
