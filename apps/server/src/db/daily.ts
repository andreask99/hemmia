/**
 * Planner settings, plans and weekly goals. Owned by Claude (encryption, per-user isolation).
 *
 * The star sign, the home town and towns nearby, every plan (date, time, text) and every goal (area, text, status, days) are
 * encrypted with the user's data key, so they can only be read while the user is signed in.
 * Notification times and switches stay in clear: the server needs them to send the
 * content-free notifications. A goal's week is in clear too, for lookups.
 */
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  type DailySettings,
  DayTask,
  Goal,
  type GoalArea,
  MAX_ALSO_PER_DAY,
  MAX_GOALS_PER_AREA,
  Nearby,
  Plan,
  type UpdateGoalRequest,
  Town,
  type UpdateTaskRequest,
  ZodiacSign,
} from '@hemmia/shared';
import { aadColumn, decryptString, encryptString } from '../security/crypto.ts';
import type { UserKey } from './chats.ts';
import type { DB } from './database.ts';

interface SettingsRow {
  enabled: 0 | 1;
  time: string;
  horoscope: 0 | 1;
  plans: 0 | 1;
  goals: 0 | 1;
  week_day: number;
  week_time: string;
  evening: 0 | 1;
  evening_time: string;
  sign: Buffer | null;
  town: Buffer | null;
  nearby: Buffer | null;
}

const PlanData = Plan.omit({ id: true });
const GoalData = Goal.omit({ id: true, week: true });
const TaskData = DayTask.omit({ id: true, date: true });
/** Plans per user; the oldest past ones go first when the limit is reached. */
const MAX_PLANS = 500;

export const DEFAULT_DAILY: DailySettings = {
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

export type NotificationKind = 'daily' | 'week' | 'evening';

/** A planner notification that is due (no key needed: only clear columns). */
export interface DueNotification {
  userId: string;
  language: 'en' | 'de';
  restricted: boolean;
  defaultModelId: string | null;
  kind: NotificationKind;
  /** Weekly planning stands in for today's morning snapshot. */
  alsoDaily: boolean;
}

export function createDailyRepo(db: DB, now: () => number = Date.now) {
  const signAad = (userId: string) => aadColumn(userId, 'daily_settings', userId, 'sign');
  const townAad = (userId: string) => aadColumn(userId, 'daily_settings', userId, 'town');
  const nearbyAad = (userId: string) => aadColumn(userId, 'daily_settings', userId, 'nearby');
  const planAad = (userId: string, id: string) => aadColumn(userId, 'plans', id, 'data');
  const goalAad = (userId: string, id: string) => aadColumn(userId, 'goals', id, 'data');
  const taskAad = (userId: string, id: string) => aadColumn(userId, 'day_tasks', id, 'data');

  function taskFrom(u: UserKey, r: { id: string; date: string; data: Buffer }): DayTask {
    const data = TaskData.parse(
      JSON.parse(decryptString(u.dek, r.data, taskAad(u.userId, r.id))) as unknown,
    );
    return { id: r.id, date: r.date, ...data };
  }

  /** Daily items from `from` to `to` (inclusive), by day, the must win first. */
  function tasks(u: UserKey, from: string, to: string): DayTask[] {
    return db
      .prepare<[string, string, string], { id: string; date: string; data: Buffer }>(
        `SELECT id, date, data FROM day_tasks WHERE user_id = ? AND date >= ? AND date <= ?
         ORDER BY date, created_at, rowid`,
      )
      .all(u.userId, from, to)
      .map((r) => taskFrom(u, r))
      .sort((a, b) =>
        a.date !== b.date
          ? a.date.localeCompare(b.date)
          : a.kind === b.kind
            ? 0
            : a.kind === 'must'
              ? -1
              : 1,
      );
  }

  /** Room on that day for one more item of this kind (the item itself excluded when moving). */
  const dayHasRoom = (u: UserKey, date: string, kind: 'must' | 'also', except?: string) => {
    const same = tasks(u, date, date).filter(
      (t) => t.kind === kind && t.status !== 'dropped' && t.id !== except,
    ).length;
    return same < (kind === 'must' ? 1 : MAX_ALSO_PER_DAY);
  };

  function insertTask(
    u: UserKey,
    t: { date: string; kind: 'must' | 'also'; text: string; goalId: string | null },
  ): DayTask {
    const id = randomUUID();
    const data = TaskData.parse({ kind: t.kind, text: t.text, goalId: t.goalId, status: 'open' });
    db.prepare(
      'INSERT INTO day_tasks (id, user_id, date, data, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      id,
      u.userId,
      t.date,
      encryptString(u.dek, JSON.stringify(data), taskAad(u.userId, id)),
      now(),
    );
    return { id, date: t.date, ...data };
  }

  function plans(u: UserKey): Plan[] {
    return db
      .prepare<[string], { id: string; data: Buffer }>(
        'SELECT id, data FROM plans WHERE user_id = ?',
      )
      .all(u.userId)
      .map((r) => ({
        id: r.id,
        ...PlanData.parse(
          JSON.parse(decryptString(u.dek, r.data, planAad(u.userId, r.id))) as unknown,
        ),
      }))
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
  }

  function goalFrom(u: UserKey, r: { id: string; week: string; data: Buffer }): Goal {
    const data = GoalData.parse(
      JSON.parse(decryptString(u.dek, r.data, goalAad(u.userId, r.id))) as unknown,
    );
    return { id: r.id, week: r.week, ...data };
  }

  function goals(u: UserKey, week: string): Goal[] {
    return db
      .prepare<[string, string], { id: string; week: string; data: Buffer }>(
        'SELECT id, week, data FROM goals WHERE user_id = ? AND week = ? ORDER BY created_at, rowid',
      )
      .all(u.userId, week)
      .map((r) => goalFrom(u, r))
      .sort((a, b) => (a.area === b.area ? 0 : a.area === 'work' ? -1 : 1));
  }

  function writeGoal(u: UserKey, g: Goal): void {
    const { id, week, ...data } = g;
    db.prepare('UPDATE goals SET week = ?, data = ? WHERE id = ? AND user_id = ?').run(
      week,
      encryptString(u.dek, JSON.stringify(GoalData.parse(data)), goalAad(u.userId, id)),
      id,
      u.userId,
    );
  }

  /** Room for one more goal in this area and week (the goal itself excluded when moving). */
  const hasRoom = (u: UserKey, week: string, area: GoalArea, except?: string) =>
    goals(u, week).filter((g) => g.area === area && g.status !== 'dropped' && g.id !== except)
      .length < MAX_GOALS_PER_AREA;

  return {
    getSettings(u: UserKey): DailySettings {
      const row = db
        .prepare<[string], SettingsRow>(
          `SELECT enabled, time, horoscope, plans, goals, week_day, week_time, evening,
             evening_time, sign, town, nearby FROM daily_settings WHERE user_id = ?`,
        )
        .get(u.userId);
      if (!row) return DEFAULT_DAILY;
      const sign = row.sign
        ? ZodiacSign.safeParse(decryptString(u.dek, row.sign, signAad(u.userId)))
        : null;
      const town = row.town
        ? Town.safeParse(decryptString(u.dek, row.town, townAad(u.userId)))
        : null;
      const nearby = row.nearby
        ? Nearby.safeParse(JSON.parse(decryptString(u.dek, row.nearby, nearbyAad(u.userId))))
        : null;
      return {
        enabled: row.enabled === 1,
        time: row.time,
        sign: sign?.success ? sign.data : null,
        horoscope: row.horoscope === 1,
        plans: row.plans === 1,
        goals: row.goals === 1,
        weekDay: row.week_day,
        weekTime: row.week_time,
        evening: row.evening === 1,
        eveningTime: row.evening_time,
        town: town?.success ? town.data : null,
        nearby: nearby?.success ? nearby.data : [],
      };
    },

    saveSettings(u: UserKey, s: DailySettings): DailySettings {
      db.prepare(
        `INSERT INTO daily_settings (user_id, enabled, time, horoscope, plans, goals, week_day,
           week_time, evening, evening_time, sign, town, nearby, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, time = excluded.time,
           horoscope = excluded.horoscope, plans = excluded.plans, goals = excluded.goals,
           week_day = excluded.week_day, week_time = excluded.week_time,
           evening = excluded.evening, evening_time = excluded.evening_time,
           sign = excluded.sign, town = excluded.town, nearby = excluded.nearby,
           updated_at = excluded.updated_at`,
      ).run(
        u.userId,
        s.enabled ? 1 : 0,
        s.time,
        s.horoscope ? 1 : 0,
        s.plans ? 1 : 0,
        s.goals ? 1 : 0,
        s.weekDay,
        s.weekTime,
        s.evening ? 1 : 0,
        s.eveningTime,
        s.sign ? encryptString(u.dek, s.sign, signAad(u.userId)) : null,
        s.town ? encryptString(u.dek, s.town, townAad(u.userId)) : null,
        s.nearby.length > 0
          ? encryptString(u.dek, JSON.stringify(s.nearby), nearbyAad(u.userId))
          : null,
        now(),
      );
      return this.getSettings(u);
    },

    /**
     * Notifications due now that haven't gone out today (no key needed). On the weekly
     * planning day, a morning snapshot at or after the planning time is folded into the
     * planning notification (`alsoDaily`), so nobody gets two at once.
     */
    due(today: string, weekday: number, time: string): DueNotification[] {
      const rows = db
        .prepare<
          [],
          {
            userId: string;
            language: 'en' | 'de';
            restricted: 0 | 1;
            defaultModelId: string | null;
            time: string;
            week_day: number;
            week_time: string;
            evening: 0 | 1;
            evening_time: string;
            last_sent_on: string | null;
            week_sent_on: string | null;
            evening_sent_on: string | null;
          }
        >(
          `SELECT d.user_id AS userId, u.language AS language, u.restricted AS restricted,
             u.default_model_id AS defaultModelId, d.time, d.week_day, d.week_time,
             d.evening, d.evening_time, d.last_sent_on, d.week_sent_on, d.evening_sent_on
           FROM daily_settings d JOIN users u ON u.id = d.user_id
           WHERE d.enabled = 1 AND u.disabled_at IS NULL`,
        )
        .all();
      const out: DueNotification[] = [];
      const notYet = (sent: string | null) => sent === null || sent < today;
      for (const r of rows) {
        const user = {
          userId: r.userId,
          language: r.language,
          restricted: r.restricted === 1,
          defaultModelId: r.defaultModelId,
        };
        const planningDay = r.week_day === weekday;
        const folded = planningDay && r.week_time <= r.time;
        if (planningDay && r.week_time <= time && notYet(r.week_sent_on)) {
          out.push({ ...user, kind: 'week', alsoDaily: folded });
        } else if (!folded && r.time <= time && notYet(r.last_sent_on)) {
          out.push({ ...user, kind: 'daily', alsoDaily: false });
        }
        if (r.evening === 1 && r.evening_time <= time && notYet(r.evening_sent_on)) {
          out.push({ ...user, kind: 'evening', alsoDaily: false });
        }
      }
      return out;
    },

    markSent(userId: string, kind: NotificationKind, today: string): void {
      const column =
        kind === 'week' ? 'week_sent_on' : kind === 'evening' ? 'evening_sent_on' : 'last_sent_on';
      db.prepare(`UPDATE daily_settings SET ${column} = ? WHERE user_id = ?`).run(today, userId);
    },

    listPlans: plans,

    /** Plans from `from` (inclusive) to `to` (inclusive), "YYYY-MM-DD". */
    plansBetween(u: UserKey, from: string, to: string): Plan[] {
      return plans(u).filter((p) => p.date >= from && p.date <= to);
    },

    addPlan(u: UserKey, plan: z.infer<typeof PlanData>): Plan {
      const data = PlanData.parse(plan);
      const id = randomUUID();
      db.prepare('INSERT INTO plans (id, user_id, data, created_at) VALUES (?, ?, ?, ?)').run(
        id,
        u.userId,
        encryptString(u.dek, JSON.stringify(data), planAad(u.userId, id)),
        now(),
      );
      const all = plans(u);
      for (const old of all.slice(0, Math.max(0, all.length - MAX_PLANS))) {
        db.prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(old.id, u.userId);
      }
      return { id, ...data };
    },

    deletePlan(u: UserKey, id: string): boolean {
      return (
        db.prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(id, u.userId).changes === 1
      );
    },

    /** Removes plans dated before `before` and goals of weeks before `goalsBefore`. */
    prune(u: UserKey, before: string, goalsBefore?: string): void {
      for (const p of plans(u)) {
        if (p.date < before)
          db.prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(p.id, u.userId);
      }
      if (goalsBefore) {
        db.prepare('DELETE FROM goals WHERE user_id = ? AND week < ?').run(u.userId, goalsBefore);
        db.prepare('DELETE FROM day_tasks WHERE user_id = ? AND date < ?').run(
          u.userId,
          goalsBefore,
        );
      }
    },

    /** The goals of a week (its Monday), work first. */
    listGoals: goals,

    getGoal(u: UserKey, id: string): Goal | null {
      const r = db
        .prepare<[string, string], { id: string; week: string; data: Buffer }>(
          'SELECT id, week, data FROM goals WHERE id = ? AND user_id = ?',
        )
        .get(id, u.userId);
      return r ? goalFrom(u, r) : null;
    },

    /** Adds a goal; null when the area already has the maximum for that week. */
    addGoal(
      u: UserKey,
      g: { week: string; area: GoalArea; text: string; day?: string | null },
    ): Goal | null {
      const week = weekStart(g.week);
      if (!hasRoom(u, week, g.area)) return null;
      const id = randomUUID();
      const data = GoalData.parse({
        area: g.area,
        text: g.text,
        status: 'open',
        day: g.day ?? null,
        doneOn: null,
      });
      db.prepare(
        'INSERT INTO goals (id, user_id, week, data, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        id,
        u.userId,
        week,
        encryptString(u.dek, JSON.stringify(data), goalAad(u.userId, id)),
        now(),
      );
      return { id, week, ...data };
    },

    /**
     * Changes a goal. Done sets doneOn to today; moving to another week clears a planned day
     * outside it. Null when the goal doesn't exist (for this user) or the target is full.
     */
    updateGoal(u: UserKey, id: string, patch: UpdateGoalRequest): Goal | null {
      const g = this.getGoal(u, id);
      if (!g) return null;
      const next: Goal = { ...g };
      if (patch.text !== undefined) next.text = patch.text;
      if (patch.area !== undefined) next.area = patch.area;
      if (patch.week !== undefined) next.week = weekStart(patch.week);
      if (patch.day !== undefined) next.day = patch.day;
      if (patch.status !== undefined && patch.status !== g.status) {
        next.status = patch.status;
        next.doneOn = patch.status === 'done' ? localDateTime(now()).date : null;
      }
      if (next.day !== null && weekStart(next.day) !== next.week) next.day = null;
      const moved = next.week !== g.week || next.area !== g.area;
      if (moved && next.status !== 'dropped' && !hasRoom(u, next.week, next.area, id)) return null;
      writeGoal(u, next);
      return next;
    },

    deleteGoal(u: UserKey, id: string): boolean {
      return (
        db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, u.userId).changes === 1
      );
    },

    listTasks: tasks,

    getTask(u: UserKey, id: string): DayTask | null {
      const r = db
        .prepare<[string, string], { id: string; date: string; data: Buffer }>(
          'SELECT id, date, data FROM day_tasks WHERE id = ? AND user_id = ?',
        )
        .get(id, u.userId);
      return r ? taskFrom(u, r) : null;
    },

    /** Adds a daily item; null when the day already has its must win or two others. */
    addTask(
      u: UserKey,
      t: { date: string; kind: 'must' | 'also'; text: string; goalId?: string | null },
    ): DayTask | null {
      if (!dayHasRoom(u, t.date, t.kind)) return null;
      const goalId = t.goalId && this.getGoal(u, t.goalId) ? t.goalId : null;
      return insertTask(u, { date: t.date, kind: t.kind, text: t.text, goalId });
    },

    /** Changes a daily item; null when it isn't the user's or the target day is full. */
    updateTask(u: UserKey, id: string, patch: UpdateTaskRequest): DayTask | null {
      const t = this.getTask(u, id);
      if (!t) return null;
      const next: DayTask = { ...t };
      if (patch.text !== undefined) next.text = patch.text;
      if (patch.kind !== undefined) next.kind = patch.kind;
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.date !== undefined) next.date = patch.date;
      if (patch.goalId !== undefined)
        next.goalId = patch.goalId && this.getGoal(u, patch.goalId) ? patch.goalId : null;
      const moved = next.date !== t.date || next.kind !== t.kind;
      if (moved && next.status !== 'dropped' && !dayHasRoom(u, next.date, next.kind, id))
        return null;
      const { id: _id, date, ...data } = next;
      db.prepare('UPDATE day_tasks SET date = ?, data = ? WHERE id = ? AND user_id = ?').run(
        date,
        encryptString(u.dek, JSON.stringify(TaskData.parse(data)), taskAad(u.userId, id)),
        id,
        u.userId,
      );
      return next;
    },

    deleteTask(u: UserKey, id: string): boolean {
      return (
        db.prepare('DELETE FROM day_tasks WHERE id = ? AND user_id = ?').run(id, u.userId)
          .changes === 1
      );
    },

    /**
     * Sets a day's plan: replaces its open items (done ones stay) with a must win and up to
     * two more. A must win already done that day stays the day's must win.
     */
    setDay(
      u: UserKey,
      date: string,
      plan: {
        must: { text: string; goalId: string | null } | null;
        also: { text: string; goalId: string | null }[];
      },
    ): DayTask[] {
      db.transaction(() => {
        for (const t of tasks(u, date, date)) {
          if (t.status === 'open')
            db.prepare('DELETE FROM day_tasks WHERE id = ? AND user_id = ?').run(t.id, u.userId);
        }
        const valid = (g: string | null) => (g && this.getGoal(u, g) ? g : null);
        if (plan.must && dayHasRoom(u, date, 'must')) {
          insertTask(u, {
            date,
            kind: 'must',
            text: plan.must.text,
            goalId: valid(plan.must.goalId),
          });
        }
        for (const a of plan.also) {
          if (!dayHasRoom(u, date, 'also')) break;
          insertTask(u, { date, kind: 'also', text: a.text, goalId: valid(a.goalId) });
        }
      })();
      return tasks(u, date, date);
    },
  };
}

export type DailyRepo = ReturnType<typeof createDailyRepo>;

/** "YYYY-MM-DD" and "HH:MM" in the Mac's local time zone. */
export function localDateTime(ms: number): { date: string; time: string; weekday: number } {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    weekday: d.getDay(),
  };
}

/** The date `n` days after "YYYY-MM-DD" (calendar arithmetic, no time zones). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week that contains "YYYY-MM-DD". */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
