import { and, asc, desc, eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  dayNotesPatch,
  mealLogCreate,
  mealLogPatch,
  setLogCreate,
  setLogPatch,
  supplementLogPatch,
  workoutLogPatch,
  workoutStartInput,
  type WorkoutKind,
} from '@shared/index.js';
import * as t from '../db/schema.js';
import { badRequest, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { isFuture } from '../lib/date.js';
import {
  assertDate,
  getDaySummaries,
  getDayView,
  loadTemplateExercises,
  materializeDay,
} from '../services/day.js';

const rangeQuery = z.object({ from: z.string(), to: z.string() });
const dateParams = z.object({ date: z.string() });

/**
 * Edits apply only to a materialised day. Future dates exist as a projection
 * of the plan and their rows have no ids, so there is nothing to change.
 */
function assertEditable(date: string): void {
  if (isFuture(date)) {
    throw badRequest('Нельзя отмечать выполнение для будущей даты');
  }
}

export async function registerDayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/days', async (request) => {
    const query = parse(rangeQuery, request.query);
    return getDaySummaries(request.db, assertDate(query.from), assertDate(query.to));
  });

  app.get('/days/:date', async (request) => {
    const { date } = parse(dateParams, request.params);
    return getDayView(request.db, assertDate(date));
  });

  /**
   * Explicitly creates the journal for a past date. Viewing a date writes
   * nothing on its own (today aside), so filling in a missed day is a
   * deliberate action rather than a side effect of paging the calendar.
   */
  app.post('/days/:date/materialize', async (request) => {
    const { date } = parse(dateParams, request.params);
    assertDate(date);
    assertEditable(date);
    await materializeDay(request.db, date);
    return getDayView(request.db, date);
  });

  app.patch('/days/:date/notes', async (request) => {
    const { date } = parse(dateParams, request.params);
    assertDate(date);
    assertEditable(date);
    const body = parse(dayNotesPatch, request.body);
    await materializeDay(request.db, date);
    await request.db.update(t.dayLog).set({ notes: body.notes }).where(eq(t.dayLog.date, date));
    return getDayView(request.db, date);
  });

  /* --------------------------------- Meals -------------------------------- */

  app.post('/days/:date/meals', async (request, reply) => {
    const { date } = parse(dateParams, request.params);
    assertDate(date);
    assertEditable(date);
    const body = parse(mealLogCreate, request.body);
    await materializeDay(request.db, date);

    // Everything added through this route is eaten on top of the plan: the
    // planned rows of a day come from materializeDay, not from here.
    let name = body.name ?? '';
    let kcal = body.kcal ?? 0;
    let proteinG = body.proteinG ?? 0;
    let fatG = body.fatG ?? 0;
    let carbsG = body.carbsG ?? 0;
    let portion = body.portion ?? '';
    let recipe = '';

    if (body.dishId !== null) {
      const dishes = await request.db.select().from(t.dish).where(eq(t.dish.id, body.dishId));
      const dish = dishes[0];
      if (!dish) throw notFound('Блюдо не найдено');
      // Catalogue values are copied as a snapshot; see the note in the schema.
      name = body.name ?? dish.name;
      kcal = body.kcal ?? dish.kcal;
      proteinG = body.proteinG ?? dish.proteinG;
      fatG = body.fatG ?? dish.fatG;
      carbsG = body.carbsG ?? dish.carbsG;
      portion = body.portion ?? dish.portion;
      recipe = dish.recipe;
    }

    if (!name) throw badRequest('Укажите блюдо или название');

    let slotName = '';
    let timeHint = '';
    if (body.mealSlotId !== null) {
      const slots = await request.db
        .select()
        .from(t.mealSlot)
        .where(eq(t.mealSlot.id, body.mealSlotId));
      const slot = slots[0];
      if (!slot) throw notFound('Слот не найден');
      slotName = slot.name;
      timeHint = slot.timeHint;
    }

    const positions = await request.db
      .select({ value: max(t.mealLog.position) })
      .from(t.mealLog)
      .where(eq(t.mealLog.date, date));
    const nextPosition = (positions[0]?.value ?? -1) + 1;

    const inserted = await request.db
      .insert(t.mealLog)
      .values({
        date,
        mealSlotId: body.mealSlotId,
        mealSlotName: slotName,
        timeHint,
        dishId: body.dishId,
        name,
        kcal,
        proteinG,
        fatG,
        carbsG,
        portion,
        recipe,
        completed: false,
        planned: false,
        position: nextPosition,
      })
      .returning();

    reply.code(201);
    return inserted[0];
  });

  app.patch('/meal-logs/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(mealLogPatch, request.body);

    const existing = await request.db.select().from(t.mealLog).where(eq(t.mealLog.id, id));
    const meal = existing[0];
    if (!meal) throw notFound('Запись не найдена');

    const patch: Partial<typeof t.mealLog.$inferInsert> = { ...body };

    // Swapping the dish carries its macros over unless explicit values came in.
    if (body.dishId !== undefined && body.dishId !== null) {
      const dishes = await request.db.select().from(t.dish).where(eq(t.dish.id, body.dishId));
      const dish = dishes[0];
      if (!dish) throw notFound('Блюдо не найдено');
      patch.name = body.name ?? dish.name;
      patch.kcal = body.kcal ?? dish.kcal;
      patch.proteinG = body.proteinG ?? dish.proteinG;
      patch.fatG = body.fatG ?? dish.fatG;
      patch.carbsG = body.carbsG ?? dish.carbsG;
      patch.portion = dish.portion;
      patch.recipe = dish.recipe;
    }

    const updated = await request.db
      .update(t.mealLog)
      .set(patch)
      .where(eq(t.mealLog.id, id))
      .returning();
    return updated[0];
  });

  app.delete('/meal-logs/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const deleted = await request.db.delete(t.mealLog).where(eq(t.mealLog.id, id)).returning();
    if (!deleted[0]) throw notFound('Запись не найдена');
    return { ok: true };
  });

  /* -------------------------------- Workout ------------------------------- */

  app.post('/days/:date/workout', async (request) => {
    const { date } = parse(dateParams, request.params);
    assertDate(date);
    assertEditable(date);
    const body = parse(workoutStartInput, request.body);
    await materializeDay(request.db, date);

    const templates = await request.db
      .select()
      .from(t.workoutTemplate)
      .where(eq(t.workoutTemplate.id, body.templateId));
    const template = templates[0];
    if (!template) throw notFound('Шаблон тренировки не найден');

    const planned = await loadTemplateExercises(request.db, template.id);
    const values = {
      date,
      templateId: template.id,
      name: template.name,
      kind: template.kind as WorkoutKind,
      status: 'planned' as const,
      warmup: template.warmup,
      cooldown: template.cooldown,
      plannedJson: JSON.stringify(planned),
    };

    const existing = await request.db
      .select({ id: t.workoutLog.id })
      .from(t.workoutLog)
      .where(eq(t.workoutLog.date, date));

    if (existing[0]) {
      // Switching the template mid-session would wipe the recorded sets.
      const sets = await request.db
        .select({ id: t.setLog.id })
        .from(t.setLog)
        .where(eq(t.setLog.workoutLogId, existing[0].id))
        .limit(1);
      if (sets.length > 0) {
        throw badRequest('В тренировке уже есть подходы — сначала удалите их');
      }
      await request.db.update(t.workoutLog).set(values).where(eq(t.workoutLog.id, existing[0].id));
    } else {
      await request.db.insert(t.workoutLog).values(values);
    }

    return getDayView(request.db, date);
  });

  app.patch('/workout-logs/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(workoutLogPatch, request.body);
    const updated = await request.db
      .update(t.workoutLog)
      .set(body)
      .where(eq(t.workoutLog.id, id))
      .returning();
    if (!updated[0]) throw notFound('Тренировка не найдена');
    return updated[0];
  });

  /* ---------------------------------- Sets -------------------------------- */

  app.post('/workout-logs/:id/sets', async (request, reply) => {
    const { id } = parse(idParam, request.params);
    const body = parse(setLogCreate, request.body);

    const workouts = await request.db
      .select({ id: t.workoutLog.id })
      .from(t.workoutLog)
      .where(eq(t.workoutLog.id, id));
    if (!workouts[0]) throw notFound('Тренировка не найдена');

    const exercises = await request.db
      .select({ id: t.exercise.id })
      .from(t.exercise)
      .where(eq(t.exercise.id, body.exerciseId));
    if (!exercises[0]) throw notFound('Упражнение не найдено');

    let setIndex = body.setIndex;
    if (setIndex === undefined) {
      const last = await request.db
        .select({ value: max(t.setLog.setIndex) })
        .from(t.setLog)
        .where(and(eq(t.setLog.workoutLogId, id), eq(t.setLog.exerciseId, body.exerciseId)));
      setIndex = (last[0]?.value ?? -1) + 1;
    }

    const inserted = await request.db
      .insert(t.setLog)
      .values({ ...body, setIndex, workoutLogId: id })
      .returning();

    reply.code(201);
    return inserted[0];
  });

  app.patch('/set-logs/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(setLogPatch, request.body);
    const updated = await request.db
      .update(t.setLog)
      .set(body)
      .where(eq(t.setLog.id, id))
      .returning();
    if (!updated[0]) throw notFound('Подход не найден');
    return updated[0];
  });

  app.delete('/set-logs/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const deleted = await request.db.delete(t.setLog).where(eq(t.setLog.id, id)).returning();
    if (!deleted[0]) throw notFound('Подход не найден');
    return { ok: true };
  });

  /** The last session containing this exercise: what was done last time. */
  app.get('/exercises/:id/last-session', async (request) => {
    const { id } = parse(idParam, request.params);
    const rows = await request.db
      .select({ date: t.workoutLog.date, workoutLogId: t.workoutLog.id })
      .from(t.setLog)
      .innerJoin(t.workoutLog, eq(t.workoutLog.id, t.setLog.workoutLogId))
      .where(eq(t.setLog.exerciseId, id))
      .orderBy(desc(t.workoutLog.date))
      .limit(1);

    const last = rows[0];
    if (!last) return { date: null, sets: [] };

    const sets = await request.db
      .select()
      .from(t.setLog)
      .where(and(eq(t.setLog.workoutLogId, last.workoutLogId), eq(t.setLog.exerciseId, id)))
      .orderBy(asc(t.setLog.setIndex));

    return { date: last.date, sets };
  });

  /* ------------------------------- Supplements ---------------------------- */

  /**
   * Marks a supplement as taken. The id belongs to the journal row, not to the
   * catalogue: the plan decides which supplements belong to a day, and those
   * rows are created when the day is materialised.
   */
  app.patch('/supplement-logs/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(supplementLogPatch, request.body);

    const updated = await request.db
      .update(t.supplementLog)
      .set({ taken: body.taken })
      .where(eq(t.supplementLog.id, id))
      .returning();

    if (!updated[0]) throw notFound('Запись о добавке не найдена');
    return updated[0];
  });
}
