import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { json, renderRoute, stubFetch } from '../test-utils.tsx';

const CODE = 'A'.repeat(42) + 'z';

function open(hash: string) {
  window.history.replaceState(null, '', `/join#${hash}`);
  return renderRoute(`/join#${hash}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JoinPage', () => {
  it('pairs the device with an invite and continues on the invite screen', async () => {
    const calls = stubFetch((url) =>
      url === '/api/links/redeem' ? json({ next: 'invite' }) : undefined,
    );
    const { router } = open(`i~${CODE}`);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/invite');
    });
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ kind: 'i', code: CODE });
    expect(window.location.hash).toBe('');
    expect(await screen.findByText('Create your account')).toBeDefined();
    expect(screen.queryByText('This invite link is incomplete. Ask for a new one.')).toBeNull();
  });

  it('signs in with a sign-in link', async () => {
    stubFetch((url) => (url === '/api/links/redeem' ? json({ next: 'app' }) : undefined));
    const { router } = open(`l~${CODE}`);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('sends a device code on to sign-in with a notice', async () => {
    stubFetch((url) => (url === '/api/links/redeem' ? json({ next: 'login' }) : undefined));
    open(`d~${CODE}`);
    expect(await screen.findByText('This device is now allowed. Sign in.')).toBeDefined();
  });

  it('shows one message for links that fail, and for malformed ones without asking the hub', async () => {
    stubFetch((url) =>
      url === '/api/links/redeem' ? json({ error: { code: 'link_invalid' } }, 400) : undefined,
    );
    open(`l~${CODE}`);
    expect(
      await screen.findByText('This link doesn’t work any more. Ask for a new one.'),
    ).toBeDefined();
  });

  it('does not ask the hub for malformed links', async () => {
    const calls = stubFetch(() => undefined);
    open('x~nope');
    expect(
      await screen.findByText('This link doesn’t work any more. Ask for a new one.'),
    ).toBeDefined();
    expect(calls.filter((c) => c.url === '/api/links/redeem')).toEqual([]);
  });
});
