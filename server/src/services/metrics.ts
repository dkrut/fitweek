import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type {
  ExerciseProgress,
  ExerciseProgressPoint,
  MeasurementPoint,
  MetricsKpi,
  MetricsOverview,
  MuscleGroup,
  MuscleVolumePoint,
  NutritionPoint,
  WeekPoint,
} from '@shared/index.js';
import { muscleGroupLabels } from '@shared/index.js';
import type { Database } from '../db/client.js';
import * as t from '../db/schema.js';
import { addDays, daysBetween, startOfWeek, today } from '../lib/date.js';
import { notFound } from '../lib/errors.js';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** One-rep-max estimate using the Epley formula. */
export function epley1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return round1(weightKg * (1 + reps / 30));
}

/**
 * A 7-calendar-day moving average of weight, not an average of the last 7
 * entries: daily weight swings by ±1.5 kg, and the trend is unreadable raw.
 */
function movingAverage7(
  points: Array<{ date: string; value: number | null }>,
): Array<number | null> {
  return points.map((point, index) => {
    if (point.value === null) return null;
    const windowStart = addDays(point.date, -6);
    let sum = 0;
    let count = 0;
    for (let i = index; i >= 0; i -= 1) {
      const candidate = points[i];
      if (!candidate || candidate.date < windowStart) break;
      if (candidate.value !== null) {
        sum += candidate.value;
        count += 1;
      }
    }
    return count === 0 ? null : round2(sum / count);
  });
}

export async function getMetricsOverview(
  db: Database,
  from: string,
  to: string,
): Promise<MetricsOverview> {
  const [measurements, nutrition, muscleVolume, weeks, kpi] = await Promise.all([
    buildMeasurements(db, from, to),
    buildNutrition(db, from, to),
    buildMuscleVolume(db, from, to),
    buildWeeks(db, from, to),
    buildKpi(db),
  ]);

  return { from, to, kpi, measurements, nutrition, weeks, muscleVolume };
}

async function buildMeasurements(
  db: Database,
  from: string,
  to: string,
): Promise<MeasurementPoint[]> {
  const rows = await db
    .select()
    .from(t.measurement)
    .where(and(gte(t.measurement.date, from), lte(t.measurement.date, to)))
    .orderBy(asc(t.measurement.date));

  const ma = movingAverage7(rows.map((r) => ({ date: r.date, value: r.weightKg })));

  return rows.map((row, index) => ({
    date: row.date,
    weightKg: row.weightKg,
    weightMa7: ma[index] ?? null,
    waistCm: row.waistCm,
    chestCm: row.chestCm,
    hipCm: row.hipCm,
    bicepCm: row.bicepCm,
    fatPct: row.fatPct,
    visceral: row.visceral,
    muscleKg: row.muscleKg,
    bmrKcal: row.bmrKcal,
  }));
}

interface DayAggregate {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** The plan for that day, which is also the target line on the chart. */
  plannedKcal: number;
  plannedProteinG: number;
  itemsTotal: number;
  itemsDone: number;
}

async function aggregateDays(
  db: Database,
  from: string,
  to: string,
): Promise<Map<string, DayAggregate>> {
  const meals = await db
    .select()
    .from(t.mealLog)
    .where(and(gte(t.mealLog.date, from), lte(t.mealLog.date, to)));

  const workouts = await db
    .select({ date: t.workoutLog.date, status: t.workoutLog.status })
    .from(t.workoutLog)
    .where(and(gte(t.workoutLog.date, from), lte(t.workoutLog.date, to)));

  // Supplements count towards completion exactly as they do on the day screen;
  // otherwise plan adherence would show a different percentage than the day.
  const supplements = await db
    .select({ date: t.supplementLog.date, taken: t.supplementLog.taken })
    .from(t.supplementLog)
    .where(and(gte(t.supplementLog.date, from), lte(t.supplementLog.date, to)));

  const byDate = new Map<string, DayAggregate>();
  const ensure = (date: string): DayAggregate => {
    let entry = byDate.get(date);
    if (!entry) {
      entry = {
        kcal: 0,
        proteinG: 0,
        fatG: 0,
        carbsG: 0,
        plannedKcal: 0,
        plannedProteinG: 0,
        itemsTotal: 0,
        itemsDone: 0,
      };
      byDate.set(date, entry);
    }
    return entry;
  };

  for (const meal of meals) {
    const entry = ensure(meal.date);
    entry.itemsTotal += 1;
    entry.plannedKcal += meal.kcal;
    entry.plannedProteinG += meal.proteinG;
    if (meal.completed) {
      entry.kcal += meal.kcal;
      entry.proteinG += meal.proteinG;
      entry.fatG += meal.fatG;
      entry.carbsG += meal.carbsG;
      entry.itemsDone += 1;
    }
  }

  for (const workout of workouts) {
    const entry = ensure(workout.date);
    entry.itemsTotal += 1;
    if (workout.status === 'done') entry.itemsDone += 1;
  }

  for (const item of supplements) {
    const entry = ensure(item.date);
    entry.itemsTotal += 1;
    if (item.taken) entry.itemsDone += 1;
  }

  return byDate;
}

async function buildNutrition(db: Database, from: string, to: string): Promise<NutritionPoint[]> {
  const byDate = await aggregateDays(db, from, to);
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, agg]) => ({
      date,
      kcal: round1(agg.kcal),
      proteinG: round1(agg.proteinG),
      plannedKcal: round1(agg.plannedKcal),
      plannedProteinG: round1(agg.plannedProteinG),
      fatG: round1(agg.fatG),
      carbsG: round1(agg.carbsG),
      itemsTotal: agg.itemsTotal,
      itemsDone: agg.itemsDone,
      completionPct:
        agg.itemsTotal === 0 ? 0 : Math.round((agg.itemsDone / agg.itemsTotal) * 100),
    }));
}

async function buildMuscleVolume(
  db: Database,
  from: string,
  to: string,
): Promise<MuscleVolumePoint[]> {
  const rows = await db
    .select({
      muscleGroup: t.exercise.muscleGroup,
      reps: t.setLog.reps,
      weightKg: t.setLog.weightKg,
      completed: t.setLog.completed,
      isWarmup: t.setLog.isWarmup,
    })
    .from(t.setLog)
    .innerJoin(t.workoutLog, eq(t.workoutLog.id, t.setLog.workoutLogId))
    .innerJoin(t.exercise, eq(t.exercise.id, t.setLog.exerciseId))
    .where(and(gte(t.workoutLog.date, from), lte(t.workoutLog.date, to)));

  const byGroup = new Map<string, { tonnageKg: number; sets: number }>();
  for (const row of rows) {
    if (!row.completed || row.isWarmup) continue;
    const entry = byGroup.get(row.muscleGroup) ?? { tonnageKg: 0, sets: 0 };
    entry.tonnageKg += (row.weightKg ?? 0) * (row.reps ?? 0);
    entry.sets += 1;
    byGroup.set(row.muscleGroup, entry);
  }

  return [...byGroup.entries()]
    .map(([group, value]) => ({
      muscleGroup: group as MuscleGroup,
      label: muscleGroupLabels[group as MuscleGroup] ?? group,
      tonnageKg: round1(value.tonnageKg),
      sets: value.sets,
    }))
    .sort((a, b) => b.tonnageKg - a.tonnageKg);
}

async function buildWeeks(db: Database, from: string, to: string): Promise<WeekPoint[]> {
  const byDate = await aggregateDays(db, from, to);

  const workouts = await db
    .select()
    .from(t.workoutLog)
    .where(and(gte(t.workoutLog.date, from), lte(t.workoutLog.date, to)));

  const sets = await db
    .select({
      date: t.workoutLog.date,
      workoutLogId: t.setLog.workoutLogId,
      reps: t.setLog.reps,
      weightKg: t.setLog.weightKg,
      seconds: t.setLog.seconds,
      distanceKm: t.setLog.distanceKm,
      exerciseCategory: t.exercise.category,
      completed: t.setLog.completed,
      isWarmup: t.setLog.isWarmup,
    })
    .from(t.setLog)
    .innerJoin(t.workoutLog, eq(t.workoutLog.id, t.setLog.workoutLogId))
    .innerJoin(t.exercise, eq(t.exercise.id, t.setLog.exerciseId))
    .where(and(gte(t.workoutLog.date, from), lte(t.workoutLog.date, to)));

  /*
   * Cardio is counted from recorded sets: time and distance live where every
   * other thing that was actually done lives.
   *
   * Only sets of cardio exercises count — a plank is measured in seconds too,
   * but it produces no cardio. Warm-up sets are not excluded: for cardio that
   * distinction means nothing, and the minutes would be lost silently.
   */
  const cardioByWorkout = new Map<number, { seconds: number; km: number }>();
  for (const set of sets) {
    if (!set.completed || set.exerciseCategory !== 'cardio') continue;
    if (set.seconds === null && set.distanceKm === null) continue;
    const entry = cardioByWorkout.get(set.workoutLogId) ?? { seconds: 0, km: 0 };
    entry.seconds += set.seconds ?? 0;
    entry.km += set.distanceKm ?? 0;
    cardioByWorkout.set(set.workoutLogId, entry);
  }

  interface WeekAccumulator {
    kcalSum: number;
    proteinSum: number;
    days: number;
    itemsTotal: number;
    itemsDone: number;
    tonnageKg: number;
    workoutsDone: number;
    cardioKm: number;
    cardioMin: number;
  }

  const byWeek = new Map<string, WeekAccumulator>();
  const ensure = (week: string): WeekAccumulator => {
    let entry = byWeek.get(week);
    if (!entry) {
      entry = {
        kcalSum: 0,
        proteinSum: 0,
        days: 0,
        itemsTotal: 0,
        itemsDone: 0,
        tonnageKg: 0,
        workoutsDone: 0,
        cardioKm: 0,
        cardioMin: 0,
      };
      byWeek.set(week, entry);
    }
    return entry;
  };

  for (const [date, agg] of byDate) {
    const entry = ensure(startOfWeek(date, 1));
    entry.kcalSum += agg.kcal;
    entry.proteinSum += agg.proteinG;
    entry.days += 1;
    entry.itemsTotal += agg.itemsTotal;
    entry.itemsDone += agg.itemsDone;
  }

  for (const workout of workouts) {
    const entry = ensure(startOfWeek(workout.date, 1));
    if (workout.status === 'done') {
      entry.workoutsDone += 1;
      /*
       * Count from the sets, and when cardio is not split into them fall back
       * to the total recorded for the whole session. That total counts for
       * cardio only: on a strength day those fields would invent kilometres.
       */
      const fromSets = cardioByWorkout.get(workout.id);
      const whole = workout.kind === 'cardio' ? workout : null;
      entry.cardioKm += fromSets ? round1(fromSets.km) : whole?.distanceKm ?? 0;
      entry.cardioMin += fromSets ? round1(fromSets.seconds / 60) : whole?.durationMin ?? 0;
    }
  }

  for (const set of sets) {
    if (!set.completed || set.isWarmup) continue;
    const entry = ensure(startOfWeek(set.date, 1));
    entry.tonnageKg += (set.weightKg ?? 0) * (set.reps ?? 0);
  }

  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStart, value]) => ({
      weekStart,
      label: formatWeekLabel(weekStart),
      avgKcal: value.days === 0 ? 0 : round1(value.kcalSum / value.days),
      avgProteinG: value.days === 0 ? 0 : round1(value.proteinSum / value.days),
      adherencePct:
        value.itemsTotal === 0 ? 0 : Math.round((value.itemsDone / value.itemsTotal) * 100),
      tonnageKg: round1(value.tonnageKg),
      workoutsDone: value.workoutsDone,
      cardioKm: round1(value.cardioKm),
      cardioMin: round1(value.cardioMin),
    }));
}

function formatWeekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split('-') as [string, string, string];
  return `${day}.${month}`;
}

async function buildKpi(db: Database): Promise<MetricsKpi> {
  const reference = today();

  const allMeasurements = await db
    .select()
    .from(t.measurement)
    .orderBy(asc(t.measurement.date));

  const withWeight = allMeasurements.filter((m) => m.weightKg !== null);
  const withWaist = allMeasurements.filter((m) => m.waistCm !== null);

  const latestWeight = withWeight.at(-1) ?? null;
  const monthAgo = addDays(reference, -30);
  const baselineWeight =
    [...withWeight].reverse().find((m) => m.date <= monthAgo) ?? withWeight[0] ?? null;
  const latestWaist = withWaist.at(-1) ?? null;
  const baselineWaist =
    [...withWaist].reverse().find((m) => m.date <= monthAgo) ?? withWaist[0] ?? null;

  const weightDelta30 =
    latestWeight && baselineWeight && latestWeight.date !== baselineWeight.date
      ? round1((latestWeight.weightKg ?? 0) - (baselineWeight.weightKg ?? 0))
      : null;
  const waistDelta30 =
    latestWaist && baselineWaist && latestWaist.date !== baselineWaist.date
      ? round1((latestWaist.waistCm ?? 0) - (baselineWaist.waistCm ?? 0))
      : null;

  const weekAgo = addDays(reference, -6);
  const lastWeek = await aggregateDays(db, weekAgo, reference);
  const weekDays = [...lastWeek.values()];
  const avgProtein7 =
    weekDays.length === 0
      ? null
      : round1(weekDays.reduce((sum, d) => sum + d.proteinG, 0) / weekDays.length);
  const avgKcal7 =
    weekDays.length === 0
      ? null
      : round1(weekDays.reduce((sum, d) => sum + d.kcal, 0) / weekDays.length);

  const last28 = addDays(reference, -27);
  const workouts = await db
    .select({ id: t.workoutLog.id })
    .from(t.workoutLog)
    .where(
      and(
        gte(t.workoutLog.date, last28),
        lte(t.workoutLog.date, reference),
        eq(t.workoutLog.status, 'done'),
      ),
    );

  const sets = await db
    .select({
      reps: t.setLog.reps,
      weightKg: t.setLog.weightKg,
      completed: t.setLog.completed,
      isWarmup: t.setLog.isWarmup,
    })
    .from(t.setLog)
    .innerJoin(t.workoutLog, eq(t.workoutLog.id, t.setLog.workoutLogId))
    .where(and(gte(t.workoutLog.date, last28), lte(t.workoutLog.date, reference)));

  const tonnage = sets.reduce(
    (sum, s) => (s.completed && !s.isWarmup ? sum + (s.weightKg ?? 0) * (s.reps ?? 0) : sum),
    0,
  );

  return {
    currentWeightKg: latestWeight?.weightKg ?? null,
    weightDelta30,
    waistDelta30,
    avgProtein7,
    avgKcal7,
    workoutsLast28: workouts.length,
    tonnageLast28Kg: round1(tonnage),
    streakDays: await computeStreak(db, reference),
  };
}

/**
 * Consecutive days with at least 80% of items done. Counting starts from
 * yesterday when today has not reached the bar yet, or a morning check would
 * reset the streak to zero.
 */
async function computeStreak(db: Database, reference: string): Promise<number> {
  const windowStart = addDays(reference, -365);
  const byDate = await aggregateDays(db, windowStart, reference);

  const meets = (date: string): boolean => {
    const agg = byDate.get(date);
    if (!agg || agg.itemsTotal === 0) return false;
    return agg.itemsDone / agg.itemsTotal >= 0.8;
  };

  let cursor = meets(reference) ? reference : addDays(reference, -1);
  let streak = 0;
  while (daysBetween(windowStart, cursor) >= 0 && meets(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export async function getExerciseProgress(
  db: Database,
  exerciseId: number,
  from: string,
  to: string,
): Promise<ExerciseProgress> {
  const exerciseRows = await db
    .select({ id: t.exercise.id, name: t.exercise.name })
    .from(t.exercise)
    .where(eq(t.exercise.id, exerciseId));
  const exercise = exerciseRows[0];
  if (!exercise) throw notFound('Упражнение не найдено');

  const rows = await db
    .select({
      date: t.workoutLog.date,
      reps: t.setLog.reps,
      weightKg: t.setLog.weightKg,
      completed: t.setLog.completed,
      isWarmup: t.setLog.isWarmup,
    })
    .from(t.setLog)
    .innerJoin(t.workoutLog, eq(t.workoutLog.id, t.setLog.workoutLogId))
    .where(
      and(
        eq(t.setLog.exerciseId, exerciseId),
        gte(t.workoutLog.date, from),
        lte(t.workoutLog.date, to),
      ),
    )
    .orderBy(asc(t.workoutLog.date));

  interface Acc {
    topWeightKg: number | null;
    topReps: number | null;
    estimated1rm: number;
    tonnageKg: number;
    totalReps: number;
    sets: number;
  }

  const byDate = new Map<string, Acc>();
  for (const row of rows) {
    if (!row.completed || row.isWarmup) continue;
    const acc = byDate.get(row.date) ?? {
      topWeightKg: null,
      topReps: null,
      estimated1rm: 0,
      tonnageKg: 0,
      totalReps: 0,
      sets: 0,
    };
    const weight = row.weightKg ?? 0;
    const reps = row.reps ?? 0;
    acc.sets += 1;
    acc.totalReps += reps;
    acc.tonnageKg += weight * reps;

    // The best set of a day is picked by estimated 1RM rather than by raw
    // weight: 40 kg x 12 is a stronger result than 45 kg x 3.
    const estimate = epley1rm(weight, reps);
    if (estimate > acc.estimated1rm) {
      acc.estimated1rm = estimate;
      acc.topWeightKg = weight > 0 ? weight : null;
      acc.topReps = reps > 0 ? reps : null;
    }
    byDate.set(row.date, acc);
  }

  const points: ExerciseProgressPoint[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, acc]) => ({
      date,
      topWeightKg: acc.topWeightKg,
      topReps: acc.topReps,
      estimated1rm: acc.estimated1rm > 0 ? acc.estimated1rm : null,
      tonnageKg: round1(acc.tonnageKg),
      totalReps: acc.totalReps,
      sets: acc.sets,
    }));

  return { exerciseId: exercise.id, exerciseName: exercise.name, points };
}
