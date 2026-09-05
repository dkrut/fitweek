import { z } from 'zod';
import { dateString, id } from './common.js';
import { exerciseCategory, workoutKind } from './catalog.js';

/* ---------------------------------- Meals --------------------------------- */

/**
 * Macros are stored as a copy inside the journal row instead of being read
 * from the catalogue: editing a dish must not rewrite history.
 */
export const mealLog = z.object({
  id,
  date: dateString,
  mealSlotId: id.nullable(),
  mealSlotName: z.string(),
  timeHint: z.string(),
  dishId: id.nullable(),
  name: z.string(),
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  portion: z.string(),
  recipe: z.string(),
  completed: z.boolean(),
  /** False for a meal eaten on top of the plan; it never raises the target. */
  planned: z.boolean(),
  position: z.number().int(),
});
export type MealLog = z.infer<typeof mealLog>;

export const mealLogPatch = z
  .object({
    completed: z.boolean(),
    dishId: id.nullable(),
    name: z.string().trim().min(1).max(120),
    kcal: z.number().min(0).max(5000),
    proteinG: z.number().min(0).max(500),
    fatG: z.number().min(0).max(500),
    carbsG: z.number().min(0).max(1000),
    portion: z.string().max(200),
  })
  .partial();
export type MealLogPatch = z.infer<typeof mealLogPatch>;

export const mealLogCreate = z.object({
  mealSlotId: id.nullable().default(null),
  dishId: id.nullable().default(null),
  name: z.string().trim().max(120).optional(),
  kcal: z.number().min(0).max(5000).optional(),
  proteinG: z.number().min(0).max(500).optional(),
  fatG: z.number().min(0).max(500).optional(),
  carbsG: z.number().min(0).max(1000).optional(),
  portion: z.string().trim().max(200).optional(),
});
export type MealLogCreate = z.infer<typeof mealLogCreate>;

/* ---------------------------------- Sets ---------------------------------- */

export const setLog = z.object({
  id,
  workoutLogId: id,
  exerciseId: id,
  exerciseName: z.string(),
  exerciseCategory,
  setIndex: z.number().int(),
  reps: z.number().int().nullable(),
  weightKg: z.number().nullable(),
  seconds: z.number().int().nullable(),
  distanceKm: z.number().nullable(),
  band: z.string(),
  rpe: z.number().nullable(),
  isWarmup: z.boolean(),
  completed: z.boolean(),
});
export type SetLog = z.infer<typeof setLog>;

export const setLogCreate = z.object({
  exerciseId: id,
  setIndex: z.number().int().min(0).max(99).optional(),
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  weightKg: z.number().min(0).max(999).nullable().default(null),
  seconds: z.number().int().min(0).max(36000).nullable().default(null),
  distanceKm: z.number().min(0).max(500).nullable().default(null),
  band: z.string().trim().max(60).default(''),
  rpe: z.number().min(1).max(10).nullable().default(null),
  isWarmup: z.boolean().default(false),
  completed: z.boolean().default(true),
});
export type SetLogCreate = z.infer<typeof setLogCreate>;

export const setLogPatch = setLogCreate.omit({ exerciseId: true }).partial();
export type SetLogPatch = z.infer<typeof setLogPatch>;

/* -------------------------------- Workout --------------------------------- */

export const workoutStatuses = ['planned', 'done', 'skipped'] as const;
export const workoutStatus = z.enum(workoutStatuses);
export type WorkoutStatus = z.infer<typeof workoutStatus>;

export const plannedExercise = z.object({
  exerciseId: id,
  exerciseName: z.string(),
  exerciseCategory,
  position: z.number().int(),
  targetSets: z.number().int(),
  targetRepsMin: z.number().int().nullable(),
  targetRepsMax: z.number().int().nullable(),
  targetSeconds: z.number().int().nullable(),
  restSec: z.number().int(),
  notes: z.string(),
});
export type PlannedExercise = z.infer<typeof plannedExercise>;

export const workoutLog = z.object({
  id,
  date: dateString,
  templateId: id.nullable(),
  name: z.string(),
  kind: workoutKind,
  status: workoutStatus,
  warmup: z.string(),
  cooldown: z.string(),
  durationMin: z.number().nullable(),
  distanceKm: z.number().nullable(),
  rpe: z.number().nullable(),
  notes: z.string(),
  /** Snapshot of the template taken when the day was materialised. */
  planned: z.array(plannedExercise),
  sets: z.array(setLog),
});
export type WorkoutLog = z.infer<typeof workoutLog>;

export const workoutLogPatch = z
  .object({
    status: workoutStatus,
    durationMin: z.number().min(0).max(1440).nullable(),
    distanceKm: z.number().min(0).max(500).nullable(),
    rpe: z.number().min(1).max(10).nullable(),
    notes: z.string().max(2000),
  })
  .partial();
export type WorkoutLogPatch = z.infer<typeof workoutLogPatch>;

export const workoutStartInput = z.object({ templateId: id });
export type WorkoutStartInput = z.infer<typeof workoutStartInput>;

/* ----------------------------------- Day ---------------------------------- */

export const dayTotals = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  /** Planned totals, which are also the target for the day. */
  plannedKcal: z.number(),
  plannedProteinG: z.number(),
  plannedFatG: z.number(),
  plannedCarbsG: z.number(),
  itemsTotal: z.number().int(),
  itemsDone: z.number().int(),
  completionPct: z.number(),
});
export type DayTotals = z.infer<typeof dayTotals>;

export const daySupplement = z.object({
  /** Journal row id, not a catalogue id: this marks one intake on this day. */
  id,
  supplementId: id.nullable(),
  name: z.string(),
  dose: z.string(),
  taken: z.boolean(),
});
export type DaySupplement = z.infer<typeof daySupplement>;

export const dayView = z.object({
  date: dateString,
  weekday: z.number().int(),
  /** False for future dates: the plan is projected, nothing is written yet. */
  materialized: z.boolean(),
  notes: z.string(),
  meals: z.array(mealLog),
  workout: workoutLog.nullable(),
  supplements: z.array(daySupplement),
  totals: dayTotals,
});
export type DayView = z.infer<typeof dayView>;

export const daySummary = z.object({
  date: dateString,
  weekday: z.number().int(),
  materialized: z.boolean(),
  kcal: z.number(),
  proteinG: z.number(),
  plannedKcal: z.number(),
  plannedProteinG: z.number(),
  itemsTotal: z.number().int(),
  itemsDone: z.number().int(),
  completionPct: z.number(),
  workoutName: z.string().nullable(),
  workoutKind: workoutKind.nullable(),
  workoutStatus: workoutStatus.nullable(),
});
export type DaySummary = z.infer<typeof daySummary>;

export const dayNotesPatch = z.object({ notes: z.string().max(4000) });
export type DayNotesPatch = z.infer<typeof dayNotesPatch>;

export const supplementLogPatch = z.object({ taken: z.boolean() });
export type SupplementLogPatch = z.infer<typeof supplementLogPatch>;
