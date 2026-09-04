import { z } from 'zod';
import { id } from './common.js';

/* --------------------------------- Dishes --------------------------------- */

export const dishCategories = ['breakfast', 'main', 'snack', 'other'] as const;
export const dishCategory = z.enum(dishCategories);
export type DishCategory = z.infer<typeof dishCategory>;

export const dishInput = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(120),
  category: dishCategory.default('other'),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  fatG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(1000),
  portion: z.string().trim().max(200).default(''),
  recipe: z.string().max(4000).default(''),
});
export type DishInput = z.infer<typeof dishInput>;

export const dish = dishInput.extend({
  id,
  archivedAt: z.string().nullable(),
});
export type Dish = z.infer<typeof dish>;

/* -------------------------------- Meal slots ------------------------------ */

export const mealSlotInput = z.object({
  name: z.string().trim().min(1).max(60),
  timeHint: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время в формате ЧЧ:ММ')
    .default('12:00'),
  position: z.number().int().min(0).max(50).default(0),
});
export type MealSlotInput = z.infer<typeof mealSlotInput>;

export const mealSlot = mealSlotInput.extend({ id });
export type MealSlot = z.infer<typeof mealSlot>;

/* -------------------------------- Exercises ------------------------------- */

export const exerciseCategories = ['strength', 'cardio', 'mobility'] as const;
export const exerciseCategory = z.enum(exerciseCategories);
export type ExerciseCategory = z.infer<typeof exerciseCategory>;

export const muscleGroups = [
  'legs',
  'back',
  'chest',
  'shoulders',
  'arms',
  'core',
  'full_body',
  'none',
] as const;
export const muscleGroup = z.enum(muscleGroups);
export type MuscleGroup = z.infer<typeof muscleGroup>;

export const exerciseInput = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(120),
  category: exerciseCategory.default('strength'),
  muscleGroup: muscleGroup.default('none'),
  equipment: z.string().trim().max(120).default(''),
  notes: z.string().max(2000).default(''),
});
export type ExerciseInput = z.infer<typeof exerciseInput>;

export const exercise = exerciseInput.extend({
  id,
  archivedAt: z.string().nullable(),
});
export type Exercise = z.infer<typeof exercise>;

/* ----------------------------- Workout templates -------------------------- */

export const workoutKinds = ['strength', 'cardio', 'rest'] as const;
export const workoutKind = z.enum(workoutKinds);
export type WorkoutKind = z.infer<typeof workoutKind>;

export const templateExerciseInput = z.object({
  exerciseId: id,
  position: z.number().int().min(0).default(0),
  targetSets: z.number().int().min(1).max(20).default(3),
  targetRepsMin: z.number().int().min(1).max(500).nullable().default(null),
  targetRepsMax: z.number().int().min(1).max(500).nullable().default(null),
  targetSeconds: z.number().int().min(1).max(3600).nullable().default(null),
  restSec: z.number().int().min(0).max(900).default(90),
  notes: z.string().max(500).default(''),
});
export type TemplateExerciseInput = z.infer<typeof templateExerciseInput>;

export const templateExercise = templateExerciseInput.extend({
  id,
  templateId: id,
  exerciseName: z.string(),
  exerciseCategory,
  muscleGroup,
});
export type TemplateExercise = z.infer<typeof templateExercise>;

export const workoutTemplateInput = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(120),
  kind: workoutKind.default('strength'),
  warmup: z.string().max(2000).default(''),
  cooldown: z.string().max(2000).default(''),
  notes: z.string().max(2000).default(''),
  exercises: z.array(templateExerciseInput).default([]),
});
export type WorkoutTemplateInput = z.infer<typeof workoutTemplateInput>;

export const workoutTemplate = workoutTemplateInput
  .omit({ exercises: true })
  .extend({
    id,
    archivedAt: z.string().nullable(),
    exercises: z.array(templateExercise),
  });
export type WorkoutTemplate = z.infer<typeof workoutTemplate>;

/* ------------------------------- Supplements ------------------------------ */

/*
 * The intake schedule is not a catalogue field: which supplement is taken on
 * which day belongs to the weekly plan, same as dishes and workouts.
 */
export const supplementInput = z.object({
  name: z.string().trim().min(1).max(120),
  dose: z.string().trim().max(120).default(''),
  notes: z.string().max(1000).default(''),
  active: z.boolean().default(true),
});
export type SupplementInput = z.infer<typeof supplementInput>;

export const supplement = supplementInput.extend({ id });
export type Supplement = z.infer<typeof supplement>;
