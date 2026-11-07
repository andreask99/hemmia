/**
 * Planner: settings, plans and weekly goals. Owned by Claude (per-user data).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateGoalRequest,
  CreateTaskRequest,
  DailySettings,
  type DayTask,
  type Goal,
  type PlanListResponse,
  UpdateGoalRequest,
  UpdateTaskRequest,
  type WeekResponse,
} from '@hemmia/shared';
import { addDays, type DailyRepo, localDateTime, weekStart } from '../db/daily.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

const IdParam = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const PlanParams = z.object({ planId: IdParam });
const GoalParams = z.object({ goalId: IdParam });
const TaskParams = z.object({ taskId: IdParam });
const WeekQuery = z.object({
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export function registerDailyRoutes(
  app: FastifyInstance,
  deps: { daily: DailyRepo; now?: () => number },
): void {
  const now = deps.now ?? Date.now;

  app.get('/api/daily', { preHandler: requireUser }, async (req): Promise<DailySettings> => {
    return deps.daily.getSettings(currentUser(req));
  });

  app.put('/api/daily', { preHandler: requireUser }, async (req): Promise<DailySettings> => {
    const body = DailySettings.parse(req.body);
    return deps.daily.saveSettings(currentUser(req), body);
  });

  app.get('/api/plans', { preHandler: requireUser }, async (req): Promise<PlanListResponse> => {
    const today = localDateTime(now()).date;
    return { plans: deps.daily.listPlans(currentUser(req)).filter((p) => p.date >= today) };
  });

  app.delete('/api/plans/:planId', { preHandler: requireUser }, async (req, reply) => {
    const { planId } = PlanParams.parse(req.params);
    if (!deps.daily.deletePlan(currentUser(req), planId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.get('/api/week', { preHandler: requireUser }, async (req): Promise<WeekResponse> => {
    const user = currentUser(req);
    const today = localDateTime(now()).date;
    const week = weekStart(WeekQuery.parse(req.query).week ?? today);
    return {
      week,
      today,
      goals: deps.daily.listGoals(user, week),
      plans: deps.daily.plansBetween(user, week, addDays(week, 6)),
      tasks: deps.daily.listTasks(user, week, addDays(week, 6)),
    };
  });

  app.post('/api/tasks', { preHandler: requireUser }, async (req, reply): Promise<DayTask> => {
    const body = CreateTaskRequest.parse(req.body);
    const task = deps.daily.addTask(currentUser(req), body);
    if (!task) throw new HttpError(409, 'day_full');
    return reply.code(201).send(task);
  });

  app.patch('/api/tasks/:taskId', { preHandler: requireUser }, async (req): Promise<DayTask> => {
    const { taskId } = TaskParams.parse(req.params);
    const user = currentUser(req);
    if (!deps.daily.getTask(user, taskId)) throw new HttpError(404, 'not_found');
    const task = deps.daily.updateTask(user, taskId, UpdateTaskRequest.parse(req.body));
    if (!task) throw new HttpError(409, 'day_full');
    return task;
  });

  app.delete('/api/tasks/:taskId', { preHandler: requireUser }, async (req, reply) => {
    const { taskId } = TaskParams.parse(req.params);
    if (!deps.daily.deleteTask(currentUser(req), taskId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.post('/api/goals', { preHandler: requireUser }, async (req, reply): Promise<Goal> => {
    const body = CreateGoalRequest.parse(req.body);
    const goal = deps.daily.addGoal(currentUser(req), body);
    if (!goal) throw new HttpError(409, 'too_many_goals');
    return reply.code(201).send(goal);
  });

  app.patch('/api/goals/:goalId', { preHandler: requireUser }, async (req): Promise<Goal> => {
    const { goalId } = GoalParams.parse(req.params);
    const user = currentUser(req);
    if (!deps.daily.getGoal(user, goalId)) throw new HttpError(404, 'not_found');
    const goal = deps.daily.updateGoal(user, goalId, UpdateGoalRequest.parse(req.body));
    if (!goal) throw new HttpError(409, 'too_many_goals');
    return goal;
  });

  app.delete('/api/goals/:goalId', { preHandler: requireUser }, async (req, reply) => {
    const { goalId } = GoalParams.parse(req.params);
    if (!deps.daily.deleteGoal(currentUser(req), goalId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });
}

/**
 * Sends the content-free planner notifications (morning snapshot, weekly planning, evening
 * check-in) to everyone whose time has come today.
 */
export async function sendDueDaily(
  daily: DailyRepo,
  notify: (
    userId: string,
    payload: { kind: 'daily' | 'week' | 'evening'; chatId: string; lang: 'en' | 'de' },
  ) => Promise<void>,
  nowMs: number,
): Promise<number> {
  const { date, time, weekday } = localDateTime(nowMs);
  const due = daily.due(date, weekday, time);
  for (const u of due) {
    daily.markSent(u.userId, u.kind, date);
    if (u.alsoDaily) daily.markSent(u.userId, 'daily', date);
    await notify(u.userId, { kind: u.kind, chatId: '', lang: u.language });
  }
  return due.length;
}
