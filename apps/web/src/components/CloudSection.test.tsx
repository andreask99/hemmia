import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const KEY = 'sk-ant-1234567890abcdefghij';
const SETTINGS = {
  allowed: true,
  keys: [],
  capCents: 2000,
  month: { costCents: 70, inputTokens: 1000, outputTokens: 500 },
};

function setup(cloud: object = SETTINGS, onPut?: (url: string, body: unknown) => Response) {
  return stubFetch((url, init) => {
    if (url === '/api/me') return json(ME);
    if (url === '/api/models')
      return json({
        chatModels: [],
        imageModels: [],
        defaultChatModel: 'quick',
        defaultImageModel: null,
      });
    if (url === '/api/chats') return json({ chats: [] });
    if (url === '/api/me/sessions') return json({ sessions: [] });
    if (url === '/api/agents') return json({ agents: [], templates: [] });
    if (url === '/api/profile') return json({ available: false, notes: [], updatedAt: null });
    if (url.startsWith('/api/cloud') && init?.method === 'PUT' && onPut) {
      return onPut(url, JSON.parse(init.body as string) as unknown);
    }
    if (url === '/api/cloud') return json(cloud);
    return undefined;
  });
}

const puts = (calls: ReturnType<typeof setup>, url: string) =>
  calls.filter((c) => c.url === url && c.init?.method === 'PUT');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cloud AI settings', () => {
  it('explains cloud models and shows this month’s use', async () => {
    setup();
    renderRoute('/settings?tab=models');
    expect(await screen.findByText(/Only chats where you pick a cloud model/)).toBeDefined();
    expect(screen.getByText('This month: about $0.70 (1,500 tokens)')).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/Monthly limit/).value).toBe('20');
  });

  it('checks and saves a key, then shows only its hint', async () => {
    const calls = setup(SETTINGS, () =>
      json({ ...SETTINGS, keys: [{ provider: 'anthropic', hint: 'ghij', addedAt: 1 }] }),
    );
    renderRoute('/settings?tab=models');
    const [claude] = await screen.findAllByLabelText<HTMLInputElement>('API key');
    if (!claude) throw new Error('no key field');
    expect(claude.type).toBe('password');
    fireEvent.change(claude, { target: { value: `  ${KEY} ` } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Check and save' })[0] as HTMLElement);
    expect((await screen.findByRole('status')).textContent).toBe('The key works and is saved.');
    expect(screen.getByText('Key ending in …ghij')).toBeDefined();
    const [put] = puts(calls, '/api/cloud/keys/anthropic');
    expect(JSON.parse(put?.init?.body as string)).toEqual({ key: KEY });
    expect(screen.getAllByLabelText('API key')).toHaveLength(2);
  });

  it('says when the provider rejects the key, under that provider only', async () => {
    setup(SETTINGS, () => json({ error: { code: 'cloud_key' } }, 400));
    renderRoute('/settings?tab=models');
    const fields = await screen.findAllByLabelText('API key');
    fireEvent.change(fields[1] as HTMLElement, { target: { value: KEY } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Check and save' })[1] as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The provider didn’t accept this key.',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows no key fields when cloud models are off for the account', async () => {
    setup({ ...SETTINGS, allowed: false });
    renderRoute('/settings?tab=models');
    expect(
      await screen.findByText('Cloud models are switched off for your account.'),
    ).toBeDefined();
    expect(screen.queryByLabelText('API key')).toBeNull();
  });

  it('saves the limit in cents, clears it when empty, and refuses nonsense', async () => {
    const calls = setup(SETTINGS, (_url, body) => json({ ...SETTINGS, ...(body as object) }));
    renderRoute('/settings?tab=models');
    const cap = await screen.findByLabelText(/Monthly limit/);
    fireEvent.change(cap, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    expect((await screen.findByRole('status')).textContent).toBe('Limit saved.');
    fireEvent.change(cap, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    await vi.waitFor(() => {
      expect(puts(calls, '/api/cloud/cap')).toHaveLength(2);
    });
    fireEvent.change(cap, { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));
    expect(screen.getByRole('alert')).toBeDefined();
    const bodies = puts(calls, '/api/cloud/cap').map(
      (c) => JSON.parse(c.init?.body as string) as unknown,
    );
    expect(bodies).toEqual([{ capCents: 1200 }, { capCents: null }]);
  });
});
