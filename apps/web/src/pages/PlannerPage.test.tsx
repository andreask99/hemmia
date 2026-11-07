import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const G1 = {
  id: 'g1',
  week: '2026-09-28',
  area: 'work',
  text: 'Slides sent',
  status: 'done',
  day: null,
  doneOn: '2026-09-29',
};
const G2 = {
  id: 'g2',
  week: '2026-09-28',
  area: 'home',
  text: 'Cellar cleared',
  status: 'open',
  day: '2026-10-02',
  doneOn: null,
};

function setup(me: object = ME) {
  return stubFetch((url, init) => {
    if (url === '/api/me') return json(me);
    if (url === '/api/models')
      return json({
        chatModels: [],
        imageModels: [],
        defaultChatModel: 'quick',
        defaultImageModel: null,
      });
    if (url === '/api/chats') return json({ chats: [] });
    if (url === '/api/agents') return json({ agents: [], templates: [] });
    if (url === '/api/week')
      return json({
        week: '2026-09-28',
        today: '2026-10-01',
        goals: [G1, G2],
        plans: [{ id: 'p1', date: '2026-10-01', time: '10:00', text: 'Dentist' }],
      });
    if (url === '/api/week?week=2026-10-05')
      return json({ week: '2026-10-05', today: '2026-10-01', goals: [], plans: [] });
    if (url === '/api/goals/g2' && init?.method === 'PATCH')
      return json({ ...G2, status: 'done', doneOn: '2026-10-01' });
    if (url === '/api/goals' && init?.method === 'POST') {
      const body = JSON.parse(init.body as string) as { text: string };
      return json({ ...G2, id: 'g3', text: body.text, day: null }, 201);
    }
    return undefined;
  });
}

const bodyOf = (calls: ReturnType<typeof setup>, url: string, method: string) => {
  const c = calls.find((x) => x.url === url && x.init?.method === method);
  return c ? (JSON.parse(c.init?.body as string) as unknown) : undefined;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlannerPage', () => {
  it('shows progress, goals by area and appointments', async () => {
    setup();
    renderRoute('/planner');
    expect(await screen.findByText('1 of 2 done')).toBeDefined();
    expect(screen.getByText('This week')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Work' })).toBeDefined();
    expect(screen.getByText('Slides sent').className).toContain('line-through');
    expect(screen.getByRole('checkbox', { name: 'Mark done: Cellar cleared' })).toBeDefined();
    expect(screen.getByText('Dentist')).toBeDefined();
  });

  it('ticks off a goal', async () => {
    const calls = setup();
    renderRoute('/planner');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Mark done: Cellar cleared' }));
    await vi.waitFor(() => {
      expect(bodyOf(calls, '/api/goals/g2', 'PATCH')).toEqual({ status: 'done' });
    });
  });

  it('adds a goal to the right area and week', async () => {
    const calls = setup();
    renderRoute('/planner');
    const input = await screen.findByRole('textbox', { name: 'Add goal: Home' });
    fireEvent.change(input, { target: { value: '  Gift for Grandma ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await vi.waitFor(() => {
      expect(bodyOf(calls, '/api/goals', 'POST')).toEqual({
        week: '2026-09-28',
        area: 'home',
        text: 'Gift for Grandma',
      });
    });
    await vi.waitFor(() => {
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  it('switches to next week', async () => {
    const calls = setup();
    renderRoute('/planner');
    fireEvent.click(await screen.findByRole('button', { name: 'Next week' }));
    expect(await screen.findAllByText('No goals yet.')).toHaveLength(2);
    expect(calls.some((c) => c.url === '/api/week?week=2026-10-05')).toBe(true);
    expect(screen.queryByText('This week')).toBeNull();
  });

  it('calls the work area "School" for teenagers, and only that one', async () => {
    setup({ ...ME, restricted: true });
    renderRoute('/planner');
    expect(await screen.findByRole('heading', { name: 'School' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeDefined();
  });
});
