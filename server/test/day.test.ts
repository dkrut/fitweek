import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../src/db/schema.js';
import { addDays, startOfWeek, today } from '../src/lib/date.js';
import { getDaySummaries, getDayView, materializeDay } from '../src/services/day.js';
import { createTestContext, type TestContext } from './helpers.js';
import { WEEK } from './fixtures.js';

/** How many meals the plan holds for that weekday. */
function mealsOn(date: string): number {
  const weekday = new Date(date + 'T00:00:00').getDay();
  return WEEK.find((day) => day.weekday === weekday)!.meals.length;
}

describe('материализация дня', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('создаёт строки журнала из активного плана', async () => {
    const view = await getDayView(ctx.db, today());

    expect(view.materialized).toBe(true);
    expect(view.meals).toHaveLength(mealsOn(today()));
    expect(view.workout).not.toBeNull();
    expect(view.supplements.length).toBeGreaterThan(0);
    // The items of a day are meals, the workout and supplements: all tickable.
    expect(view.totals.itemsTotal).toBe(
      view.meals.length + 1 + view.supplements.length,
    );
    expect(view.totals.itemsDone).toBe(0);
  });

  it('идемпотентна — повторный вызов не плодит дубли', async () => {
    const date = today();
    await materializeDay(ctx.db, date);
    await materializeDay(ctx.db, date);
    await materializeDay(ctx.db, date);

    const meals = await ctx.db.select().from(t.mealLog).where(eq(t.mealLog.date, date));
    const workouts = await ctx.db.select().from(t.workoutLog).where(eq(t.workoutLog.date, date));

    expect(meals).toHaveLength(mealsOn(date));
    expect(workouts).toHaveLength(1);
  });

  it('не пишет в базу для будущей даты, но показывает проекцию плана', async () => {
    const future = addDays(today(), 7);
    const view = await getDayView(ctx.db, future);

    expect(view.materialized).toBe(false);
    expect(view.meals.length).toBeGreaterThan(0);
    // Virtual rows carry negative ids and cannot be edited.
    expect(view.meals.every((meal) => meal.id < 0)).toBe(true);

    const rows = await ctx.db.select().from(t.dayLog).where(eq(t.dayLog.date, future));
    expect(rows).toHaveLength(0);
  });

  it('смена активного плана не меняет уже материализованный день', async () => {
    const date = today();
    const before = await getDayView(ctx.db, date);
    const originalNames = before.meals.map((meal) => meal.name);

    const created = await ctx.db
      .insert(t.plan)
      .values({ name: 'Пустой план', isActive: false })
      .returning();
    await ctx.db.update(t.plan).set({ isActive: false });
    await ctx.db.update(t.plan).set({ isActive: true }).where(eq(t.plan.id, created[0]!.id));

    const after = await getDayView(ctx.db, date);
    expect(after.meals.map((meal) => meal.name)).toEqual(originalNames);
  });

  it('прошлую дату показывает проекцией, пока её явно не заполнили', async () => {
    const past = addDays(today(), -3);

    const projected = await getDayView(ctx.db, past);
    expect(projected.materialized).toBe(false);
    expect(projected.meals.every((meal) => meal.id < 0)).toBe(true);
    expect(await ctx.db.select().from(t.dayLog).where(eq(t.dayLog.date, past))).toHaveLength(0);

    await materializeDay(ctx.db, past);

    const filled = await getDayView(ctx.db, past);
    expect(filled.materialized).toBe(true);
    expect(filled.meals.every((meal) => meal.id > 0)).toBe(true);
  });

  it('недельная сводка не создаёт дни, которых пользователь не проживал', async () => {
    const from = addDays(today(), -10);
    const to = addDays(today(), -4);

    const summaries = await getDaySummaries(ctx.db, from, to);
    expect(summaries).toHaveLength(7);
    // The plan is visible, nothing is done and nothing is stored.
    expect(summaries.every((day) => !day.materialized)).toBe(true);
    expect(summaries.every((day) => day.itemsTotal > 0 && day.itemsDone === 0)).toBe(true);

    const rows = await ctx.db.select().from(t.dayLog);
    expect(rows.map((row) => row.date)).not.toContain(from);
  });

  it('правка блюда не переписывает историю задним числом', async () => {
    const yesterday = addDays(today(), -1);
    await materializeDay(ctx.db, yesterday);
    const before = await getDayView(ctx.db, yesterday);
    const breakfast = before.meals[0]!;
    const originalKcal = breakfast.kcal;

    await ctx.db
      .update(t.dish)
      .set({ kcal: originalKcal + 500 })
      .where(eq(t.dish.id, breakfast.dishId!));

    const after = await getDayView(ctx.db, yesterday);
    expect(after.meals[0]!.kcal).toBe(originalKcal);

    // Tomorrow, still unopened, picks up the new value instead.
    const tomorrow = await getDayView(ctx.db, addDays(today(), 1));
    expect(tomorrow.meals[0]!.kcal).toBe(originalKcal + 500);
  });

  it('считает суммы дня только по отмеченным приёмам пищи', async () => {
    const date = today();
    const view = await getDayView(ctx.db, date);
    const first = view.meals[0]!;

    expect(view.totals.kcal).toBe(0);
    expect(view.totals.plannedKcal).toBeGreaterThan(0);

    await ctx.db.update(t.mealLog).set({ completed: true }).where(eq(t.mealLog.id, first.id));

    const updated = await getDayView(ctx.db, date);
    expect(updated.totals.kcal).toBe(first.kcal);
    expect(updated.totals.proteinG).toBe(first.proteinG);
    expect(updated.totals.itemsDone).toBe(1);
    expect(updated.totals.completionPct).toBe(
      Math.round((1 / updated.totals.itemsTotal) * 100),
    );
  });

  it('берёт добавки из плана дня, а не все активные подряд', async () => {
    // Monday is a strength day with creatine and protein; Tuesday has only creatine.
    const monday = addDays(startOfWeek(today(), 1), 0);
    await materializeDay(ctx.db, monday);
    const strengthDay = await getDayView(ctx.db, monday);

    // Tuesday is cardio: the plan holds no protein.
    const tuesday = addDays(monday, 1);
    await materializeDay(ctx.db, tuesday);
    const cardioDay = await getDayView(ctx.db, tuesday);

    expect(strengthDay.supplements).toHaveLength(2);
    expect(cardioDay.supplements).toHaveLength(1);
    expect(strengthDay.supplements.map((s) => s.name)).toContain('Протеин');
    expect(cardioDay.supplements.map((s) => s.name)).not.toContain('Протеин');
  });

  it('сохраняет название добавки снимком — удаление не стирает историю', async () => {
    const date = today();
    await materializeDay(ctx.db, date);
    const before = await getDayView(ctx.db, date);
    const item = before.supplements[0]!;

    await ctx.db.delete(t.supplement).where(eq(t.supplement.id, item.supplementId!));

    const after = await getDayView(ctx.db, date);
    const kept = after.supplements.find((s) => s.id === item.id);
    expect(kept?.name).toBe(item.name);
    expect(kept?.supplementId).toBeNull();
  });

  it('цель дня равна плановым суммам этого дня, а не общему числу', async () => {
    // Monday and Saturday differ in which dishes the plan holds.
    const monday = startOfWeek(today(), 1);
    const saturday = addDays(monday, 5);
    await materializeDay(ctx.db, monday);
    await materializeDay(ctx.db, saturday);

    const mon = await getDayView(ctx.db, monday);
    const sat = await getDayView(ctx.db, saturday);

    const sum = (view: typeof mon, key: 'kcal' | 'proteinG') =>
      Math.round(view.meals.reduce((acc, meal) => acc + meal[key], 0) * 10) / 10;

    expect(mon.totals.plannedKcal).toBe(sum(mon, 'kcal'));
    expect(mon.totals.plannedProteinG).toBe(sum(mon, 'proteinG'));
    expect(sat.totals.plannedKcal).toBe(sum(sat, 'kcal'));
    // The days differ, so each one really does carry its own target.
    expect(mon.totals.plannedKcal).not.toBe(sat.totals.plannedKcal);
  });

  it('отмеченная добавка идёт в «выполнено за день»', async () => {
    const date = today();
    const before = await getDayView(ctx.db, date);
    const item = before.supplements[0]!;

    expect(before.totals.itemsDone).toBe(0);

    await ctx.db
      .update(t.supplementLog)
      .set({ taken: true })
      .where(eq(t.supplementLog.id, item.id));

    const after = await getDayView(ctx.db, date);
    expect(after.totals.itemsDone).toBe(1);
    expect(after.totals.itemsTotal).toBe(before.totals.itemsTotal);
  });

  it('тип упражнения берёт из справочника, даже если в снимке его нет', async () => {
    // Find a day the plan marks as cardio: walking should ask for time,
    // not for weight and reps.
    let date = today();
    let view = await getDayView(ctx.db, date);
    for (let i = 0; i < 7 && view.workout?.kind !== 'cardio'; i += 1) {
      date = addDays(today(), -i - 1);
      await materializeDay(ctx.db, date);
      view = await getDayView(ctx.db, date);
    }
    expect(view.workout?.kind).toBe('cardio');
    await materializeDay(ctx.db, date);

    // Strip the exercise type from the snapshot; it is not required there.
    const stored = await ctx.db.select().from(t.workoutLog).where(eq(t.workoutLog.date, date));
    const planned = JSON.parse(stored[0]!.plannedJson) as Record<string, unknown>[];
    expect(planned.length).toBeGreaterThan(0);
    await ctx.db
      .update(t.workoutLog)
      .set({
        plannedJson: JSON.stringify(
          planned.map(({ exerciseCategory: _drop, ...rest }) => rest),
        ),
      })
      .where(eq(t.workoutLog.id, stored[0]!.id));

    const after = await getDayView(ctx.db, date);
    expect(after.workout?.planned.map((item) => item.exerciseCategory)).toEqual(
      planned.map((item) => item.exerciseCategory),
    );
    expect(after.workout?.planned.every((item) => item.exerciseCategory === 'cardio')).toBe(true);
  });

  /*
   * The point of the flag: what you ate over the plan is eaten, but the norm
   * of the day stays where the plan put it. Otherwise every extra snack would
   * raise the target by its own calories and the day would always look kept.
   */
  it('съеденное сверх плана не поднимает норму дня', async () => {
    const date = today();
    const before = await getDayView(ctx.db, date);

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/days/${date}/meals`,
      headers: { cookie: ctx.cookie },
      payload: { name: 'Печенье', kcal: 300, proteinG: 3, fatG: 14, carbsG: 40 },
    });
    expect(response.statusCode).toBe(201);

    const after = await getDayView(ctx.db, date);
    const extra = after.meals.find((meal) => meal.name === 'Печенье');

    expect(extra?.planned).toBe(false);
    expect(after.meals).toHaveLength(before.meals.length + 1);

    // The plan of the day is untouched by it, and so is the tick counter.
    expect(after.totals.plannedKcal).toBe(before.totals.plannedKcal);
    expect(after.totals.plannedProteinG).toBe(before.totals.plannedProteinG);
    expect(after.totals.plannedFatG).toBe(before.totals.plannedFatG);
    expect(after.totals.plannedCarbsG).toBe(before.totals.plannedCarbsG);
    expect(after.totals.itemsTotal).toBe(before.totals.itemsTotal);

    // Ticked, it counts as eaten — over the norm, which is the whole idea.
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/meal-logs/${extra!.id}`,
      headers: { cookie: ctx.cookie },
      payload: { completed: true },
    });

    const eaten = await getDayView(ctx.db, date);
    expect(eaten.totals.kcal).toBe(300);
    expect(eaten.totals.plannedKcal).toBe(before.totals.plannedKcal);
    // A meal outside the plan is nothing to tick off the plan.
    expect(eaten.totals.itemsDone).toBe(0);
    expect(eaten.totals.completionPct).toBe(0);
  });

  it('отвергает некорректную дату', async () => {
    await expect(getDayView(ctx.db, '2026-02-30')).rejects.toThrow(/Некорректная дата/);
    await expect(getDayView(ctx.db, 'не-дата')).rejects.toThrow(/Некорректная дата/);
  });
});
