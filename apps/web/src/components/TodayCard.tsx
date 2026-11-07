import { type SubmitEvent, useState } from 'react';
import type { DayTask, Goal } from '@hemmia/shared';
import { useI18n } from '../i18n/index.tsx';
import { PlusIcon, StarIcon, TrashIcon } from '@hemmia/ui';
import { IconButton } from '@hemmia/ui';
import { celebrate } from './celebrate.ts';

export interface TodayCardProps {
  /** Today's items (open or done), the must win first. */
  tasks: DayTask[];
  /** This week's goals (for the "for <goal>" label and the goal select). */
  goals: Goal[];
  onToggle: (task: DayTask, done: boolean) => void;
  onAdd: (input: { kind: 'must' | 'also'; text: string; goalId: string | null }) => void;
  onDelete: (task: DayTask) => void;
  onPlan: () => void;
  /** Shown under the add form when set (e.g. the day is full). */
  error?: string | null;
}

/** Today: the ⭐ must win and up to two more items, with a quick add. */
export function TodayCard({
  tasks,
  goals,
  onToggle,
  onAdd,
  onDelete,
  onPlan,
  error,
}: TodayCardProps) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [goalId, setGoalId] = useState('');
  const must = tasks.find((task) => task.kind === 'must');
  const also = tasks.filter((task) => task.kind === 'also');
  const full = must !== undefined && also.length >= 2;
  const kind = must ? 'also' : 'must';
  const openGoals = goals.filter((g) => g.status === 'open');
  const goalText = new Map(goals.map((g) => [g.id, g.text]));

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({ kind, text: trimmed, goalId: goalId || null });
    setText('');
    setGoalId('');
  };

  return (
    <section
      className="rounded-2xl border border-forest/40 bg-card p-5"
      aria-label={t('today.title')}
    >
      <h2 className="font-display text-lg font-semibold">{t('today.title')}</h2>
      {tasks.length === 0 ? (
        <>
          <p className="mt-2 text-sm text-muted">{t('today.empty')}</p>
          <button
            type="button"
            onClick={onPlan}
            className="mt-3 min-h-11 rounded-xl bg-forest px-4 font-semibold text-on-forest hover:bg-forest-hover"
          >
            {t('today.plan')}
          </button>
        </>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {[...(must ? [must] : []), ...also].map((task) => {
            const done = task.status === 'done';
            const goal = task.goalId ? goalText.get(task.goalId) : undefined;
            return (
              <li key={task.id} className="flex min-h-12 items-center gap-3 py-1">
                <input
                  type="checkbox"
                  checked={done}
                  aria-label={t(done ? 'today.markOpen' : 'today.markDone', { item: task.text })}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    onToggle(task, checked);
                    if (!checked) return;
                    const allDone = tasks.every(
                      (other) => other.id === task.id || other.status === 'done',
                    );
                    if (allDone && tasks.length > 1) {
                      celebrate({ from: e.target, big: true, text: t('cheer.allDone') });
                    } else if (task.kind === 'must') {
                      celebrate({ from: e.target, big: true, text: t('cheer.dayWon') });
                    } else {
                      celebrate({ from: e.target });
                    }
                  }}
                  className="h-5 w-5 shrink-0 accent-[var(--forest)]"
                />
                <div className="min-w-0 flex-1">
                  {task.kind === 'must' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-forest uppercase">
                      <StarIcon filled size={13} />
                      {t('today.mustWin')}
                    </span>
                  )}
                  <p
                    className={`${task.kind === 'must' ? 'font-semibold' : ''}${done ? ' text-muted line-through' : ''}`}
                  >
                    {task.text}
                  </p>
                  {goal && <p className="text-xs text-muted">{t('today.forGoal', { goal })}</p>}
                </div>
                <button
                  type="button"
                  aria-label={t('today.delete', { item: task.text })}
                  onClick={() => {
                    onDelete(task);
                  }}
                  className="min-h-11 shrink-0 rounded-xl px-2 text-muted hover:text-danger"
                >
                  <TrashIcon size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!full && (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            aria-label={t(kind === 'must' ? 'today.addMust' : 'today.addAlso')}
            placeholder={t(kind === 'must' ? 'today.addMust' : 'today.addAlso')}
            maxLength={200}
            className="min-h-11 min-w-0 flex-1 basis-48 rounded-xl border border-line bg-paper px-3.5 text-base focus:border-forest focus:outline-none"
          />
          {openGoals.length > 0 && (
            <select
              value={goalId}
              onChange={(e) => {
                setGoalId(e.target.value);
              }}
              aria-label={t('today.goal')}
              className="min-h-11 max-w-full rounded-xl border border-line bg-paper px-3 text-sm"
            >
              <option value="">{t('today.noGoal')}</option>
              {openGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.text}
                </option>
              ))}
            </select>
          )}
          <IconButton type="submit" aria-label={t('today.add')}>
            <PlusIcon />
          </IconButton>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
