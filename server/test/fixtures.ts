import type { Database } from '../src/db/client.js';
import * as t from '../src/db/schema.js';

/**
 * Synthetic data set for the tests.
 *
 * The app starts empty, so there is nothing to assert against until data
 * appears. This set is small and predictable: the numbers used in assertions
 * are derived from these constants rather than written out by hand.
 *
 * The week is shaped to cover every branch: strength days, a cardio day and a
 * rest day with no workout, a strength-only supplement next to a daily one.
 */

export const SLOTS = [
  { name: 'Завтрак', timeHint: '09:00', position: 0 },
  { name: 'Обед', timeHint: '14:00', position: 1 },
  { name: 'Ужин', timeHint: '20:00', position: 2 },
] as const;

export const DISHES = [
  { key: 'oats', name: 'Овсянка', category: 'breakfast', kcal: 400, proteinG: 20 },
  { key: 'chicken', name: 'Курица с рисом', category: 'main', kcal: 600, proteinG: 45 },
  { key: 'fish', name: 'Рыба с овощами', category: 'main', kcal: 500, proteinG: 40 },
  { key: 'kefir', name: 'Кефир', category: 'snack', kcal: 100, proteinG: 8 },
] as const;

export const EXERCISES = [
  { key: 'squat', name: 'Приседания', category: 'strength', muscleGroup: 'legs' },
  { key: 'press', name: 'Жим лёжа', category: 'strength', muscleGroup: 'chest' },
  { key: 'plank', name: 'Планка', category: 'strength', muscleGroup: 'core' },
  { key: 'walk', name: 'Ходьба', category: 'cardio', muscleGroup: 'none' },
  { key: 'stairs', name: 'Лестница', category: 'cardio', muscleGroup: 'none' },
] as const;

export const TEMPLATES = [
  {
    key: 'strength',
    name: 'Силовая',
    kind: 'strength',
    exercises: [
      { key: 'squat', targetSets: 4, targetRepsMin: 8, targetRepsMax: 12, targetSeconds: null, restSec: 90 },
      { key: 'press', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, targetSeconds: null, restSec: 90 },
      { key: 'plank', targetSets: 3, targetRepsMin: 1, targetRepsMax: 1, targetSeconds: null, restSec: 60 },
    ],
  },
  {
    key: 'cardio',
    name: 'Кардио',
    kind: 'cardio',
    exercises: [
      { key: 'stairs', targetSets: 1, targetRepsMin: null, targetRepsMax: null, targetSeconds: 1800, restSec: 0 },
      { key: 'walk', targetSets: 1, targetRepsMin: null, targetRepsMax: null, targetSeconds: 4200, restSec: 0 },
    ],
  },
] as const;

export const SUPPLEMENTS = [
  { key: 'creatine', name: 'Креатин', dose: '5 г' },
  { key: 'protein', name: 'Протеин', dose: '25 г' },
] as const;

/** Monday strength, Tuesday cardio, Wednesday rest, then around again. */
export const WEEK = [
  { weekday: 1, meals: ['oats', 'chicken', 'fish'], template: 'strength', supplements: ['creatine', 'protein'] },
  { weekday: 2, meals: ['oats', 'chicken', 'kefir'], template: 'cardio', supplements: ['creatine'] },
  { weekday: 3, meals: ['oats', 'fish', 'kefir'], template: null, supplements: ['creatine'] },
  { weekday: 4, meals: ['oats', 'chicken', 'fish'], template: 'strength', supplements: ['creatine', 'protein'] },
  { weekday: 5, meals: ['oats', 'chicken', 'kefir'], template: 'cardio', supplements: ['creatine'] },
  { weekday: 6, meals: ['oats', 'fish', 'kefir'], template: null, supplements: ['creatine'] },
  { weekday: 0, meals: ['oats', 'chicken', 'fish'], template: 'strength', supplements: ['creatine', 'protein'] },
] as const;

/** How many plan entries of each kind result, so nothing is counted by hand. */
export const COUNTS = {
  dishes: DISHES.length,
  exercises: EXERCISES.length,
  templates: TEMPLATES.length,
  supplements: SUPPLEMENTS.length,
  mealEntries: WEEK.reduce((n, day) => n + day.meals.length, 0),
  workoutEntries: WEEK.filter((day) => day.template !== null).length,
  supplementEntries: WEEK.reduce((n, day) => n + day.supplements.length, 0),
};

export interface Fixture {
  planId: number;
  slotIds: number[];
  dishIds: Map<string, number>;
  exerciseIds: Map<string, number>;
  templateIds: Map<string, number>;
  supplementIds: Map<string, number>;
}

export async function insertFixture(db: Database): Promise<Fixture> {
  const slotIds: number[] = [];
  for (const slot of SLOTS) {
    const [row] = await db.insert(t.mealSlot).values({ ...slot }).returning({ id: t.mealSlot.id });
    slotIds.push(row!.id);
  }

  const dishIds = new Map<string, number>();
  for (const dish of DISHES) {
    const [row] = await db
      .insert(t.dish)
      .values({
        name: dish.name,
        category: dish.category,
        kcal: dish.kcal,
        proteinG: dish.proteinG,
        fatG: 0,
        carbsG: 0,
      })
      .returning({ id: t.dish.id });
    dishIds.set(dish.key, row!.id);
  }

  const exerciseIds = new Map<string, number>();
  for (const exercise of EXERCISES) {
    const [row] = await db
      .insert(t.exercise)
      .values({
        name: exercise.name,
        category: exercise.category,
        muscleGroup: exercise.muscleGroup,
      })
      .returning({ id: t.exercise.id });
    exerciseIds.set(exercise.key, row!.id);
  }

  const templateIds = new Map<string, number>();
  for (const template of TEMPLATES) {
    const [row] = await db
      .insert(t.workoutTemplate)
      .values({ name: template.name, kind: template.kind })
      .returning({ id: t.workoutTemplate.id });
    templateIds.set(template.key, row!.id);

    let position = 0;
    for (const item of template.exercises) {
      await db.insert(t.workoutTemplateExercise).values({
        templateId: row!.id,
        exerciseId: exerciseIds.get(item.key)!,
        position: position++,
        targetSets: item.targetSets,
        targetRepsMin: item.targetRepsMin,
        targetRepsMax: item.targetRepsMax,
        targetSeconds: item.targetSeconds,
        restSec: item.restSec,
      });
    }
  }

  const supplementIds = new Map<string, number>();
  for (const [index, supplement] of SUPPLEMENTS.entries()) {
    const [row] = await db
      .insert(t.supplement)
      .values({ name: supplement.name, dose: supplement.dose, position: index })
      .returning({ id: t.supplement.id });
    supplementIds.set(supplement.key, row!.id);
  }

  const [plan] = await db
    .insert(t.plan)
    .values({ name: 'Тестовый план', isActive: true })
    .returning({ id: t.plan.id });

  for (const day of WEEK) {
    let position = 0;
    for (const [index, dishKey] of day.meals.entries()) {
      await db.insert(t.planEntry).values({
        planId: plan!.id,
        weekday: day.weekday,
        kind: 'meal',
        mealSlotId: slotIds[index]!,
        dishId: dishIds.get(dishKey)!,
        position: position++,
      });
    }
    if (day.template !== null) {
      await db.insert(t.planEntry).values({
        planId: plan!.id,
        weekday: day.weekday,
        kind: 'workout',
        workoutTemplateId: templateIds.get(day.template)!,
        position: position++,
      });
    }
    for (const supplementKey of day.supplements) {
      await db.insert(t.planEntry).values({
        planId: plan!.id,
        weekday: day.weekday,
        kind: 'supplement',
        supplementId: supplementIds.get(supplementKey)!,
        position: position++,
      });
    }
  }

  return { planId: plan!.id, slotIds, dishIds, exerciseIds, templateIds, supplementIds };
}
