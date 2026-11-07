/**
 * Planner tools for the chat model: plans the user mentions ("dentist on Thursday at 10")
 * and weekly goals for work and home. Stored encrypted per user (db/daily.ts).
 */
import { z } from 'zod';
import type { DayTask, Goal, Plan } from '@hemmia/shared';
import type { ToolSpec } from '../llm/types.ts';

export const SAVE_PLAN_TOOL: ToolSpec = {
  name: 'save_plan',
  description:
    'Save an appointment, plan or reminder the user mentions for a specific day (e.g. "dentist on Thursday at 10", ' +
    '"remind me about Grandma\'s birthday on 12 October"). Work out the exact date from today\'s date. ' +
    'Confirm briefly afterwards. Do not save things without a day.',
  parameters: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'The day, as YYYY-MM-DD.' },
      time: { type: 'string', description: 'Start time as HH:MM (24 h), if known.' },
      text: { type: 'string', description: "What it is, short, in the user's words." },
    },
    required: ['date', 'text'],
  },
};

export const LIST_PLANS_TOOL: ToolSpec = {
  name: 'list_plans',
  description:
    'Look up the plans the user saved for a range of days, e.g. when asked "what\'s on this week?" or ' +
    '"do I have anything on Friday?".',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'First day, YYYY-MM-DD.' },
      to: { type: 'string', description: 'Last day, YYYY-MM-DD.' },
    },
    required: ['from', 'to'],
  },
};

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const SavePlanArgs = z.object({
  date: Day,
  time: z
    .string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/)
    .transform((t) => t.padStart(5, '0'))
    .optional()
    .nullable(),
  text: z.string().trim().min(1).max(300),
});
export const ListPlansArgs = z.object({ from: Day, to: Day });

/** How a list of plans reads for the model. */
export function plansText(plans: readonly Plan[]): string {
  if (plans.length === 0) return 'No plans saved for these days.';
  return plans.map((p) => `- ${p.date}${p.time ? ` ${p.time}` : ''}: ${p.text}`).join('\n');
}

export const ADD_GOAL_TOOL: ToolSpec = {
  name: 'add_goal',
  description:
    'Add a weekly goal for the user, only after they agreed to it. Phrase it as a short, concrete outcome ' +
    '("Tax return submitted"), not an activity. At most 3 per area and week.',
  parameters: {
    type: 'object',
    properties: {
      area: {
        type: 'string',
        enum: ['work', 'home'],
        description: 'work (for teenagers: school) or home (household, family, personal).',
      },
      text: { type: 'string', description: 'The goal, short.' },
      week: {
        type: 'string',
        enum: ['this', 'next'],
        description: 'This week (default) or next week.',
      },
      day: { type: 'string', description: 'Optional day it is planned for, YYYY-MM-DD.' },
    },
    required: ['area', 'text'],
  },
};

export const UPDATE_GOAL_TOOL: ToolSpec = {
  name: 'update_goal',
  description:
    'Change a weekly goal: mark it done when the user says they finished it, drop it, plan it for a day, ' +
    'move it to this or next week (to carry it over), or reword it.',
  parameters: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The goal id from list_goals, or its text.' },
      status: { type: 'string', enum: ['open', 'done', 'dropped'] },
      day: { type: 'string', description: 'Day it is planned for, YYYY-MM-DD, or "none".' },
      week: {
        type: 'string',
        enum: ['this', 'next'],
        description: 'Move it to this or next week.',
      },
      text: { type: 'string', description: 'New wording.' },
    },
    required: ['goal'],
  },
};

export const LIST_GOALS_TOOL: ToolSpec = {
  name: 'list_goals',
  description: "Look up the user's weekly goals and whether they are done.",
  parameters: {
    type: 'object',
    properties: {
      week: { type: 'string', enum: ['last', 'this', 'next'], description: 'Default: this.' },
    },
  },
};

const WeekRef = z.enum(['last', 'this', 'next']);
const Area = z
  .string()
  .transform((a) => a.trim().toLowerCase())
  .pipe(z.enum(['work', 'home', 'school']))
  .transform((a) => (a === 'school' ? 'work' : a));
export const AddGoalArgs = z.object({
  area: Area,
  text: z.string().trim().min(1).max(200),
  week: z.enum(['this', 'next']).optional().nullable(),
  day: Day.optional().nullable(),
});
export const UpdateGoalArgs = z.object({
  goal: z.string().trim().min(1).max(200),
  status: z.enum(['open', 'done', 'dropped']).optional().nullable(),
  day: z
    .union([Day, z.literal('none'), z.literal('')])
    .optional()
    .nullable(),
  week: z.enum(['this', 'next']).optional().nullable(),
  text: z.string().trim().min(1).max(200).optional().nullable(),
});
export const ListGoalsArgs = z.object({ week: WeekRef.optional().nullable() });

/** The short id the model sees and passes back. */
export const shortId = (id: string) => id.slice(0, 8);

/**
 * Finds the goal the model means: by (short) id, else by text. Candidates are ordered by
 * preference (this week first); returns the goal, or a message for the model.
 */
export function matchGoal(candidates: readonly Goal[], ref: string): Goal | string {
  return matchItem(candidates, ref, (g) => g.week, 'goal', goalsText);
}

/** Finds the daily item the model means (candidates ordered by preference, today first). */
export function matchTask(candidates: readonly DayTask[], ref: string): DayTask | string {
  return matchItem(
    candidates,
    ref,
    (t) => t.date,
    'item',
    (ts) => tasksText(ts, []),
  );
}

/** By (short) id, exact text, part of the text, then shared words; within one group. */
function matchItem<T extends { id: string; text: string }>(
  candidates: readonly T[],
  ref: string,
  group: (item: T) => string,
  noun: string,
  list: (items: T[]) => string,
): T | string {
  const r = ref.trim().toLowerCase();
  // An id, alone or inside a copied line ("Slides (id 1a2b3c4d, …)").
  const quoted = /\bid[:\s]+([0-9a-f]{6,})/.exec(r)?.[1];
  const byId = candidates.filter(
    (g) =>
      (r.length >= 6 && g.id.toLowerCase().startsWith(r)) ||
      (quoted !== undefined && g.id.toLowerCase().startsWith(quoted)),
  );
  if (byId[0]) return byId[0];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const exact = candidates.filter((g) => norm(g.text) === norm(r));
  if (exact[0]) return exact[0];
  const partial = candidates.filter(
    (g) => norm(g.text).includes(norm(r)) || norm(r).includes(norm(g.text)),
  );
  // Last resort: shared words ("Der Keller" → "Keller ausgeräumt").
  const words = (s: string) =>
    norm(s)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4);
  const refWords = words(r);
  const score = (g: T) =>
    refWords.filter((w) => words(g.text).some((x) => x.startsWith(w) || w.startsWith(x))).length;
  const best = Math.max(0, ...candidates.map(score));
  const byWords = best > 0 ? candidates.filter((g) => score(g) === best) : [];
  const pool = partial.length > 0 ? partial : byWords;
  const first = pool[0];
  if (!first) return `No ${noun} matches; pass its id.`;
  const same = pool.filter((g) => group(g) === group(first));
  return same.length === 1 ? first : `Several match; pass the id:\n${list(same)}`;
}

/** How goals read for the model. */
export function goalsText(goals: readonly Goal[]): string {
  if (goals.length === 0) return 'No goals for this week yet.';
  return goals
    .map(
      (g) =>
        `- [${g.status}] ${g.area}: ${g.text} (id ${shortId(g.id)}` +
        `${g.day ? `, planned ${g.day}` : ''}${g.doneOn ? `, done ${g.doneOn}` : ''})`,
    )
    .join('\n');
}

/** "3 of 5 done ▓▓▓░░" for a week's goals (dropped ones don't count), in the app language. */
export function progressLine(goals: readonly Goal[], language: 'en' | 'de' = 'en'): string {
  const counted = goals.filter((g) => g.status !== 'dropped');
  const done = counted.filter((g) => g.status === 'done').length;
  const bar = '▓'.repeat(done) + '░'.repeat(counted.length - done);
  const n = String(done);
  const total = String(counted.length);
  return language === 'de' ? `${n} von ${total} erledigt ${bar}` : `${n} of ${total} done ${bar}`;
}

export const SET_DAY_TOOL: ToolSpec = {
  name: 'set_day_plan',
  description:
    "Save a day's plan once the user agreed to it: one must win (the one thing that makes the day a success, " +
    'ideally the next concrete step toward a weekly goal) and up to two more items. Replaces the open items of that day.',
  parameters: {
    type: 'object',
    properties: {
      day: { type: 'string', description: '"today", "tomorrow" or YYYY-MM-DD. Default: today.' },
      must_win: { type: 'string', description: 'The must win, short and concrete.' },
      must_win_goal: {
        type: 'string',
        description: 'Id of the weekly goal it moves forward, if any.',
      },
      also: {
        type: 'array',
        description: 'Up to two more items.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            goal: { type: 'string', description: 'Weekly goal id, if any.' },
          },
          required: ['text'],
        },
      },
    },
    required: ['must_win'],
  },
};

export const UPDATE_TASK_TOOL: ToolSpec = {
  name: 'update_day_item',
  description:
    "Change one of the day's items: mark it done when the user says they did it, drop it, or move it to another day.",
  parameters: {
    type: 'object',
    properties: {
      item: { type: 'string', description: 'The item id, or its text.' },
      status: { type: 'string', enum: ['open', 'done', 'dropped'] },
      day: { type: 'string', description: 'Move it: "today", "tomorrow" or YYYY-MM-DD.' },
    },
    required: ['item'],
  },
};

const DayRef = z.union([z.literal('today'), z.literal('tomorrow'), Day]);
const Text = z.string().trim().min(1).max(200);
export const SetDayArgs = z.object({
  day: DayRef.optional().nullable(),
  must_win: Text,
  must_win_goal: z.string().trim().max(64).optional().nullable(),
  also: z
    .array(z.object({ text: Text, goal: z.string().trim().max(64).optional().nullable() }))
    .max(5)
    .optional()
    .nullable(),
});
export const UpdateTaskArgs = z.object({
  item: z.string().trim().min(1).max(200),
  status: z.enum(['open', 'done', 'dropped']).optional().nullable(),
  day: DayRef.optional().nullable(),
});

/** How daily items read for the model, with the goal each one serves. */
export function tasksText(tasks: readonly DayTask[], goals: readonly Goal[]): string {
  if (tasks.length === 0) return 'Nothing planned.';
  const goalText = new Map(goals.map((g) => [g.id, g.text]));
  return tasks
    .map((t) => {
      const goal = t.goalId ? goalText.get(t.goalId) : undefined;
      return (
        `- [${t.status}] ${t.kind === 'must' ? 'MUST WIN' : 'also'}: ${t.text} (id ${shortId(t.id)}` +
        `${goal ? `, for goal "${goal}"` : ''})`
      );
    })
    .join('\n');
}

/** Days of a week (up to today) that had a must win, and how many of those were won. */
export function daysWon(tasks: readonly DayTask[], upTo: string): { won: number; days: number } {
  const musts = tasks.filter((t) => t.kind === 'must' && t.status !== 'dropped' && t.date <= upTo);
  return { won: musts.filter((t) => t.status === 'done').length, days: musts.length };
}
