import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../src/db/schema.js';
import { addDays, startOfWeek, today } from '../src/lib/date.js';
import { epley1rm, getExerciseProgress, getMetricsOverview } from '../src/services/metrics.js';
import { getDayView, materializeDay } from '../src/services/day.js';
import { createTestContext, type TestContext } from './helpers.js';

describe('метрики', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('оценивает 1ПМ по формуле Эпли', () => {
    expect(epley1rm(100, 1)).toBeCloseTo(103.3, 1);
    expect(epley1rm(60, 10)).toBeCloseTo(80, 1);
    expect(epley1rm(0, 10)).toBe(0);
    expect(epley1rm(50, 0)).toBe(0);
  });

  it('сглаживает вес скользящим средним за 7 дней', async () => {
    // A +/-1 kg sawtooth around 80: without smoothing the trend is invisible.
    const weights = [81, 79, 81, 79, 81, 79, 81];
    for (let i = 0; i < weights.length; i += 1) {
      await ctx.db.insert(t.measurement).values({
        date: addDays(today(), -(weights.length - 1 - i)),
        weightKg: weights[i]!,
      });
    }

    const overview = await getMetricsOverview(ctx.db, addDays(today(), -30), today());
    const last = overview.measurements.at(-1)!;

    expect(last.weightKg).toBe(81);
    expect(last.weightMa7).toBeCloseTo(80.14, 1);
  });

  it('считает тоннаж только по выполненным рабочим подходам', async () => {
    const date = today();
    const day = await getDayView(ctx.db, date);
    const workoutId = day.workout!.id;
    const exerciseId = day.workout!.planned[0]!.exerciseId;

    await ctx.db.insert(t.setLog).values([
      { workoutLogId: workoutId, exerciseId, setIndex: 0, reps: 10, weightKg: 50, completed: true },
      { workoutLogId: workoutId, exerciseId, setIndex: 1, reps: 10, weightKg: 50, completed: true },
      // A warm-up set does not count.
      { workoutLogId: workoutId, exerciseId, setIndex: 2, reps: 10, weightKg: 50, isWarmup: true, completed: true },
      // Neither does an unfinished one.
      { workoutLogId: workoutId, exerciseId, setIndex: 3, reps: 10, weightKg: 50, completed: false },
    ]);

    const overview = await getMetricsOverview(ctx.db, addDays(today(), -30), today());
    const week = overview.weeks.find((w) => w.weekStart === startOfWeek(date, 1));

    expect(week?.tonnageKg).toBe(1000);
    expect(overview.muscleVolume[0]?.tonnageKg).toBe(1000);
    expect(overview.muscleVolume[0]?.sets).toBe(2);
  });

  it('выбирает лучший подход дня по оценочному 1ПМ, а не по весу', async () => {
    const date = today();
    const day = await getDayView(ctx.db, date);
    const workoutId = day.workout!.id;
    const exerciseId = day.workout!.planned[0]!.exerciseId;

    await ctx.db.insert(t.setLog).values([
      // 45x3 -> 49.5; 40x12 -> 56. The second wins despite the lighter weight.
      { workoutLogId: workoutId, exerciseId, setIndex: 0, reps: 3, weightKg: 45, completed: true },
      { workoutLogId: workoutId, exerciseId, setIndex: 1, reps: 12, weightKg: 40, completed: true },
    ]);

    const progress = await getExerciseProgress(ctx.db, exerciseId, addDays(date, -30), date);
    const point = progress.points[0]!;

    expect(point.topWeightKg).toBe(40);
    expect(point.topReps).toBe(12);
    expect(point.estimated1rm).toBeCloseTo(56, 1);
    expect(point.tonnageKg).toBe(45 * 3 + 40 * 12);
  });

  it('кардио считает по подходам — и время, и дистанцию', async () => {
    // Find a cardio day in the plan: a walking set is measured in time.
    let date = today();
    let day = await getDayView(ctx.db, date);
    for (let i = 1; i <= 7 && day.workout?.kind !== 'cardio'; i += 1) {
      date = addDays(today(), -i);
      await materializeDay(ctx.db, date);
      day = await getDayView(ctx.db, date);
    }
    expect(day.workout?.kind).toBe('cardio');

    const workout = day.workout!;
    await ctx.db
      .update(t.workoutLog)
      .set({ status: 'done', durationMin: null, distanceKm: null })
      .where(eq(t.workoutLog.id, workout.id));
    await ctx.db.insert(t.setLog).values([
      {
        workoutLogId: workout.id,
        exerciseId: workout.planned[0]!.exerciseId,
        setIndex: 0,
        seconds: 1800,
        completed: true,
      },
      {
        workoutLogId: workout.id,
        exerciseId: workout.planned[1]!.exerciseId,
        setIndex: 0,
        seconds: 4200,
        distanceKm: 6.5,
        completed: true,
      },
      // An unfinished set does not count.
      {
        workoutLogId: workout.id,
        exerciseId: workout.planned[1]!.exerciseId,
        setIndex: 1,
        seconds: 600,
        distanceKm: 1,
        completed: false,
      },
    ]);

    const week = async () => {
      const overview = await getMetricsOverview(ctx.db, addDays(today(), -30), today());
      return overview.weeks.find((w) => w.weekStart === startOfWeek(date, 1));
    };

    const result = await week();
    expect(result?.cardioMin).toBe(100);
    expect(result?.cardioKm).toBe(6.5);
  });

  it('дни, заполненные до переноса дистанции, читаются из тренировки', async () => {
    // Cardio totals recorded on the session itself, with no sets at all.
    let date = today();
    let day = await getDayView(ctx.db, date);
    for (let i = 1; i <= 7 && day.workout?.kind !== 'cardio'; i += 1) {
      date = addDays(today(), -i);
      await materializeDay(ctx.db, date);
      day = await getDayView(ctx.db, date);
    }
    expect(day.workout?.kind).toBe('cardio');

    await ctx.db
      .update(t.workoutLog)
      .set({ status: 'done', durationMin: 70, distanceKm: 6.5 })
      .where(eq(t.workoutLog.id, day.workout!.id));

    // The same columns on a strength session do not count as cardio: there
    // they could only have appeared by mistake.
    const strength = await ctx.db
      .select()
      .from(t.workoutLog)
      .where(eq(t.workoutLog.kind, 'strength'));
    if (strength[0]) {
      await ctx.db
        .update(t.workoutLog)
        .set({ status: 'done', durationMin: 40, distanceKm: 3 })
        .where(eq(t.workoutLog.id, strength[0].id));
    }

    const overview = await getMetricsOverview(ctx.db, addDays(today(), -30), today());
    const week = overview.weeks.find((w) => w.weekStart === startOfWeek(date, 1));
    expect(week?.cardioMin).toBe(70);
    expect(week?.cardioKm).toBe(6.5);
  });

  it('время силового упражнения в кардио-минуты не попадает', async () => {
    const date = today();
    const day = await getDayView(ctx.db, date);
    const workout = day.workout!;
    // A plank is measured in seconds, yet it produces no cardio.
    const plank = await ctx.db.select().from(t.exercise).where(eq(t.exercise.category, 'strength'));

    await ctx.db
      .update(t.workoutLog)
      .set({ status: 'done', durationMin: null })
      .where(eq(t.workoutLog.id, workout.id));
    await ctx.db.insert(t.setLog).values({
      workoutLogId: workout.id,
      exerciseId: plank[0]!.id,
      setIndex: 0,
      seconds: 2400,
      completed: true,
    });

    const overview = await getMetricsOverview(ctx.db, addDays(today(), -30), today());
    expect(overview.weeks.find((w) => w.weekStart === startOfWeek(date, 1))?.cardioMin).toBe(0);
  });

  it('считает серию дней по порогу 80% выполнения', async () => {
    for (let i = 1; i <= 3; i += 1) {
      const date = addDays(today(), -i);
      // Past days are not created by viewing them, so fill them in explicitly.
      await materializeDay(ctx.db, date);
      const view = await getDayView(ctx.db, date);
      // Tick the meals and the supplements but not the workout: that clears
      // the 80% bar while leaving one item undone.
      for (const meal of view.meals) {
        await ctx.db.update(t.mealLog).set({ completed: true }).where(eq(t.mealLog.id, meal.id));
      }
      for (const item of view.supplements) {
        await ctx.db
          .update(t.supplementLog)
          .set({ taken: true })
          .where(eq(t.supplementLog.id, item.id));
      }
    }

    const overview = await getMetricsOverview(ctx.db, addDays(today(), -30), today());
    expect(overview.kpi.streakDays).toBe(3);
  });

  it('отдаёт дельту веса за 30 дней', async () => {
    await ctx.db.insert(t.measurement).values([
      { date: addDays(today(), -40), weightKg: 85 },
      { date: today(), weightKg: 82 },
    ]);

    const overview = await getMetricsOverview(ctx.db, addDays(today(), -60), today());
    expect(overview.kpi.currentWeightKg).toBe(82);
    expect(overview.kpi.weightDelta30).toBe(-3);
  });
});
