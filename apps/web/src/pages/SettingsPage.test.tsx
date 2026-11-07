import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const MODELS = {
  chatModels: [
    {
      id: 'quick',
      label: { en: 'Quick', de: 'Schnell' },
      description: null,
      engineModel: 'm:1b',
      details: null,
      vision: true,
      thinking: false,
    },
  ],
  imageModels: [],
  defaultChatModel: 'quick',
  defaultImageModel: null,
};
const SESSIONS = {
  sessions: [
    { id: 's1', deviceLabel: 'Mac · Safari', createdAt: 1, lastSeenAt: 1, current: true },
    { id: 's2', deviceLabel: 'iPhone · Safari', createdAt: 1, lastSeenAt: 1, current: false },
  ],
};

function setup(me: object = ME) {
  return stubFetch((url, init) => {
    if (url === '/api/me' && init?.method === 'PATCH') {
      return json({ ...me, ...(JSON.parse(init.body as string) as object) });
    }
    if (url === '/api/me') return json(me);
    if (url === '/api/models') return json(MODELS);
    if (url === '/api/chats') return json({ chats: [] });
    if (url === '/api/me/sessions') return json(SESSIONS);
    if (url.startsWith('/api/me/sessions/') || url === '/api/auth/password')
      return new Response(null, { status: 204 });
    if (url === '/api/admin/users') {
      return json({
        users: [
          {
            id: 'u1',
            username: 'anna',
            role: 'admin',
            restricted: false,
            createdAt: 1,
            disabledAt: null,
            lastSeenAt: 1,
            sessions: 1,
          },
          {
            id: 'u2',
            username: 'ben',
            role: 'member',
            restricted: false,
            createdAt: 1,
            disabledAt: null,
            lastSeenAt: null,
            sessions: 0,
          },
        ],
      });
    }
    if (url === '/api/admin/invites')
      return json({ link: 'https://hemmia.example/invite#abc', expiresAt: 1 }, 201);
    return undefined;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('lists devices and signs one out', async () => {
    const calls = setup();
    renderRoute('/settings');
    expect(await screen.findByText('iPhone · Safari')).toBeDefined();
    expect(screen.getAllByText('This device')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Family accounts' })).toBeNull();
    const row = screen.getByText('iPhone · Safari').closest('li');
    if (!row) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => {
      expect(
        calls.some((c) => c.url === '/api/me/sessions/s2' && c.init?.method === 'DELETE'),
      ).toBe(true);
    });
  });

  it('checks the repeated passphrase, then changes it', async () => {
    const calls = setup();
    renderRoute('/settings');
    const fill = async (label: string, value: string) => {
      fireEvent.change(await screen.findByLabelText(label), { target: { value } });
    };
    await fill('Current passphrase', 'old passphrase here');
    await fill('New passphrase', 'green bicycle dances twice');
    await fill('Repeat new passphrase', 'something else entirely');
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The passphrases don’t match.');
    expect(calls.some((c) => c.url === '/api/auth/password')).toBe(false);

    await fill('Repeat new passphrase', 'green bicycle dances twice');
    fireEvent.click(screen.getByRole('button', { name: 'Change passphrase' }));
    expect((await screen.findByRole('status')).textContent).toContain('Passphrase changed');
    const post = calls.find((c) => c.url === '/api/auth/password');
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      currentPassword: 'old passphrase here',
      newPassword: 'green bicycle dances twice',
    });
  });

  it('lets an admin create a teen invite and manage others but not disable themselves', async () => {
    const calls = setup({ ...ME, id: 'u1', role: 'admin' });
    renderRoute('/settings?tab=family');
    expect(await screen.findByRole('heading', { name: 'Family accounts' })).toBeDefined();
    fireEvent.click(screen.getByLabelText('Teen account (restricted)'));
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));
    const link = await screen.findByDisplayValue<HTMLInputElement>(
      'https://hemmia.example/invite#abc',
    );
    expect(link.readOnly).toBe(true);
    const post = calls.find((c) => c.url === '/api/admin/invites');
    expect(JSON.parse(post?.init?.body as string)).toEqual({ role: 'member', restricted: true });
    expect(await screen.findByText('ben')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Disable' })).toHaveLength(1);
    // Without a public address there is no QR, only the hint.
    expect(
      screen.getByText('Turn on remote access to share invites as links that work anywhere.'),
    ).toBeDefined();
  });

  it('shows an invite as a QR code and shares its link', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const direct = `https://homehub.example.ts.net/join#i~${'A'.repeat(43)}`;
    stubFetch((url) => {
      if (url === '/api/me') return json({ ...ME, id: 'u1', role: 'admin' });
      if (url === '/api/admin/users') return json({ users: [] });
      if (url === '/api/admin/invites') {
        return json(
          {
            link: 'https://hemmia.example/invite#abc',
            expiresAt: 1,
            shareLink: null,
            directLink: direct,
          },
          201,
        );
      }
      return undefined;
    });
    renderRoute('/settings?tab=family');
    fireEvent.click(await screen.findByRole('button', { name: 'Create invite link' }));
    expect(await screen.findByRole('img', { name: 'Invite code' })).toBeDefined();
    expect(screen.getByDisplayValue(direct)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Send invite link' }));
    expect(share).toHaveBeenCalledWith({ url: direct });
    Reflect.deleteProperty(navigator, 'share');
  });
});

describe('admin models', () => {
  it('saves switched-off models and defaults', async () => {
    const adminModels = {
      models: [
        {
          id: 'quick',
          label: { en: 'Quick', de: 'Schnell' },
          kind: 'chat',
          available: true,
          enabled: true,
          installed: true,
          custom: false,
        },
        {
          id: 'code',
          label: { en: 'Code', de: 'Code' },
          kind: 'chat',
          available: true,
          enabled: true,
          installed: false,
          custom: false,
        },
        {
          id: 'image',
          label: { en: 'Pictures', de: 'Bilder' },
          kind: 'image',
          available: true,
          enabled: true,
          installed: true,
          custom: false,
        },
      ],
      installedNotOffered: [],
      defaultChatModel: 'quick',
      defaultImageModel: 'image',
      webSearch: 'all',
    };
    setup({ ...ME, id: 'u1', role: 'admin' });
    const calls: { url: string; body: string }[] = [];
    const inner = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/admin/models') {
          if (init?.method === 'PUT') calls.push({ url, body: init.body as string });
          return Promise.resolve(json(adminModels));
        }
        return inner ? inner(url, init) : Promise.resolve(json({}, 404));
      }),
    );
    renderRoute('/settings?tab=models');
    expect(await screen.findByText('not installed')).toBeDefined();
    const section = screen
      .getByRole('heading', { name: 'For the whole family' })
      .closest('section');
    if (!section) throw new Error('no section');
    const boxes = within(section).getAllByRole('checkbox');
    fireEvent.click(boxes[1] ?? section);
    fireEvent.change(screen.getByLabelText('Default image model'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save models' }));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      disabled: ['code'],
      defaultChatModel: 'quick',
      defaultImageModel: null,
    });
  });

  it('updates web search mode', async () => {
    const adminModels = {
      models: [
        {
          id: 'quick',
          label: { en: 'Quick', de: 'Schnell' },
          kind: 'chat',
          available: true,
          enabled: true,
          installed: true,
          custom: false,
        },
      ],
      installedNotOffered: [],
      defaultChatModel: 'quick',
      defaultImageModel: null,
      webSearch: 'all',
    };
    setup({ ...ME, id: 'u1', role: 'admin' });
    const calls: { url: string; init?: RequestInit }[] = [];
    const inner = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/admin/web-search') {
          calls.push({ url, init });
          return Promise.resolve(json({ mode: 'adults' }));
        }
        if (url === '/api/admin/models') {
          return Promise.resolve(json(adminModels));
        }
        return inner ? inner(url, init) : Promise.resolve(json({}, 404));
      }),
    );
    renderRoute('/settings?tab=models');
    const select = await screen.findByLabelText('Web search');
    fireEvent.change(select, { target: { value: 'adults' } });
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    const call = calls[0];
    expect(call?.url).toBe('/api/admin/web-search');
    expect(call?.init?.method).toBe('PUT');
    expect(JSON.parse(call?.init?.body as string)).toEqual({ mode: 'adults' });
  });
});

describe('pause', () => {
  it('lets an admin pause Hemmia', async () => {
    const calls = setup({ ...ME, id: 'u1', role: 'admin' });
    const inner = vi.mocked(fetch).getMockImplementation();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/admin/pause') {
          calls.push({ url, init });
          return Promise.resolve(json({ paused: true }));
        }
        if (url === '/api/admin/models')
          return Promise.resolve(
            json({
              models: [],
              installedNotOffered: [],
              defaultChatModel: 'quick',
              defaultImageModel: null,
            }),
          );
        return inner ? inner(url, init) : Promise.resolve(json({}, 404));
      }),
    );
    renderRoute('/settings?tab=system');
    fireEvent.click(await screen.findByRole('switch', { name: 'Pause Hemmia' }));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === '/api/admin/pause')).toBe(true);
    });
    const put = calls.find((c) => c.url === '/api/admin/pause');
    expect(put?.init?.method).toBe('PUT');
    expect(JSON.parse(put?.init?.body as string)).toEqual({ paused: true });
  });

  it('is not shown to members', async () => {
    setup();
    renderRoute('/settings');
    await screen.findByText('iPhone · Safari');
    expect(screen.queryByRole('switch', { name: 'Pause Hemmia' })).toBeNull();
  });
});

describe('settings navigation', () => {
  it('has tabs for admins and remembers the chosen one', async () => {
    setup({ ...ME, id: 'u1', role: 'admin' });
    renderRoute('/settings');
    expect(
      (await screen.findByRole('tab', { name: 'Account' })).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('heading', { name: 'Change passphrase' })).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'System' }));
    expect(await screen.findByRole('switch', { name: 'Pause Hemmia' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Change passphrase' })).toBeNull();
    expect(localStorage.getItem('kchat.settingsTab')).toBe('system');
    localStorage.removeItem('kchat.settingsTab');
  });

  it('shows members Account and Models only, and a back arrow for everyone', async () => {
    setup();
    renderRoute('/settings?tab=family');
    expect(await screen.findByRole('button', { name: 'Back' })).toBeDefined();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Account', 'Models']);
    // An admin-only tab falls back to Account.
    expect(screen.getByRole('tab', { name: 'Account' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    expect(await screen.findByLabelText('Default model for new chats')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'For the whole family' })).toBeNull();
  });

  it('goes back to the start page when opened directly', async () => {
    setup();
    renderRoute('/settings');
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByText('What can I help with?')).toBeDefined();
  });
});
