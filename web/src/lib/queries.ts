import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  AuthState,
  DaySummary,
  DayView,
  Dish,
  DishInput,
  Exercise,
  ExerciseInput,
  ExerciseProgress,
  MealSlot,
  MealSlotInput,
  Measurement,
  MeasurementInput,
  MetricsOverview,
  PlanWithEntries,
  Settings,
  SettingsPatch,
  Supplement,
  SupplementInput,
  WorkoutTemplate,
  WorkoutTemplateInput,
  MealLogPatch,
  MealLogCreate,
  SetLogCreate,
  WorkoutLogPatch,
  PlanEntryInput,
} from '@shared/index';
import { api } from './api';

export const keys = {
  auth: ['auth'] as const,
  settings: ['settings'] as const,
  day: (date: string) => ['day', date] as const,
  days: (from: string, to: string) => ['days', from, to] as const,
  dishes: ['dishes'] as const,
  exercises: ['exercises'] as const,
  templates: ['workout-templates'] as const,
  slots: ['meal-slots'] as const,
  supplements: ['supplements'] as const,
  plan: ['plan', 'active'] as const,
  measurements: ['measurements'] as const,
  metrics: (from: string, to: string) => ['metrics', from, to] as const,
  metricExercises: ['metrics', 'exercises'] as const,
  exerciseProgress: (id: number, from: string, to: string) =>
    ['metrics', 'exercise', id, from, to] as const,
  lastSession: (id: number) => ['exercise', id, 'last-session'] as const,
};

/**
 * Invalidates everything that depends on the journal. Days and metrics are
 * linked: ticking a meal changes both the day totals and the charts, so they
 * are refreshed together.
 */
function useJournalInvalidation() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['day'] });
    void client.invalidateQueries({ queryKey: ['days'] });
    void client.invalidateQueries({ queryKey: ['metrics'] });
  };
}

/* ------------------------------------ Auth -------------------------------- */

export function useAuth() {
  return useQuery({
    queryKey: keys.auth,
    queryFn: () => api<AuthState>('/auth/me'),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api<AuthState>('/auth/login', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useSetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api<AuthState>('/auth/setup', { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<unknown>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      client.clear();
      void client.invalidateQueries({ queryKey: keys.auth });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api<unknown>('/auth/password', { method: 'POST', body }),
  });
}

/* ------------------------------------ Day --------------------------------- */

export function useDay(date: string) {
  return useQuery({
    queryKey: keys.day(date),
    queryFn: () => api<DayView>(`/days/${date}`),
  });
}

export function useDays(from: string, to: string) {
  return useQuery({
    queryKey: keys.days(from, to),
    queryFn: () => api<DaySummary[]>('/days', { query: { from, to } }),
  });
}

/**
 * Completion is updated optimistically: tapping a checkbox has to respond
 * instantly rather than wait for the server.
 */
export function useToggleMeal(date: string) {
  const client = useQueryClient();
  const invalidate = useJournalInvalidation();

  return useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      api<unknown>(`/meal-logs/${id}`, { method: 'PATCH', body: { completed } }),
    onMutate: async ({ id, completed }) => {
      await client.cancelQueries({ queryKey: keys.day(date) });
      const previous = client.getQueryData<DayView>(keys.day(date));
      if (previous) {
        client.setQueryData<DayView>(keys.day(date), recalcDay({
          ...previous,
          meals: previous.meals.map((meal) => (meal.id === id ? { ...meal, completed } : meal)),
        }));
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(keys.day(date), context.previous);
    },
    onSettled: invalidate,
  });
}

/** Recomputes totals on the client so the rings move before the server replies. */
function recalcDay(day: DayView): DayView {
  let kcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  let done = 0;
  let plannedMeals = 0;

  for (const meal of day.meals) {
    if (meal.planned) plannedMeals += 1;
    if (meal.completed) {
      kcal += meal.kcal;
      proteinG += meal.proteinG;
      fatG += meal.fatG;
      carbsG += meal.carbsG;
      if (meal.planned) done += 1;
    }
  }

  // The count must match the server: supplements are planned items too, and a
  // meal eaten on top of the plan is none of them.
  const itemsTotal = plannedMeals + (day.workout ? 1 : 0) + day.supplements.length;
  if (day.workout?.status === 'done') done += 1;
  done += day.supplements.filter((item) => item.taken).length;
  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    ...day,
    totals: {
      ...day.totals,
      kcal: round(kcal),
      proteinG: round(proteinG),
      fatG: round(fatG),
      carbsG: round(carbsG),
      itemsTotal,
      itemsDone: done,
      completionPct: itemsTotal === 0 ? 0 : Math.round((done / itemsTotal) * 100),
    },
  };
}

export function usePatchMeal() {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: MealLogPatch }) =>
      api<unknown>(`/meal-logs/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  });
}

/** Creates the journal for a past date so it can be filled in. */
export function useMaterializeDay(date: string) {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: () => api<unknown>(`/days/${date}/materialize`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useAddMeal(date: string) {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: (body: MealLogCreate) =>
      api<unknown>(`/days/${date}/meals`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteMeal() {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: (id: number) => api<unknown>(`/meal-logs/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useSetDayNotes(date: string) {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: (notes: string) =>
      api<unknown>(`/days/${date}/notes`, { method: 'PATCH', body: { notes } }),
    onSuccess: invalidate,
  });
}

/** The id belongs to the day's journal row, not to the supplement catalogue. */
export function useToggleSupplement() {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: ({ id, taken }: { id: number; taken: boolean }) =>
      api<unknown>(`/supplement-logs/${id}`, { method: 'PATCH', body: { taken } }),
    onSuccess: invalidate,
  });
}

/* ---------------------------------- Workout ------------------------------- */

export function useStartWorkout(date: string) {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: (templateId: number) =>
      api<unknown>(`/days/${date}/workout`, { method: 'POST', body: { templateId } }),
    onSuccess: invalidate,
  });
}

export function usePatchWorkout() {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: WorkoutLogPatch }) =>
      api<unknown>(`/workout-logs/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  });
}

export function useAddSet() {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: ({ workoutId, body }: { workoutId: number; body: SetLogCreate }) =>
      api<unknown>(`/workout-logs/${workoutId}/sets`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteSet() {
  const invalidate = useJournalInvalidation();
  return useMutation({
    mutationFn: (id: number) => api<unknown>(`/set-logs/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useLastSession(exerciseId: number | null) {
  return useQuery({
    queryKey: keys.lastSession(exerciseId ?? 0),
    queryFn: () =>
      api<{ date: string | null; sets: Array<{ reps: number | null; weightKg: number | null }> }>(
        `/exercises/${exerciseId}/last-session`,
      ),
    enabled: exerciseId !== null,
  });
}

/* --------------------------------- Catalogues ----------------------------- */

function useCrud<T, TInput>(key: readonly unknown[], path: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: ['day'] });
    void client.invalidateQueries({ queryKey: ['days'] });
  };

  const list = useQuery({ queryKey: key, queryFn: () => api<T[]>(path) });
  const create = useMutation({
    mutationFn: (body: TInput) => api<T>(path, { method: 'POST', body }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<TInput> }) =>
      api<T>(`${path}/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<unknown>(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return { list, create, update, remove };
}

export const useDishes = () => useCrud<Dish, DishInput>(keys.dishes, '/dishes');
export const useExercises = () => useCrud<Exercise, ExerciseInput>(keys.exercises, '/exercises');
export const useMealSlots = () => useCrud<MealSlot, MealSlotInput>(keys.slots, '/meal-slots');
export const useSupplements = () =>
  useCrud<Supplement, SupplementInput>(keys.supplements, '/supplements');

export function useTemplates() {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: keys.templates });
    void client.invalidateQueries({ queryKey: ['day'] });
  };

  const list = useQuery({
    queryKey: keys.templates,
    queryFn: () => api<WorkoutTemplate[]>('/workout-templates'),
  });
  const create = useMutation({
    mutationFn: (body: WorkoutTemplateInput) =>
      api<WorkoutTemplate>('/workout-templates', { method: 'POST', body }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: WorkoutTemplateInput }) =>
      api<WorkoutTemplate>(`/workout-templates/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<unknown>(`/workout-templates/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return { list, create, update, remove };
}

/* ------------------------------------ Plan -------------------------------- */

export function usePlan() {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: keys.plan,
    queryFn: () => api<PlanWithEntries | null>('/plans/active'),
  });

  const create = useMutation({
    mutationFn: (name: string) => api<{ id: number }>('/plans', { method: 'POST', body: { name } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.plan });
    },
  });

  const saveEntries = useMutation({
    mutationFn: ({ planId, entries }: { planId: number; entries: PlanEntryInput[] }) =>
      api<unknown>(`/plans/${planId}/entries`, { method: 'PUT', body: { entries } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.plan });
      void client.invalidateQueries({ queryKey: ['day'] });
      void client.invalidateQueries({ queryKey: ['days'] });
    },
  });

  return { list, create, saveEntries };
}

/* ------------------------------- Measurements ----------------------------- */

export function useMeasurements() {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: keys.measurements });
    void client.invalidateQueries({ queryKey: ['metrics'] });
  };

  const list = useQuery({
    queryKey: keys.measurements,
    queryFn: () => api<Measurement[]>('/measurements'),
  });
  const save = useMutation({
    mutationFn: (body: MeasurementInput) =>
      api<Measurement>('/measurements', { method: 'POST', body }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<unknown>(`/measurements/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return { list, save, remove };
}

/* ---------------------------------- Metrics ------------------------------- */

export function useMetrics(from: string, to: string) {
  return useQuery({
    queryKey: keys.metrics(from, to),
    queryFn: () => api<MetricsOverview>('/metrics/overview', { query: { from, to } }),
  });
}

export function useMetricExercises() {
  return useQuery({
    queryKey: keys.metricExercises,
    queryFn: () =>
      api<Array<{ id: number; name: string; category: string; muscleGroup: string }>>(
        '/metrics/exercises',
      ),
  });
}

export function useExerciseProgress(id: number | null, from: string, to: string) {
  return useQuery({
    queryKey: keys.exerciseProgress(id ?? 0, from, to),
    queryFn: () =>
      api<ExerciseProgress>(`/metrics/exercises/${id}`, { query: { from, to } }),
    enabled: id !== null,
  });
}

/* ---------------------------------- Settings ------------------------------ */

export function useSettings() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: keys.settings, queryFn: () => api<Settings>('/settings') });
  const update = useMutation({
    mutationFn: (body: SettingsPatch) => api<Settings>('/settings', { method: 'PATCH', body }),
    onSuccess: (data) => {
      client.setQueryData(keys.settings, data);
    },
  });
  return { list, update };
}

/* ---------------------------------- Backups ------------------------------- */

export function useImportBackup(): UseMutationResult<unknown, Error, unknown, unknown> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      api<unknown>('/import', { method: 'POST', body: { mode: 'replace', data } }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}
