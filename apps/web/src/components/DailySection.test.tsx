import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const SAVED = {
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
  nearby: [],
};

function setup() {
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
    if (url === '/api/daily' && init?.method === 'PUT')
      return json(JSON.parse(init.body as string) as object);
    if (url === '/api/daily') return json(SAVED);
    return undefined;
  });
}

const puts = (calls: ReturnType<typeof setup>) =>
  calls
    .filter((c) => c.url === '/api/daily' && c.init?.method === 'PUT')
    .map((c) => JSON.parse(c.init?.body as string) as Record<string, unknown>);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Planner settings', () => {
  it('turns notifications on and saves weekly planning, evening check-in and star sign', async () => {
    const calls = setup();
    renderRoute('/settings');
    fireEvent.click(await screen.findByRole('switch', { name: 'Planner notifications' }));
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ enabled: true, time: '07:30' });
    });
    // Monday first in the day list.
    const day = screen.getByLabelText('Day');
    expect(day.querySelector('option')?.textContent).toBe('Monday');
    fireEvent.change(day, { target: { value: '0' } });
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ weekDay: 0 });
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Evening check-in' }));
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ weekDay: 0, evening: true });
    });
    fireEvent.change(screen.getByLabelText('Star sign'), { target: { value: 'leo' } });
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ evening: true, sign: 'leo' });
    });
    expect(screen.getByRole('status').textContent).toBe('Saved.');
  });

  it('saves the home town when the field is left, and only a place name', async () => {
    const calls = setup();
    renderRoute('/settings');
    fireEvent.click(await screen.findByRole('switch', { name: 'Planner notifications' }));
    const town = await screen.findByLabelText('Home town (optional)');
    fireEvent.change(town, { target: { value: 'Kiel <script>' } });
    expect(puts(calls).some((p) => 'town' in p && p.town !== null)).toBe(false);
    fireEvent.blur(town);
    expect(town.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(town, { target: { value: '  Kiel ' } });
    fireEvent.blur(town);
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ enabled: true, town: 'Kiel' });
    });
    expect(town.getAttribute('aria-invalid')).toBe('false');
    fireEvent.change(town, { target: { value: '' } });
    fireEvent.blur(town);
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ town: null });
    });
  });

  it('saves up to three towns nearby, separated by commas', async () => {
    const calls = setup();
    renderRoute('/settings');
    fireEvent.click(await screen.findByRole('switch', { name: 'Planner notifications' }));
    const nearby = await screen.findByLabelText('Towns nearby (optional)');
    fireEvent.change(nearby, { target: { value: 'Zürich, Zug, Luzern, Baar' } });
    fireEvent.blur(nearby);
    expect(nearby.getAttribute('aria-invalid')).toBe('true');
    expect(
      puts(calls).some((p) => 'nearby' in p && Array.isArray(p.nearby) && p.nearby.length > 0),
    ).toBe(false);
    fireEvent.change(nearby, { target: { value: ' Zürich,Zug , Luzern,' } });
    fireEvent.blur(nearby);
    await vi.waitFor(() => {
      expect(puts(calls).at(-1)).toMatchObject({ nearby: ['Zürich', 'Zug', 'Luzern'] });
    });
    expect((nearby as HTMLInputElement).value).toBe('Zürich, Zug, Luzern');
    expect(nearby.getAttribute('aria-invalid')).toBe('false');
  });
});
