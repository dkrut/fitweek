import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  dishInput,
  exerciseInput,
  mealSlotInput,
  supplementInput,
  workoutTemplateInput,
  type WorkoutTemplate,
} from '@shared/index.js';
import * as t from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import type { Database } from '../db/client.js';

const listQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

async function loadTemplate(db: Database, id: number): Promise<WorkoutTemplate> {
  const rows = await db.select().from(t.workoutTemplate).where(eq(t.workoutTemplate.id, id));
  const template = rows[0];
  if (!template) throw notFound('Шаблон тренировки не найден');

  const exercises = await db
    .select({
      id: t.workoutTemplateExercise.id,
      templateId: t.workoutTemplateExercise.templateId,
      exerciseId: t.workoutTemplateExercise.exerciseId,
      exerciseName: t.exercise.name,
      exerciseCategory: t.exercise.category,
      muscleGroup: t.exercise.muscleGroup,
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
    .where(eq(t.workoutTemplateExercise.templateId, id))
    .orderBy(asc(t.workoutTemplateExercise.position), asc(t.workoutTemplateExercise.id));

  return { ...template, exercises } as WorkoutTemplate;
}

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  /* -------------------------------- Dishes -------------------------------- */

  app.get('/dishes', async (request) => {
    const query = parse(listQuery, request.query);
    return request.db
      .select()
      .from(t.dish)
      .where(query.includeArchived ? undefined : isNull(t.dish.archivedAt))
      .orderBy(asc(t.dish.category), asc(t.dish.name));
  });

  app.post('/dishes', async (request, reply) => {
    const body = parse(dishInput, request.body);
    const inserted = await request.db.insert(t.dish).values(body).returning();
    reply.code(201);
    return inserted[0];
  });

  app.patch('/dishes/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(dishInput.partial(), request.body);
    const updated = await request.db
      .update(t.dish)
      .set(body)
      .where(eq(t.dish.id, id))
      .returning();
    if (!updated[0]) throw notFound('Блюдо не найдено');
    return updated[0];
  });

  /**
   * A dish is archived rather than deleted: journal rows from earlier months
   * may still point at it, and there is no reason to lose that link.
   */
  app.delete('/dishes/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const updated = await request.db
      .update(t.dish)
      .set({ archivedAt: new Date().toISOString() })
      .where(eq(t.dish.id, id))
      .returning();
    if (!updated[0]) throw notFound('Блюдо не найдено');
    return { ok: true };
  });

  app.post('/dishes/:id/restore', async (request) => {
    const { id } = parse(idParam, request.params);
    const updated = await request.db
      .update(t.dish)
      .set({ archivedAt: null })
      .where(eq(t.dish.id, id))
      .returning();
    if (!updated[0]) throw notFound('Блюдо не найдено');
    return updated[0];
  });

  /* ------------------------------- Exercises ------------------------------ */

  app.get('/exercises', async (request) => {
    const query = parse(listQuery, request.query);
    return request.db
      .select()
      .from(t.exercise)
      .where(query.includeArchived ? undefined : isNull(t.exercise.archivedAt))
      .orderBy(asc(t.exercise.category), asc(t.exercise.name));
  });

  app.post('/exercises', async (request, reply) => {
    const body = parse(exerciseInput, request.body);
    const inserted = await request.db.insert(t.exercise).values(body).returning();
    reply.code(201);
    return inserted[0];
  });

  app.patch('/exercises/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(exerciseInput.partial(), request.body);
    const updated = await request.db
      .update(t.exercise)
      .set(body)
      .where(eq(t.exercise.id, id))
      .returning();
    if (!updated[0]) throw notFound('Упражнение не найдено');
    return updated[0];
  });

  app.delete('/exercises/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const updated = await request.db
      .update(t.exercise)
      .set({ archivedAt: new Date().toISOString() })
      .where(eq(t.exercise.id, id))
      .returning();
    if (!updated[0]) throw notFound('Упражнение не найдено');
    return { ok: true };
  });

  app.post('/exercises/:id/restore', async (request) => {
    const { id } = parse(idParam, request.params);
    const updated = await request.db
      .update(t.exercise)
      .set({ archivedAt: null })
      .where(eq(t.exercise.id, id))
      .returning();
    if (!updated[0]) throw notFound('Упражнение не найдено');
    return updated[0];
  });

  /* ---------------------------- Workout templates ------------------------- */

  app.get('/workout-templates', async (request) => {
    const query = parse(listQuery, request.query);
    const templates = await request.db
      .select()
      .from(t.workoutTemplate)
      .where(query.includeArchived ? undefined : isNull(t.workoutTemplate.archivedAt))
      .orderBy(asc(t.workoutTemplate.name));

    return Promise.all(templates.map((template) => loadTemplate(request.db, template.id)));
  });

  app.get('/workout-templates/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    return loadTemplate(request.db, id);
  });

  app.post('/workout-templates', async (request, reply) => {
    const body = parse(workoutTemplateInput, request.body);
    const { exercises, ...template } = body;

    const created = await request.db.transaction(async (tx) => {
      const inserted = await tx.insert(t.workoutTemplate).values(template).returning();
      const row = inserted[0];
      if (!row) throw new Error('Не удалось создать шаблон');
      if (exercises.length > 0) {
        await tx.insert(t.workoutTemplateExercise).values(
          exercises.map((exercise, index) => ({
            ...exercise,
            templateId: row.id,
            position: exercise.position || index,
          })),
        );
      }
      return row;
    });

    reply.code(201);
    return loadTemplate(request.db, created.id);
  });

  app.put('/workout-templates/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(workoutTemplateInput, request.body);
    const { exercises, ...template } = body;

    await request.db.transaction(async (tx) => {
      const updated = await tx
        .update(t.workoutTemplate)
        .set(template)
        .where(eq(t.workoutTemplate.id, id))
        .returning();
      if (!updated[0]) throw notFound('Шаблон тренировки не найден');

      await tx
        .delete(t.workoutTemplateExercise)
        .where(eq(t.workoutTemplateExercise.templateId, id));

      if (exercises.length > 0) {
        await tx.insert(t.workoutTemplateExercise).values(
          exercises.map((exercise, index) => ({
            ...exercise,
            templateId: id,
            position: exercise.position || index,
          })),
        );
      }
    });

    return loadTemplate(request.db, id);
  });

  app.delete('/workout-templates/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const updated = await request.db
      .update(t.workoutTemplate)
      .set({ archivedAt: new Date().toISOString() })
      .where(eq(t.workoutTemplate.id, id))
      .returning();
    if (!updated[0]) throw notFound('Шаблон тренировки не найден');
    return { ok: true };
  });

  /* -------------------------------- Meal slots ---------------------------- */

  app.get('/meal-slots', async (request) =>
    request.db.select().from(t.mealSlot).orderBy(asc(t.mealSlot.position), asc(t.mealSlot.id)),
  );

  app.post('/meal-slots', async (request, reply) => {
    const body = parse(mealSlotInput, request.body);
    const inserted = await request.db.insert(t.mealSlot).values(body).returning();
    reply.code(201);
    return inserted[0];
  });

  app.patch('/meal-slots/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(mealSlotInput.partial(), request.body);
    const updated = await request.db
      .update(t.mealSlot)
      .set(body)
      .where(eq(t.mealSlot.id, id))
      .returning();
    if (!updated[0]) throw notFound('Слот не найден');
    return updated[0];
  });

  app.delete('/meal-slots/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const used = await request.db
      .select({ id: t.planEntry.id })
      .from(t.planEntry)
      .where(and(eq(t.planEntry.mealSlotId, id)))
      .limit(1);
    if (used.length > 0) {
      throw conflict('Слот используется в плане — сначала уберите его из недели');
    }
    await request.db.delete(t.mealSlot).where(eq(t.mealSlot.id, id));
    return { ok: true };
  });

  /* ------------------------------- Supplements ---------------------------- */

  app.get('/supplements', async (request) =>
    request.db
      .select()
      .from(t.supplement)
      .orderBy(asc(t.supplement.position), asc(t.supplement.id)),
  );

  app.post('/supplements', async (request, reply) => {
    const body = parse(supplementInput, request.body);
    const inserted = await request.db.insert(t.supplement).values(body).returning();
    reply.code(201);
    return inserted[0];
  });

  app.patch('/supplements/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(supplementInput.partial(), request.body);
    const updated = await request.db
      .update(t.supplement)
      .set(body)
      .where(eq(t.supplement.id, id))
      .returning();
    if (!updated[0]) throw notFound('Добавка не найдена');
    return updated[0];
  });

  app.delete('/supplements/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    await request.db.delete(t.supplement).where(eq(t.supplement.id, id));
    return { ok: true };
  });
}
