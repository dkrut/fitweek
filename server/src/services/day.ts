import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type {
  DaySummary,
  DaySupplement,
  DayTotals,
  DayView,
  MealLog,
  PlannedExercise,
  WorkoutLog,
  WorkoutKind,
  WorkoutStatus,
} from '@shared/index.js';
import type { Database } from '../db/client.js';
import * as t from '../db/schema.js';
import { addDays, isFuture, isValidDate, today, weekdayOf } from '../lib/date.js';
import { badRequest } from '../lib/errors.js';

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

export function assertDate(date: string): string {
  if (!isValidDate(date)) throw badRequest(`Некорректная дата: ${date}`);
  return date;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function computeTotals(
  meals: MealLog[],
  workout: WorkoutLog | null,
  supplements: DaySupplement[],
): DayTotals {
  let kcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  let plannedKcal = 0;
  let plannedProteinG = 0;
  let plannedFatG = 0;
  let plannedCarbsG = 0;
  let done = 0;

  /*
   * A meal eaten on top of the plan counts as eaten but is no part of the
   * norm: it neither raises the target nor joins the list of things to tick.
   * Otherwise adding what you ate over the plan would quietly excuse it.
   */
  let plannedMeals = 0;

  for (const meal of meals) {
    if (meal.planned) {
      plannedMeals += 1;
      plannedKcal += meal.kcal;
      plannedProteinG += meal.proteinG;
      plannedFatG += meal.fatG;
      plannedCarbsG += meal.carbsG;
    }
    if (meal.completed) {
      kcal += meal.kcal;
      proteinG += meal.proteinG;
      fatG += meal.fatG;
      carbsG += meal.carbsG;
      if (meal.planned) done += 1;
    }
  }

  // A supplement is as much a planned item of the day as a meal or a workout,
  // so it counts towards the same done-today total.
  const itemsTotal = plannedMeals + (workout ? 1 : 0) + supplements.length;
  if (workout && workout.status === 'done') done += 1;
  done += supplements.filter((item) => item.taken).length;

  return {
    kcal: round1(kcal),
    proteinG: round1(proteinG),
    fatG: round1(fatG),
    carbsG: round1(carbsG),
    plannedKcal: round1(plannedKcal),
    plannedProteinG: round1(plannedProteinG),
    plannedFatG: round1(plannedFatG),
    plannedCarbsG: round1(plannedCarbsG),
    itemsTotal,
    itemsDone: done,
    completionPct: itemsTotal === 0 ? 0 : Math.round((done / itemsTotal) * 100),
  };
}

export async function getActivePlanId(db: Database): Promise<number | null> {
  const rows = await db.select({ id: t.plan.id }).from(t.plan).where(eq(t.plan.isActive, true));
  return rows[0]?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*                              Materialisation                               */
/* -------------------------------------------------------------------------- */

interface PlanProjection {
  meals: Array<{
    mealSlotId: number | null;
    mealSlotName: string;
    timeHint: string;
    dishId: number | null;
    name: string;
    kcal: number;
    proteinG: number;
    fatG: number;
    carbsG: number;
    portion: string;
    recipe: string;
    position: number;
  }>;
  workout: {
    templateId: number;
    name: string;
    kind: WorkoutKind;
    warmup: string;
    cooldown: string;
    planned: PlannedExercise[];
  } | null;
  supplements: Array<{
    supplementId: number;
    name: string;
    dose: string;
    position: number;
  }>;
}

/**
 * Expands the active plan for a weekday into a set of journal rows. Macros are
 * copied from the catalogue: from there on the journal lives its own life.
 */
async function projectPlan(db: Database, planId: number, weekday: number): Promise<PlanProjection> {
  const entries = await db
    .select()
    .from(t.planEntry)
    .where(and(eq(t.planEntry.planId, planId), eq(t.planEntry.weekday, weekday)))
    .orderBy(asc(t.planEntry.position), asc(t.planEntry.id));

  const dishIds = entries.flatMap((e) => (e.dishId === null ? [] : [e.dishId]));
  const slotIds = entries.flatMap((e) => (e.mealSlotId === null ? [] : [e.mealSlotId]));
  const templateIds = entries.flatMap((e) =>
    e.workoutTemplateId === null ? [] : [e.workoutTemplateId],
  );
  const supplementIds = entries.flatMap((e) => (e.supplementId === null ? [] : [e.supplementId]));

  const dishes = dishIds.length
    ? await db.select().from(t.dish).where(inArray(t.dish.id, dishIds))
    : [];
  const slots = slotIds.length
    ? await db.select().from(t.mealSlot).where(inArray(t.mealSlot.id, slotIds))
    : [];
  const templates = templateIds.length
    ? await db.select().from(t.workoutTemplate).where(inArray(t.workoutTemplate.id, templateIds))
    : [];
  const supplements = supplementIds.length
    ? await db.select().from(t.supplement).where(inArray(t.supplement.id, supplementIds))
    : [];

  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const templateById = new Map(templates.map((w) => [w.id, w]));
  const supplementById = new Map(supplements.map((s) => [s.id, s]));

  const meals: PlanProjection['meals'] = [];
  const plannedSupplements: PlanProjection['supplements'] = [];
  let workout: PlanProjection['workout'] = null;

  for (const entry of entries) {
    if (entry.kind === 'meal') {
      const dish = entry.dishId === null ? undefined : dishById.get(entry.dishId);
      const slot = entry.mealSlotId === null ? undefined : slotById.get(entry.mealSlotId);
      if (!dish || !slot) continue;
      meals.push({
        mealSlotId: slot.id,
        mealSlotName: slot.name,
        timeHint: slot.timeHint,
        dishId: dish.id,
        name: dish.name,
        kcal: dish.kcal,
        proteinG: dish.proteinG,
        fatG: dish.fatG,
        carbsG: dish.carbsG,
        portion: dish.portion,
        recipe: dish.recipe,
        position: slot.position * 100 + entry.position,
      });
    } else if (entry.kind === 'workout' && workout === null) {
      const template =
        entry.workoutTemplateId === null ? undefined : templateById.get(entry.workoutTemplateId);
      if (!template) continue;
      workout = {
        templateId: template.id,
        name: template.name,
        kind: template.kind as WorkoutKind,
        warmup: template.warmup,
        cooldown: template.cooldown,
        planned: await loadTemplateExercises(db, template.id),
      };
    } else if (entry.kind === 'supplement') {
      const item = entry.supplementId === null ? undefined : supplementById.get(entry.supplementId);
      // Archived and disabled supplements never reach the day.
      if (!item || !item.active) continue;
      plannedSupplements.push({
        supplementId: item.id,
        name: item.name,
        dose: item.dose,
        position: entry.position,
      });
    }
  }

  meals.sort((a, b) => a.position - b.position);
  plannedSupplements.sort((a, b) => a.position - b.position);
  return { meals, workout, supplements: plannedSupplements };
}

export async function loadTemplateExercises(
  db: Database,
  templateId: number,
): Promise<PlannedExercise[]> {
  const rows = await db
    .select({
      exerciseId: t.workoutTemplateExercise.exerciseId,
      exerciseName: t.exercise.name,
      exerciseCategory: t.exercise.category,
      position: t.workoutTemplateExercise.position,
      targetSets: t.workoutTemplateExercise.targetSets,
      targetRepsMin: t.workoutTemplateExercise.targetRepsMin,
      targetRepsMax: t.workoutTemplateExercise.targetRepsMax,
      targetSeconds: t.workoutTemplateExercise.targetSeconds,
      restSec: t.workoutTemplateExercise.restSec,
      notes: t.workoutTemplateExercise.notes,
    })
    .from(t.workoutTemplateExercise)
    .innerJoin(t.exercise, eq(t.exercise.id, t.workoutTemplateExercise.exerciseId))
    .where(eq(t.workoutTemplateExercise.templateId, templateId))
    .orderBy(asc(t.workoutTemplateExercise.position), asc(t.workoutTemplateExercise.id));

  // The category is a plain text column, narrowed here to the union type.
  return rows.map((row) => ({
    ...row,
    exerciseCategory: row.exerciseCategory as PlannedExercise['exerciseCategory'],
  }));
}

/**
 * Creates journal rows for a date unless they already exist. Idempotent.
 * Future dates are never materialised — they are shown as a projection of the
 * plan, or simply browsing the calendar would litter the database.
 */
export async function materializeDay(db: Database, date: string): Promise<void> {
  if (isFuture(date)) return;

  const existing = await db.select({ date: t.dayLog.date }).from(t.dayLog).where(eq(t.dayLog.date, date));
  if (existing.length > 0) return;

  const planId = await getActivePlanId(db);
  const projection = planId === null ? { meals: [], workout: null, supplements: [] } : await projectPlan(db, planId, weekdayOf(date));

  await db.transaction(async (tx) => {
    // Re-checking inside the transaction guards against two racing requests.
    const again = await tx.select({ date: t.dayLog.date }).from(t.dayLog).where(eq(t.dayLog.date, date));
    if (again.length > 0) return;

    await tx.insert(t.dayLog).values({ date, planId, notes: '' });

    if (projection.meals.length > 0) {
      await tx.insert(t.mealLog).values(
        projection.meals.map((meal, index) => ({
          date,
          mealSlotId: meal.mealSlotId,
          mealSlotName: meal.mealSlotName,
          timeHint: meal.timeHint,
          dishId: meal.dishId,
          name: meal.name,
          kcal: meal.kcal,
          proteinG: meal.proteinG,
          fatG: meal.fatG,
          carbsG: meal.carbsG,
          portion: meal.portion,
          recipe: meal.recipe,
          completed: false,
          position: index,
        })),
      );
    }

    if (projection.supplements.length > 0) {
      await tx.insert(t.supplementLog).values(
        projection.supplements.map((item, index) => ({
          date,
          supplementId: item.supplementId,
          name: item.name,
          dose: item.dose,
          position: index,
          taken: false,
        })),
      );
    }

    if (projection.workout) {
      await tx.insert(t.workoutLog).values({
        date,
        templateId: projection.workout.templateId,
        name: projection.workout.name,
        kind: projection.workout.kind,
        status: 'planned',
        warmup: projection.workout.warmup,
        cooldown: projection.workout.cooldown,
        plannedJson: JSON.stringify(projection.workout.planned),
        notes: '',
      });
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                                  Reading                                   */
/* -------------------------------------------------------------------------- */

function parsePlanned(json: string): PlannedExercise[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((raw) => {
      const item = raw as Partial<PlannedExercise>;
      return {
        ...item,
        exerciseCategory: item.exerciseCategory ?? 'strength',
      } as PlannedExercise;
    });
  } catch {
    return [];
  }
}

/**
 * The exercise type comes from the catalogue, not from the plan snapshot.
 *
 * The snapshot holds the intent of the day — sets, reps, time — and must not be
 * rewritten. The exercise type is not part of that intent: it only decides
 * which fields to show when recording a set, and it should follow the
 * catalogue even when an exercise is reclassified after the day was built.
 */
async function withCurrentCategories(
  db: Database,
  planned: PlannedExercise[],
): Promise<PlannedExercise[]> {
  const ids = [...new Set(planned.map((item) => item.exerciseId))];
  if (ids.length === 0) return planned;

  const rows = await db
    .select({ id: t.exercise.id, category: t.exercise.category })
    .from(t.exercise)
    .where(inArray(t.exercise.id, ids));
  const categories = new Map(rows.map((row) => [row.id, row.category]));

  return planned.map((item) => {
    // The exercise may have been deleted, in which case the snapshot stands.
    const category = categories.get(item.exerciseId);
    return category
      ? { ...item, exerciseCategory: category as PlannedExercise['exerciseCategory'] }
      : item;
  });
}

async function readWorkout(db: Database, date: string): Promise<WorkoutLog | null> {
  const rows = await db.select().from(t.workoutLog).where(eq(t.workoutLog.date, date));
  const row = rows[0];
  if (!row) return null;

  const sets = await db
    .select({
      id: t.setLog.id,
      workoutLogId: t.setLog.workoutLogId,
      exerciseId: t.setLog.exerciseId,
      exerciseName: t.exercise.name,
      exerciseCategory: t.exercise.category,
      setIndex: t.setLog.setIndex,
      reps: t.setLog.reps,
      weightKg: t.setLog.weightKg,
      seconds: t.setLog.seconds,
      distanceKm: t.setLog.distanceKm,
      band: t.setLog.band,
      rpe: t.setLog.rpe,
      isWarmup: t.setLog.isWarmup,
      completed: t.setLog.completed,
    })
    .from(t.setLog)
    .innerJoin(t.exercise, eq(t.exercise.id, t.setLog.exerciseId))
    .where(eq(t.setLog.workoutLogId, row.id))
    .orderBy(asc(t.setLog.exerciseId), asc(t.setLog.setIndex), asc(t.setLog.id));

  return {
    id: row.id,
    date: row.date,
    templateId: row.templateId,
    name: row.name,
    kind: row.kind as WorkoutKind,
    status: row.status as WorkoutStatus,
    warmup: row.warmup,
    cooldown: row.cooldown,
    durationMin: row.durationMin,
    distanceKm: row.distanceKm,
    rpe: row.rpe,
    notes: row.notes,
    planned: await withCurrentCategories(db, parsePlanned(row.plannedJson)),
    // The category is plain text in the database; narrowed to the schema enum.
    sets: sets.map((set) => ({
      ...set,
      exerciseCategory: set.exerciseCategory as PlannedExercise['exerciseCategory'],
    })),
  };
}

/** Supplements of a materialised day: journal rows with a snapshot of the name. */
async function readSupplements(db: Database, date: string): Promise<DaySupplement[]> {
  const rows = await db
    .select()
    .from(t.supplementLog)
    .where(eq(t.supplementLog.date, date))
    .orderBy(asc(t.supplementLog.position), asc(t.supplementLog.id));

  return rows.map((row) => ({
    id: row.id,
    supplementId: row.supplementId,
    name: row.name,
    dose: row.dose,
    taken: row.taken,
  }));
}

/** Whether journal rows already exist for a date. */
export async function isMaterialized(db: Database, date: string): Promise<boolean> {
  const rows = await db.select({ date: t.dayLog.date }).from(t.dayLog).where(eq(t.dayLog.date, date));
  return rows.length > 0;
}

export async function getDayView(db: Database, date: string): Promise<DayView> {
  assertDate(date);

  /*
   * Viewing a date creates nothing by itself, today aside. Otherwise wandering
   * through past weeks would invent days that were never lived, and they would
   * drag the plan-adherence metric down.
   * A past date is materialised by an explicit POST /days/:date/materialize.
   */
  const needsProjection = isFuture(date) || (date !== today() && !(await isMaterialized(db, date)));

  if (needsProjection) {
    const planId = await getActivePlanId(db);
    const projection =
      planId === null ? { meals: [], workout: null, supplements: [] } : await projectPlan(db, planId, weekdayOf(date));

    const meals: MealLog[] = projection.meals.map((meal, index) => ({
      // Negative ids: these rows are virtual and cannot be edited.
      id: -(index + 1),
      date,
      mealSlotId: meal.mealSlotId,
      mealSlotName: meal.mealSlotName,
      timeHint: meal.timeHint,
      dishId: meal.dishId,
      name: meal.name,
      kcal: meal.kcal,
      proteinG: meal.proteinG,
      fatG: meal.fatG,
      carbsG: meal.carbsG,
      portion: meal.portion,
      recipe: meal.recipe,
      completed: false,
      // A projection is the plan itself, so every row of it is planned.
      planned: true,
      position: index,
    }));

    // Negative ids: no journal rows exist for this day yet.
    const plannedSupplements: DaySupplement[] = projection.supplements.map((item, index) => ({
      id: -(index + 1),
      supplementId: item.supplementId,
      name: item.name,
      dose: item.dose,
      taken: false,
    }));

    const workout: WorkoutLog | null = projection.workout
      ? {
          id: -1,
          date,
          templateId: projection.workout.templateId,
          name: projection.workout.name,
            kind: projection.workout.kind,
          status: 'planned',
          warmup: projection.workout.warmup,
          cooldown: projection.workout.cooldown,
          durationMin: null,
          distanceKm: null,
          rpe: null,
          notes: '',
          planned: projection.workout.planned,
          sets: [],
        }
      : null;

    return {
      date,
      weekday: weekdayOf(date),
      materialized: false,
      notes: '',
      meals,
      workout,
      supplements: plannedSupplements,
      totals: computeTotals(meals, workout, plannedSupplements),
    };
  }

  await materializeDay(db, date);

  const dayRows = await db.select().from(t.dayLog).where(eq(t.dayLog.date, date));
  const day = dayRows[0];

  const meals = await db
    .select()
    .from(t.mealLog)
    .where(eq(t.mealLog.date, date))
    .orderBy(asc(t.mealLog.position), asc(t.mealLog.id));

  const workout = await readWorkout(db, date);
  const supplements = await readSupplements(db, date);

  return {
    date,
    weekday: weekdayOf(date),
    materialized: true,
    notes: day?.notes ?? '',
    meals,
    workout,
    supplements,
    totals: computeTotals(meals, workout, supplements),
  };
}

/** Summary over a date range for the week grid. Future days stay virtual. */
export async function getDaySummaries(
  db: Database,
  from: string,
  to: string,
): Promise<DaySummary[]> {
  assertDate(from);
  assertDate(to);
  if (from > to) throw badRequest('Начало диапазона позже конца');

  const mealRows = await db
    .select()
    .from(t.mealLog)
    .where(and(gte(t.mealLog.date, from), lte(t.mealLog.date, to)));

  const workoutRows = await db
    .select()
    .from(t.workoutLog)
    .where(and(gte(t.workoutLog.date, from), lte(t.workoutLog.date, to)));

  const supplementRows = await db
    .select({ date: t.supplementLog.date, taken: t.supplementLog.taken })
    .from(t.supplementLog)
    .where(and(gte(t.supplementLog.date, from), lte(t.supplementLog.date, to)));

  const dayRows = await db
    .select({ date: t.dayLog.date })
    .from(t.dayLog)
    .where(and(gte(t.dayLog.date, from), lte(t.dayLog.date, to)));

  const materializedDates = new Set(dayRows.map((d) => d.date));
  const mealsByDate = new Map<string, typeof mealRows>();
  for (const meal of mealRows) {
    const list = mealsByDate.get(meal.date) ?? [];
    list.push(meal);
    mealsByDate.set(meal.date, list);
  }
  const workoutByDate = new Map(workoutRows.map((w) => [w.date, w]));

  const supplementsByDate = new Map<string, { total: number; taken: number }>();
  for (const row of supplementRows) {
    const entry = supplementsByDate.get(row.date) ?? { total: 0, taken: 0 };
    entry.total += 1;
    if (row.taken) entry.taken += 1;
    supplementsByDate.set(row.date, entry);
  }

  const planId = await getActivePlanId(db);
  const result: DaySummary[] = [];
  let cursor = from;

  while (cursor <= to) {
    const date = cursor;
    if (materializedDates.has(date)) {
      const meals = mealsByDate.get(date) ?? [];
      const workout = workoutByDate.get(date) ?? null;
      let kcal = 0;
      let proteinG = 0;
      let plannedKcal = 0;
      let plannedProteinG = 0;
      let done = 0;
      for (const meal of meals) {
        plannedKcal += meal.kcal;
        plannedProteinG += meal.proteinG;
        if (meal.completed) {
          kcal += meal.kcal;
          proteinG += meal.proteinG;
          done += 1;
        }
      }
      const supplements = supplementsByDate.get(date) ?? { total: 0, taken: 0 };
      const itemsTotal = meals.length + (workout ? 1 : 0) + supplements.total;
      if (workout && workout.status === 'done') done += 1;
      done += supplements.taken;

      result.push({
        date,
        weekday: weekdayOf(date),
        materialized: true,
        kcal: round1(kcal),
        proteinG: round1(proteinG),
        plannedKcal: round1(plannedKcal),
        plannedProteinG: round1(plannedProteinG),
        itemsTotal,
        itemsDone: done,
        completionPct: itemsTotal === 0 ? 0 : Math.round((done / itemsTotal) * 100),
        workoutName: workout?.name ?? null,
        workoutKind: (workout?.kind as WorkoutKind | undefined) ?? null,
        workoutStatus: (workout?.status as WorkoutStatus | undefined) ?? null,
      });
    } else {
      const projection =
        planId === null
          ? { meals: [], workout: null, supplements: [] }
          : await projectPlan(db, planId, weekdayOf(date));
      result.push({
        date,
        weekday: weekdayOf(date),
        materialized: false,
        kcal: 0,
        proteinG: 0,
        plannedKcal: round1(projection.meals.reduce((sum, m) => sum + m.kcal, 0)),
        plannedProteinG: round1(projection.meals.reduce((sum, m) => sum + m.proteinG, 0)),
        itemsTotal:
          projection.meals.length +
          (projection.workout ? 1 : 0) +
          projection.supplements.length,
        itemsDone: 0,
        completionPct: 0,
        workoutName: projection.workout?.name ?? null,
        workoutKind: projection.workout?.kind ?? null,
        workoutStatus: projection.workout ? 'planned' : null,
      });
    }

    cursor = addDays(cursor, 1);
  }

  return result;
}
