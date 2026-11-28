import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const L = (s: string) => ({ en: s, de: s, fr: s, it: s });
const chat = (id: string, label: string, cloud = false) => ({
  id,
  label: L(label),
  description: null,
  engineModel: id,
  details: null,
  vision: false,
  thinking: false,
  cloud,
});
const admin = (over: object = {}) => ({
  models: [
    {
      id: 'gemma4-26b',
      label: L('Gemma 4 26B'),
      kind: 'chat',
      available: true,
      enabled: true,
      installed: true,
      custom: false,
      cloud: false,
      engineModel: 'gemma4:26b',
    },
    {
      id: 'qwen',
      label: L('Qwen 3.8 27B'),
      kind: 'chat',
      available: true,
      enabled: true,
      installed: true,
      custom: false,
      cloud: false,
      engineModel: 'qwen3.8:27b-mlx',
    },
    {
      id: 'image',
      label: L('Pictures'),
      kind: 'image',
      available: true,
      enabled: true,
      installed: true,
      custom: false,
      cloud: false,
      engineModel: null,
    },
    {
      id: 'claude',
      label: L('Claude Sonnet 5.5'),
      kind: 'chat',
      available: true,
      enabled: false,
      installed: true,
      custom: false,
      cloud: true,
      engineModel: null,
    },
  ],
  installedNotOffered: [
    { engineModel: 'qwen3-coder:30b', sizeGiB: 17.3, engine: 'ollama', engineLabel: null },
  ],
  defaultChatModel: 'gemma4-26b',
  defaultImageModel: 'image',
  webSearch: 'all',
  cloud: 'adults',
  ...over,
});

function setup(o: { role?: 'admin' | 'member'; local?: boolean; refuseDelete?: boolean } = {}) {
  const local = o.local ?? true;
  return stubFetch((url, init) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/me' && method === 'PATCH') {
      return json({
        ...ME,
        role: o.role ?? 'admin',
        ...(JSON.parse(init?.body as string) as object),
      });
    }
    if (url === '/api/me') return json({ ...ME, role: o.role ?? 'admin' });
    if (url === '/api/models') {
      return json({
        chatModels: local
          ? [chat('gemma4-26b', 'Gemma 4 26B'), chat('qwen', 'Qwen 3.8 27B')]
          : [chat('claude', 'Claude Sonnet 5.5', true)],
        imageModels: [],
        defaultChatModel: local ? 'gemma4-26b' : 'claude',
        defaultImageModel: null,
        paused: false,
        loaded: [],
        cloudAllowed: true,
      });
    }
    if (url === '/api/chats') return json({ chats: [] });
    if (url === '/api/admin/models' && method === 'PUT') {
      return json(admin(JSON.parse(init?.body as string) as object));
    }
    if (url === '/api/admin/models') return json(admin());
    if (url === '/api/admin/models/extra') return json(admin());
    if (url === '/api/admin/models/installed') {
      return json({
        diskFreeGiB: 242.4,
        models: [
          { model: 'gemma4:26b', sizeGiB: 17.6, offeredId: 'gemma4-26b' },
          { model: 'qwen3.8:27b-mlx', sizeGiB: 17.2, offeredId: 'qwen' },
          { model: 'qwen3-coder:30b', sizeGiB: 17.3, offeredId: null },
        ],
      });
    }
    if (url === '/api/admin/models/remove') {
      return o.refuseDelete ? json({ error: { code: 'last_model' } }, 409) : json({ ok: true });
    }
    if (url === '/api/admin/catalog') {
      return json({
        memoryGiB: 32,
        entries: [
          {
            ollamaModel: 'gemma4:26b',
            label: L('Gemma 4 26B'),
            description: L('Best all-rounder'),
            downloadGiB: 18,
            memoryGiB: 19,
            minTotalMemoryGiB: 32,
            vision: true,
            tools: true,
            fits: true,
            recommended: true,
            installed: true,
            think: true,
            contextTokens: 131072,
            isNew: false,
            popularRank: null,
            releasedAt: null,
            inUse: true,
          },
        ],
      });
    }
    if (url === '/api/admin/models/updates') {
      return json({ updates: [], unseen: false, catalogCheck: true });
    }
    if (url === '/api/admin/web-search') return json(JSON.parse(init?.body as string));
    if (url === '/api/cloud') {
      return json({
        allowed: true,
        keys: [{ provider: 'anthropic', hint: 'abcd', addedAt: 1 }],
        capCents: null,
        month: { costCents: 0, inputTokens: 0, outputTokens: 0 },
      });
    }
    return undefined;
  });
}

const body = (
  calls: { url: string; init: RequestInit | undefined }[],
  url: string,
  method = 'PUT',
) =>
  calls
    .filter((c) => c.url === url && c.init?.method === method)
    .map((c) => JSON.parse(c.init?.body as string) as unknown);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Settings → Models', () => {
  it('shows the family’s models once, with facts, and saves a switch at once', async () => {
    const calls = setup();
    renderRoute('/settings?tab=models');
    const list = (await screen.findByRole('heading', { name: 'Models for the family' })).closest(
      'section',
    );
    if (!list) throw new Error('no list');
    const rows = within(list).getAllByRole('switch');
    // Local chat models and Pictures; the cloud model isn't in this list.
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Offer Gemma 4 26B',
      'Offer Qwen 3.8 27B',
      'Offer Pictures',
    ]);
    expect(within(list).getByText('Family default')).toBeDefined();
    expect(within(list).getByText('sees pictures · uses tools · 18 GB')).toBeDefined();
    expect(within(list).getByText('242 GB free on this computer')).toBeDefined();
    // The family default can't be switched off.
    expect((rows[0] as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(rows[2] as HTMLElement);
    await waitFor(() => {
      expect(body(calls, '/api/admin/models')).toEqual([
        { disabled: ['claude', 'image'], defaultChatModel: 'gemma4-26b', defaultImageModel: null },
      ]);
    });
    expect(screen.queryByRole('button', { name: 'Save models' })).toBeNull();
  });

  it('makes a model the family default and asks before deleting it', async () => {
    const calls = setup({ refuseDelete: true });
    renderRoute('/settings?tab=models');
    fireEvent.click(await screen.findByRole('button', { name: 'More for Qwen 3.8 27B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make it the family default' }));
    await waitFor(() => {
      expect(body(calls, '/api/admin/models')).toEqual([
        { disabled: ['claude'], defaultChatModel: 'qwen', defaultImageModel: 'image' },
      ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'More for Qwen 3.8 27B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete from this Mac · frees 17 GB' }));
    expect(screen.getByText('Delete Qwen 3.8 27B from this computer?')).toBeDefined();
    expect(calls.some((c) => c.url === '/api/admin/models/remove')).toBe(false);
    // The confirmation's Delete (the closed list below has its own).
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0] as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This is the family’s last model. Add another one first.',
    );
    expect(body(calls, '/api/admin/models/remove', 'POST')).toEqual([{ model: 'qwen3.8:27b-mlx' }]);
  });

  it('offers a model that is on the Mac under a readable name', async () => {
    const calls = setup();
    renderRoute('/settings?tab=models');
    fireEvent.click(await screen.findByText('Also on this Mac, not offered (1)'));
    expect(screen.getByText('Qwen 3 Coder 30B')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Offer' }));
    await waitFor(() => {
      expect(body(calls, '/api/admin/models/extra', 'POST')).toEqual([
        {
          engineModel: 'qwen3-coder:30b',
          label: 'Qwen 3 Coder 30B',
          engine: 'ollama',
          vision: false,
          tools: false,
        },
      ]);
    });
  });

  it('sets web search for everyone with one tap', async () => {
    const calls = setup();
    renderRoute('/settings?tab=models');
    const group = await screen.findByRole('radiogroup', { name: 'Web search' });
    fireEvent.click(within(group).getByRole('radio', { name: 'Adults' }));
    await waitFor(() => {
      expect(body(calls, '/api/admin/web-search')).toEqual([{ mode: 'adults' }]);
    });
  });

  it('keeps cloud AI in a closed section when the hub has its own models', async () => {
    setup();
    renderRoute('/settings?tab=models');
    const summary = await screen.findByText('Your keys: Claude (Anthropic)');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    // The cloud rule lives in there, not with web search.
    const rules = screen.getByRole('heading', { name: 'Who can use what' }).closest('section');
    if (!rules || !details) throw new Error('missing');
    expect(within(rules).queryByRole('radiogroup', { name: 'Who may use cloud AI' })).toBeNull();
    expect(within(details).getByRole('radiogroup', { name: 'Who may use cloud AI' })).toBeDefined();
    expect(within(details).getByRole('switch', { name: 'Offer Claude Sonnet 5.5' })).toBeDefined();
  });

  it('shows cloud AI openly when the hub has no models of its own', async () => {
    setup({ local: false });
    renderRoute('/settings?tab=models');
    const heading = await screen.findByRole('heading', { name: 'Cloud AI' });
    expect(heading.closest('details')).toBeNull();
    const rules = screen.getByRole('heading', { name: 'Who can use what' }).closest('section');
    if (!rules) throw new Error('missing');
    expect(within(rules).getByRole('radiogroup', { name: 'Who may use cloud AI' })).toBeDefined();
  });

  it('opens the catalogue on its own screen and comes back', async () => {
    setup();
    renderRoute('/settings?tab=models');
    fireEvent.click(await screen.findByRole('button', { name: 'Add a model' }));
    expect(await screen.findByRole('searchbox', { name: 'Search models' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Models for the family' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to models' }));
    expect(await screen.findByRole('heading', { name: 'Models for the family' })).toBeDefined();
  });

  it('lets members pick their own model or follow the family default', async () => {
    const calls = setup({ role: 'member' });
    renderRoute('/settings?tab=models');
    const select = await screen.findByLabelText('Default model for new chats');
    expect((select as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('option', { name: 'Family default (Gemma 4 26B)' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Models for the family' })).toBeNull();
    fireEvent.change(select, { target: { value: 'qwen' } });
    await waitFor(() => {
      expect(body(calls, '/api/me', 'PATCH')).toEqual([{ defaultModelId: 'qwen' }]);
    });
  });
});
