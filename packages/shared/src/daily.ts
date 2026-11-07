import { z } from 'zod';

/**
 * The planner ("My week"): weekly goals for work and home, a morning snapshot (goals,
 * appointments, optional horoscope), a weekly planning chat and an optional evening check-in.
 */
export const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;
export const ZodiacSign = z.enum(ZODIAC_SIGNS);
export type ZodiacSign = z.infer<typeof ZodiacSign>;

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** "Hamburg", "Bad Homburg v. d. Höhe", "St. John's", "80331 München". */
export const Town = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'’()/-]*$/u);

/** Towns nearby for weekend events. */
export const MAX_NEARBY = 3;
export const Nearby = z.array(Town).max(MAX_NEARBY);

/** GET/PUT /api/daily. The sign is stored encrypted; times are the Mac's local time. */
export const DailySettings = z.object({
  /** Planner notifications on (morning snapshot and weekly planning). */
  enabled: z.boolean(),
  /** Morning snapshot, "07:30". */
  time: Time,
  sign: ZodiacSign.nullable(),
  /** Parts of the morning snapshot. */
  horoscope: z.boolean(),
  plans: z.boolean(),
  goals: z.boolean().default(true),
  /** Weekly planning: day (0 = Sunday … 6 = Saturday) and time. */
  weekDay: z.number().int().min(0).max(6).default(1),
  weekTime: Time.default('07:30'),
  /** Evening check-in ("what did you get done?"). */
  evening: z.boolean().default(false),
  eveningTime: Time.default('20:00'),
  /**
   * Home town for the weekend snapshot's weather and local events (sent to web search).
   * Stored encrypted. Plain place-name characters only, since it goes into the system prompt.
   */
  town: Town.nullable().default(null),
  /**
   * Bigger towns nearby where the weekend snapshot also looks for events (for a small home
   * town). Stored encrypted, same rules as the town.
   */
  nearby: Nearby.default([]),
});
export type DailySettings = z.infer<typeof DailySettings>;

/** A plan the user told kchat about (stored encrypted). */
export const Plan = z.object({
  id: z.string(),
  /** "2026-10-08" */
  date: Day,
  /** "10:00", or null for all day. */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  text: z.string().min(1).max(300),
});
export type Plan = z.infer<typeof Plan>;

/** GET /api/plans: upcoming plans, soonest first. */
export const PlanListResponse = z.object({ plans: z.array(Plan) });
export type PlanListResponse = z.infer<typeof PlanListResponse>;

/** Goal areas; teenagers see "work" as "School". */
export const GOAL_AREAS = ['work', 'home'] as const;
export const GoalArea = z.enum(GOAL_AREAS);
export type GoalArea = z.infer<typeof GoalArea>;
export const GoalStatus = z.enum(['open', 'done', 'dropped']);
export type GoalStatus = z.infer<typeof GoalStatus>;

/** At most this many goals per area and week (kchat suggests 3). */
export const MAX_GOALS_PER_AREA = 5;

/** A weekly goal (stored encrypted, except its week). */
export const Goal = z.object({
  id: z.string(),
  /** The week's Monday, "2026-10-05". */
  week: Day,
  area: GoalArea,
  text: z.string().min(1).max(200),
  status: GoalStatus,
  /** The day it is planned for, if any. */
  day: Day.nullable(),
  doneOn: Day.nullable(),
});
export type Goal = z.infer<typeof Goal>;

/** Per day: one must win plus up to this many more. */
export const MAX_ALSO_PER_DAY = 2;

/** A day's item: the must win or one of up to two more (stored encrypted, except its date). */
export const DayTask = z.object({
  id: z.string(),
  date: Day,
  kind: z.enum(['must', 'also']),
  text: z.string().min(1).max(200),
  /** The weekly goal it moves forward, if any. */
  goalId: z.string().nullable(),
  status: GoalStatus,
});
export type DayTask = z.infer<typeof DayTask>;

/** GET /api/week?week=YYYY-MM-DD (any day of the week; default this week). */
export const WeekResponse = z.object({
  week: Day,
  today: Day,
  goals: z.array(Goal),
  plans: z.array(Plan),
  /** The week's daily items (today's included when it is this week). */
  tasks: z.array(DayTask).default([]),
});
export type WeekResponse = z.infer<typeof WeekResponse>;

/** POST /api/goals */
export const CreateGoalRequest = z.object({
  week: Day,
  area: GoalArea,
  text: z.string().trim().min(1).max(200),
  day: Day.nullable().optional(),
});
export type CreateGoalRequest = z.infer<typeof CreateGoalRequest>;

/** PATCH /api/goals/:goalId */
export const UpdateGoalRequest = z
  .object({
    text: z.string().trim().min(1).max(200),
    area: GoalArea,
    status: GoalStatus,
    day: Day.nullable(),
    week: Day,
  })
  .partial();
export type UpdateGoalRequest = z.infer<typeof UpdateGoalRequest>;

/** What a planner chat opens with: morning snapshot, weekly planning or evening check-in. */
export const Briefing = z.enum(['day', 'week', 'evening']);
export type Briefing = z.infer<typeof Briefing>;

/** POST /api/tasks */
export const CreateTaskRequest = z.object({
  date: Day,
  kind: z.enum(['must', 'also']),
  text: z.string().trim().min(1).max(200),
  goalId: z.string().nullable().optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequest>;

/** PATCH /api/tasks/:taskId */
export const UpdateTaskRequest = z
  .object({
    text: z.string().trim().min(1).max(200),
    kind: z.enum(['must', 'also']),
    status: GoalStatus,
    goalId: z.string().nullable(),
    date: Day,
  })
  .partial();
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequest>;
