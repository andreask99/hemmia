import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DayTask, Goal } from '@hemmia/shared';
import { I18nProvider } from '../i18n/index.tsx';
import { TodayCard } from './TodayCard.tsx';

const G: Goal = {
  id: 'g1',
  week: '2026-09-28',
  area: 'work',
  text: 'Slides sent',
  status: 'open',
  day: null,
  doneOn: null,
};
const M: DayTask = {
  id: 't1',
  date: '2026-10-01',
  kind: 'must',
  text: 'Finish slides 1-10',
  goalId: 'g1',
  status: 'open',
};
const A: DayTask = {
  id: 't2',
  date: '2026-10-01',
  kind: 'also',
  text: 'Call Grandma',
  goalId: null,
  status: 'done',
};

function show(tasks: DayTask[]) {
  const props = { onToggle: vi.fn(), onAdd: vi.fn(), onDelete: vi.fn(), onPlan: vi.fn() };
  render(
    <I18nProvider language="en">
      <TodayCard tasks={tasks} goals={[G]} {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('TodayCard', () => {
  afterEach(() => {
    document.querySelectorAll('.kc-celebration').forEach((layer) => {
      layer.remove();
    });
  });

  it('shows the must win with its goal, and the other items', () => {
    show([M, A]);
    expect(screen.getByText('Must win')).toBeDefined();
    expect(screen.getByText('Finish slides 1-10').className).toContain('font-semibold');
    expect(screen.getByText('for Slides sent')).toBeDefined();
    expect(screen.getByText('Call Grandma').className).toContain('line-through');
  });

  it('ticks off an item', () => {
    const { onToggle } = show([M, A]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Finish slides 1-10' }));
    expect(onToggle).toHaveBeenCalledWith(M, true);
  });

  it('celebrates a won day with a cheer', () => {
    show([M, { ...A, status: 'open' }]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Finish slides 1-10' }));
    expect(screen.getByRole('status').textContent).toBe('⭐ Day won!');
  });

  it('celebrates the last item of the day as all done', () => {
    show([M, A]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Finish slides 1-10' }));
    expect(screen.getByRole('status').textContent).toBe('🎉 All done for today!');
  });

  it('gives a small burst without a cheer for another item', () => {
    show([M, { ...A, status: 'open' }]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Call Grandma' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelectorAll('.kc-particle').length).toBeGreaterThan(0);
  });

  it('adds another item linked to a goal', () => {
    const { onAdd } = show([M, A]);
    const input = screen.getByRole('textbox', { name: 'One more thing for today…' });
    fireEvent.change(input, { target: { value: ' Book skip ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Goal' }), { target: { value: 'g1' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(onAdd).toHaveBeenCalledWith({ kind: 'also', text: 'Book skip', goalId: 'g1' });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('offers planning with Hemmia on an empty day, and asks for the must win first', () => {
    const { onPlan } = show([]);
    fireEvent.click(screen.getByRole('button', { name: 'Plan my day with Hemmia' }));
    expect(onPlan).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: "Today's must win…" })).toBeDefined();
  });

  it('has no add field when the day is full', () => {
    show([M, A, { ...A, id: 't3', text: 'Third' }]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
