import { type SubmitEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useWeek,
  useAddGoal,
  useUpdateGoal,
  useDeleteGoal,
  useDeletePlan,
  useAddTask,
  useUpdateTask,
  useDeleteTask,
} from '../daily/hooks.ts';
import { TodayCard } from '../components/TodayCard.tsx';
import { celebrate } from '../components/celebrate.ts';
import { useMe } from '../auth/hooks.ts';
import { PageHeader } from '../components/layout.tsx';
import { IconButton } from '@hemmia/ui';
import { SettingsIcon, TrashIcon, PlusIcon } from '@hemmia/ui';
import { type MessageKey, useI18n } from '../i18n/index.tsx';
import { ApiError } from '../api/client.ts';

const card = 'rounded-2xl border border-line bg-card p-5';
const input =
  'min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3.5 text-base focus:border-forest focus:outline-none';
const smallButton = 'min-h-11 shrink-0 rounded-xl px-2 text-muted hover:text-danger';
const primaryButton =
  'min-h-11 rounded-xl bg-forest px-4 font-semibold text-on-forest hover:bg-forest-hover';
const weekButton = 'min-h-11 min-w-11 rounded-xl text-xl hover:bg-champagne';
const secondaryButton =
  'min-h-11 rounded-xl border border-line px-4 font-semibold hover:bg-champagne';

/** The date `n` days after "YYYY-MM-DD". */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "My week": progress, goals for work and home, and the week's appointments. */
export function PlannerPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const me = useMe().data;
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data } = useWeek(week);
  const add = useAddGoal();
  const update = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const removePlan = useDeletePlan();
  const addTask = useAddTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [dayFull, setDayFull] = useState(false);
  const [goalInputs, setGoalInputs] = useState<Record<'work' | 'home', string>>({
    work: '',
    home: '',
  });
  const [errorArea, setErrorArea] = useState<'work' | 'home' | null>(null);

  const header = (
    <PageHeader
      actions={
        <IconButton
          aria-label={t('planner.settings')}
          onClick={() => {
            void navigate('/settings?tab=account');
          }}
        >
          <SettingsIcon />
        </IconButton>
      }
    >
      <h1 className="font-display text-[19px] font-semibold">{t('planner.title')}</h1>
    </PageHeader>
  );
  if (!data) {
    return <div className="flex min-h-0 flex-1 flex-col">{header}</div>;
  }

  const areas = ['work', 'home'] as const;

  const handleAddGoal = (area: 'work' | 'home', e: SubmitEvent) => {
    e.preventDefault();
    const text = goalInputs[area].trim();
    if (!text) return;
    setErrorArea(null);

    add.mutate(
      { week: data.week, area, text },
      {
        onSuccess: () => {
          setGoalInputs((prev) => ({ ...prev, [area]: '' }));
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'too_many_goals') {
            setErrorArea(area);
          }
        },
      },
    );
  };

  const handleUpdateGoal = (id: string, status: 'done' | 'open') => {
    update.mutate({ id, patch: { status } });
  };

  const handleDeleteGoal = (id: string) => {
    deleteGoal.mutate(id);
  };

  const handleDeletePlan = (id: string) => {
    removePlan.mutate(id);
  };

  const showWeek = (n: number) => {
    setErrorArea(null);
    setWeek(addDays(data.week, n));
  };

  // Format date range for display
  const weekStart = new Date(`${data.week}T00:00`);
  const weekEnd = new Date(`${addDays(data.week, 6)}T00:00`);
  const weekRange = `${weekStart.toLocaleDateString(language, { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString(language, { day: 'numeric', month: 'short' })}`;

  // Progress calculation
  const countedGoals = data.goals.filter((goal) => goal.status !== 'dropped');
  const doneCount = countedGoals.filter((goal) => goal.status === 'done').length;
  // Days won: days up to today whose must win got done.
  const musts = data.tasks.filter(
    (task) => task.kind === 'must' && task.status !== 'dropped' && task.date <= data.today,
  );
  const won = musts.filter((task) => task.status === 'done').length;
  /** Done daily steps per goal. */
  const steps = new Map<string, number>();
  for (const task of data.tasks) {
    if (task.goalId && task.status === 'done')
      steps.set(task.goalId, (steps.get(task.goalId) ?? 0) + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-10">
          {/* Week switcher */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label={t('planner.prevWeek')}
              onClick={() => {
                showWeek(-7);
              }}
              className={weekButton}
            >
              ‹
            </button>
            <div className="text-center">
              {data.today >= data.week && data.today <= addDays(data.week, 6) && (
                <p className="text-xs font-semibold uppercase tracking-wide text-forest">
                  {t('planner.thisWeek')}
                </p>
              )}
              <p className="font-medium">{weekRange}</p>
            </div>
            <button
              type="button"
              aria-label={t('planner.nextWeek')}
              onClick={() => {
                showWeek(7);
              }}
              className={weekButton}
            >
              ›
            </button>
          </div>

          {/* Today: the must win and up to two more (only in the current week) */}
          {data.today >= data.week && data.today <= addDays(data.week, 6) && (
            <TodayCard
              tasks={data.tasks.filter(
                (task) => task.date === data.today && task.status !== 'dropped',
              )}
              goals={data.goals}
              onToggle={(task, done) => {
                updateTask.mutate({ id: task.id, patch: { status: done ? 'done' : 'open' } });
              }}
              onAdd={(input) => {
                setDayFull(false);
                addTask.mutate(
                  { date: data.today, ...input },
                  {
                    onError: (err) => {
                      if (err instanceof ApiError && err.code === 'day_full') setDayFull(true);
                    },
                  },
                );
              }}
              onDelete={(task) => {
                deleteTask.mutate(task.id);
              }}
              onPlan={() => {
                void navigate('/daily');
              }}
              error={dayFull ? t('today.full') : null}
            />
          )}

          {/* Progress card */}
          <div className={card}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
              {t('planner.progress', { done: doneCount, total: countedGoals.length })}
              {musts.length > 0 && (
                <span className="text-sm font-medium text-muted">
                  {t('planner.daysWon', { won, days: musts.length })}
                </span>
              )}
            </p>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {countedGoals.map((goal) => (
                <span
                  key={goal.id}
                  className={`h-2 flex-1 rounded-full ${
                    goal.status === 'done' ? 'bg-forest' : 'bg-line'
                  }`}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigate('/daily?kind=week');
                }}
                className={primaryButton}
              >
                {t('planner.planWithKchat')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigate('/daily');
                }}
                className={secondaryButton}
              >
                {t('planner.today')}
              </button>
            </div>
          </div>

          {/* Goals by area */}
          {areas.map((area) => {
            const areaGoals = data.goals.filter(
              (goal) => goal.area === area && goal.status !== 'dropped',
            );
            // Teenagers: "School" instead of "Work".
            const areaLabel = t(
              area === 'work' && me?.restricted === true
                ? 'planner.area.school'
                : (`planner.area.${area}` as MessageKey),
            );

            return (
              <div key={area} className={card}>
                <h2 className="mb-3 font-display text-lg font-semibold">{areaLabel}</h2>
                {areaGoals.length > 0 ? (
                  <ul className="divide-y divide-line">
                    {areaGoals.map((goal) => (
                      <li key={goal.id} className="flex min-h-12 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={goal.status === 'done'}
                          aria-label={
                            goal.status === 'done'
                              ? t('planner.markOpen', { goal: goal.text })
                              : t('planner.markDone', { goal: goal.text })
                          }
                          className="h-5 w-5 shrink-0 accent-[var(--forest)]"
                          onChange={(e) => {
                            const checked = e.target.checked;
                            handleUpdateGoal(goal.id, checked ? 'done' : 'open');
                            if (!checked) return;
                            const weekDone = countedGoals.every(
                              (g) => g.id === goal.id || g.status === 'done',
                            );
                            celebrate({
                              from: e.target,
                              big: true,
                              text: t(
                                weekDone && countedGoals.length > 1
                                  ? 'cheer.weekDone'
                                  : 'cheer.goalDone',
                              ),
                            });
                          }}
                        />
                        <span
                          className={`min-w-0 flex-1 ${
                            goal.status === 'done' ? 'text-muted line-through' : ''
                          }`}
                        >
                          {goal.text}
                        </span>
                        {(steps.get(goal.id) ?? 0) > 0 && (
                          <span className="shrink-0 text-xs text-muted">
                            {t('planner.steps', { count: steps.get(goal.id) ?? 0 })}
                          </span>
                        )}
                        {goal.day && (
                          <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-xs text-muted">
                            {new Date(`${goal.day}T00:00`).toLocaleDateString(language, {
                              weekday: 'short',
                            })}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={t('planner.deleteGoal', { goal: goal.text })}
                          className={smallButton}
                          onClick={() => {
                            handleDeleteGoal(goal.id);
                          }}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t('planner.noGoals')}</p>
                )}

                {/* Add form */}
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    handleAddGoal(area, e);
                  }}
                >
                  <input
                    name={`goal-${area}`}
                    aria-label={`${t('planner.addGoal')}: ${areaLabel}`}
                    placeholder={t('planner.addPlaceholder')}
                    maxLength={200}
                    className={input}
                    value={goalInputs[area]}
                    onChange={(e) => {
                      setGoalInputs((prev) => ({ ...prev, [area]: e.target.value }));
                    }}
                  />
                  <IconButton
                    aria-label={t('planner.addGoal')}
                    type="submit"
                    disabled={add.isPending}
                  >
                    <PlusIcon />
                  </IconButton>
                </form>

                {errorArea === area && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {t('planner.tooMany')}
                  </p>
                )}
              </div>
            );
          })}

          {/* Tip */}
          <p className="px-1 text-sm text-muted">{t('planner.tip')}</p>

          {/* Appointments card */}
          <div className={card}>
            <h2 className="mb-3 font-display text-lg font-semibold">{t('planner.appointments')}</h2>
            {data.plans.length > 0 ? (
              <ul className="divide-y divide-line">
                {data.plans.map((plan) => (
                  <li key={plan.id} className="flex min-h-11 items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 font-medium">
                      {new Date(`${plan.date}T00:00`).toLocaleDateString(language, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span className="w-14 shrink-0 text-muted">
                      {plan.time ?? t('daily.allDay')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{plan.text}</span>
                    <button
                      type="button"
                      aria-label={`${t('daily.deletePlan')}: ${plan.text}`}
                      className={smallButton}
                      onClick={() => {
                        handleDeletePlan(plan.id);
                      }}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('planner.noAppointments')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
