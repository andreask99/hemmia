/** Planner: settings, plans and weekly goals. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateGoalRequest,
  type CreateTaskRequest,
  DailySettings,
  DayTask,
  Goal,
  PlanListResponse,
  type UpdateGoalRequest,
  type UpdateTaskRequest,
  WeekResponse,
} from '@hemmia/shared';
import { api } from '../api/client.ts';

export const DAILY_KEY = ['daily'] as const;
export const PLANS_KEY = ['plans'] as const;
export const WEEK_KEY = ['week'] as const;

export function useDaily() {
  return useQuery({ queryKey: DAILY_KEY, queryFn: () => api('/daily', { schema: DailySettings }) });
}

export function useSaveDaily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DailySettings) =>
      api('/daily', { method: 'PUT', body, schema: DailySettings }),
    onSuccess: (data) => {
      queryClient.setQueryData(DAILY_KEY, data);
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => api('/plans', { schema: PlanListResponse }),
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      await queryClient.invalidateQueries({ queryKey: WEEK_KEY });
    },
  });
}

/** A week's goals and appointments; `week` is any day of it (default: this week). */
export function useWeek(week?: string) {
  return useQuery({
    queryKey: [...WEEK_KEY, week ?? 'current'],
    queryFn: () =>
      api(week ? `/week?week=${encodeURIComponent(week)}` : '/week', { schema: WeekResponse }),
  });
}

function useGoalMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: WEEK_KEY }),
  });
}

/** Adds a goal; fails with ApiError code 'too_many_goals' when the area is full. */
export function useAddGoal() {
  return useGoalMutation((body: CreateGoalRequest) =>
    api('/goals', { method: 'POST', body, schema: Goal }),
  );
}

export function useUpdateGoal() {
  return useGoalMutation(({ id, patch }: { id: string; patch: UpdateGoalRequest }) =>
    api(`/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, schema: Goal }),
  );
}

export function useDeleteGoal() {
  return useGoalMutation((id: string) =>
    api(`/goals/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

/** Adds a daily item; fails with ApiError code 'day_full' when the day has no room. */
export function useAddTask() {
  return useGoalMutation((body: CreateTaskRequest) =>
    api('/tasks', { method: 'POST', body, schema: DayTask }),
  );
}

export function useUpdateTask() {
  return useGoalMutation(({ id, patch }: { id: string; patch: UpdateTaskRequest }) =>
    api(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch, schema: DayTask }),
  );
}

export function useDeleteTask() {
  return useGoalMutation((id: string) =>
    api(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}
