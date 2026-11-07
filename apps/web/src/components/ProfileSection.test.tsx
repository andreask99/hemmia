import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { SaveProfileRequest } from '@hemmia/shared';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const DAILY = {
  enabled: false,
  time: '07:30',
  sign: null,
  horoscope: true,
  plans: true,
  goals: true,
  weekDay: 1,
  weekTime: '07:30',
  evening: false,
  eveningTime: '20:00',
  town: null,
};
const PROFILE = {
  available: true,
  notes: [{ id: 'n1', text: 'Mag Jazz', createdAt: 1 }],
  updatedAt: 1,
};

function setup(profile: object = PROFILE) {
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
    if (url === '/api/daily') return json(DAILY);
    if (url === '/api/profile' && init?.method === 'PUT') {
      const { notes } = SaveProfileRequest.parse(JSON.parse(init.body as string));
      return json({
        available: true,
        notes: notes.map((text, i) => ({ id: `x${String(i)}`, text, createdAt: 1 })),
        updatedAt: 2,
      });
    }
    if (url === '/api/profile' && init?.method === 'DELETE')
      return new Response(null, { status: 204 });
    if (url === '/api/profile') return json(profile);
    return undefined;
  });
}

const textarea = () => screen.findByLabelText<HTMLTextAreaElement>('Notes about you');
const requestsTo = (calls: ReturnType<typeof setup>, method: string) =>
  calls.filter((c) => c.url === '/api/profile' && c.init?.method === method);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Profile settings', () => {
  it('shows the notes one per line with their count', async () => {
    setup();
    renderRoute('/settings');
    expect((await textarea()).value).toBe('Mag Jazz');
    expect(screen.getByText('1 of 60 notes')).toBeDefined();
  });

  it('saves trimmed non-empty lines', async () => {
    const calls = setup();
    renderRoute('/settings');
    fireEvent.change(await textarea(), { target: { value: 'Mag Jazz\n\n  Spielt Cello  ' } });
    expect(screen.getByText('2 of 60 notes')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('status')).textContent).toBe('Saved.');
    const [put] = requestsTo(calls, 'PUT');
    expect(JSON.parse(put?.init?.body as string)).toEqual({ notes: ['Mag Jazz', 'Spielt Cello'] });
    expect((await textarea()).value).toBe('Mag Jazz\nSpielt Cello');
  });

  it('refuses more than 60 notes without sending anything', async () => {
    const calls = setup();
    renderRoute('/settings');
    const many = Array.from({ length: 61 }, (_, i) => `Notiz ${String(i)}`).join('\n');
    fireEvent.change(await textarea(), { target: { value: many } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toContain('at most 60 notes');
    expect(requestsTo(calls, 'PUT')).toHaveLength(0);
  });

  it('wipes only after confirming', async () => {
    const calls = setup();
    renderRoute('/settings');
    const box = await textarea();
    fireEvent.click(screen.getByRole('button', { name: 'Wipe profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(requestsTo(calls, 'DELETE')).toHaveLength(0);
    expect(box.value).toBe('Mag Jazz');

    fireEvent.click(screen.getByRole('button', { name: 'Wipe profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect((await screen.findByRole('status')).textContent).toBe('Profile wiped.');
    expect(requestsTo(calls, 'DELETE')).toHaveLength(1);
    expect(box.value).toBe('');
  });

  it('shows nothing when the account has no profile', async () => {
    setup({ available: false, notes: [], updatedAt: null });
    renderRoute('/settings');
    await screen.findByText('Planner notifications');
    expect(screen.queryByLabelText('Notes about you')).toBeNull();
  });
});
