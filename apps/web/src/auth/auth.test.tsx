import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '../api/client.ts';
import { translate } from '../i18n/index.tsx';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';
import { errorMessage } from './errorMessage.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('auth guard', () => {
  it('sends signed-out visitors to the login page', async () => {
    stubFetch((url) =>
      url === '/api/me' ? json({ error: { code: 'unauthenticated' } }, 401) : undefined,
    );
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeDefined();
  });
});

describe('login', () => {
  async function submit(response: Response) {
    let meCalls = 0;
    const calls = stubFetch((url) => {
      if (url === '/api/auth/login') return response;
      if (url === '/api/me') {
        meCalls++;
        return json({ error: { code: 'unauthenticated' } }, 401);
      }
      return undefined;
    });
    renderRoute('/login');
    await screen.findByRole('heading', { name: 'Sign in' });
    fill('Username', 'anna');
    fill('Passphrase', 'blue tractor sings loudly');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    return { calls, meCalls: () => meCalls };
  }

  it('shows a wrong-credentials error', async () => {
    const { calls } = await submit(json({ error: { code: 'invalid_credentials' } }, 401));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong username or passphrase.');
    const login = calls.find((c) => c.url === '/api/auth/login');
    expect(JSON.parse(login?.init?.body as string)).toEqual({
      username: 'anna',
      password: 'blue tractor sings loudly',
    });
  });

  it('shows the rate-limit wait time', async () => {
    await submit(json({ error: { code: 'rate_limited', retryAfterSeconds: 120 } }, 429));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many attempts. Try again in 2 min.',
    );
  });

  it('goes to the chat page on success without asking /me again', async () => {
    const { meCalls } = await submit(json({ me: ME }));
    expect(await screen.findByText('What can I help with?')).toBeDefined();
    expect(meCalls()).toBe(0);
  });
});

describe('invite', () => {
  it('explains a link without code', async () => {
    stubFetch(() => undefined);
    renderRoute('/invite');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This invite link is incomplete. Ask for a new one.',
    );
  });

  it('checks the repeat, then shows the recovery code until confirmed', async () => {
    const code = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    window.location.hash = `#${code}`;
    const calls = stubFetch((url) =>
      url === '/api/auth/invite/accept'
        ? json({ me: ME, recoveryCode: 'ABCDE-FGHJK-MNPQR-STVWX-YZ012' })
        : undefined,
    );
    renderRoute('/invite');
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(window.location.hash).toBe('');

    fill('Username', 'anna');
    fill('Passphrase', 'blue tractor sings loudly');
    fill('Repeat passphrase', 'blue tractor sings quietly');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The passphrases don’t match.');
    expect(calls.some((c) => c.url === '/api/auth/invite/accept')).toBe(false);

    fill('Repeat passphrase', 'blue tractor sings loudly');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByTestId('recovery-code')).textContent).toBe(
      'ABCDE-FGHJK-MNPQR-STVWX-YZ012',
    );
    const body: unknown = JSON.parse(
      calls.find((c) => c.url === '/api/auth/invite/accept')?.init?.body as string,
    );
    expect(body).toEqual({ code, username: 'anna', password: 'blue tractor sings loudly' });

    const next = screen.getByRole<HTMLButtonElement>('button', { name: 'Continue' });
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('I’ve written it down somewhere safe'));
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(await screen.findByText('What can I help with?')).toBeDefined();
  });
});

describe('errorMessage', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate('en', key, params);
  it('rounds the wait up to whole minutes', () => {
    expect(errorMessage(new ApiError(429, 'rate_limited', 61), t)).toBe(
      'Too many attempts. Try again in 2 min.',
    );
  });
  it('words wrong recovery codes differently', () => {
    expect(errorMessage(new ApiError(401, 'invalid_credentials'), t, 'recover')).toBe(
      'Wrong username or recovery code.',
    );
  });
  it('falls back for unknown errors', () => {
    expect(errorMessage(new Error('x'), t)).toBe('Something went wrong. Please try again.');
  });
});
