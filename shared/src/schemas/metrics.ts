import { z } from 'zod';
import { dateString } from './common.js';
import { muscleGroup } from './catalog.js';

/** A point on the measurement chart. weightMa7 is a 7-day moving average. */
export const measurementPoint = z.object({
  date: dateString,
  weightKg: z.number().nullable(),
  weightMa7: z.number().nullable(),
  waistCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  hipCm: z.number().nullable(),
  bicepCm: z.number().nullable(),
  fatPct: z.number().nullable(),
  visceral: z.number().nullable(),
  muscleKg: z.number().nullable(),
  bmrKcal: z.number().nullable(),
});
export type MeasurementPoint = z.infer<typeof measurementPoint>;

export const nutritionPoint = z.object({
  date: dateString,
  kcal: z.number(),
  proteinG: z.number(),
  /** What the plan called for that day — the target line on the chart. */
  plannedKcal: z.number(),
  plannedProteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  completionPct: z.number(),
  itemsTotal: z.number().int(),
  itemsDone: z.number().int(),
});
export type NutritionPoint = z.infer<typeof nutritionPoint>;

export const weekPoint = z.object({
  weekStart: dateString,
  label: z.string(),
  avgKcal: z.number(),
  avgProteinG: z.number(),
  adherencePct: z.number(),
  tonnageKg: z.number(),
  workoutsDone: z.number().int(),
  cardioKm: z.number(),
  cardioMin: z.number(),
});
export type WeekPoint = z.infer<typeof weekPoint>;

export const muscleVolumePoint = z.object({
  muscleGroup,
  label: z.string(),
  tonnageKg: z.number(),
  sets: z.number().int(),
});
export type MuscleVolumePoint = z.infer<typeof muscleVolumePoint>;

export const metricsKpi = z.object({
  currentWeightKg: z.number().nullable(),
  weightDelta30: z.number().nullable(),
  waistDelta30: z.number().nullable(),
  avgProtein7: z.number().nullable(),
  avgKcal7: z.number().nullable(),
  workoutsLast28: z.number().int(),
  tonnageLast28Kg: z.number(),
  /** Consecutive days with at least 80% of the planned items done. */
  streakDays: z.number().int(),
});
export type MetricsKpi = z.infer<typeof metricsKpi>;

export const metricsOverview = z.object({
  from: dateString,
  to: dateString,
  kpi: metricsKpi,
  measurements: z.array(measurementPoint),
  nutrition: z.array(nutritionPoint),
  weeks: z.array(weekPoint),
  muscleVolume: z.array(muscleVolumePoint),
});
export type MetricsOverview = z.infer<typeof metricsOverview>;

/** Progress for a single exercise: working weight and estimated 1RM (Epley). */
export const exerciseProgressPoint = z.object({
  date: dateString,
  topWeightKg: z.number().nullable(),
  topReps: z.number().int().nullable(),
  estimated1rm: z.number().nullable(),
  tonnageKg: z.number(),
  totalReps: z.number().int(),
  sets: z.number().int(),
});
export type ExerciseProgressPoint = z.infer<typeof exerciseProgressPoint>;

export const exerciseProgress = z.object({
  exerciseId: z.number().int(),
  exerciseName: z.string(),
  points: z.array(exerciseProgressPoint),
});
export type ExerciseProgress = z.infer<typeof exerciseProgress>;
