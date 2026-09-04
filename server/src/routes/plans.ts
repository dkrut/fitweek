import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { planInput, replaceEntriesInput } from '@shared/index.js';
import * as t from '../db/schema.js';
import { conflict, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';

export async function registerPlanRoutes(app: FastifyInstance): Promise<void> {
  app.get('/plans', async (request) =>
    request.db.select().from(t.plan).orderBy(asc(t.plan.createdAt)),
  );

  app.get('/plans/active', async (request) => {
    const plans = await request.db.select().from(t.plan).where(eq(t.plan.isActive, true));
    const plan = plans[0];
    if (!plan) return null;
    const entries = await request.db
      .select()
      .from(t.planEntry)
      .where(eq(t.planEntry.planId, plan.id))
      .orderBy(asc(t.planEntry.weekday), asc(t.planEntry.position), asc(t.planEntry.id));
    return { ...plan, entries };
  });

  app.get('/plans/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const plans = await request.db.select().from(t.plan).where(eq(t.plan.id, id));
    const plan = plans[0];
    if (!plan) throw notFound('План не найден');
    const entries = await request.db
      .select()
      .from(t.planEntry)
      .where(eq(t.planEntry.planId, id))
      .orderBy(asc(t.planEntry.weekday), asc(t.planEntry.position), asc(t.planEntry.id));
    return { ...plan, entries };
  });

  app.post('/plans', async (request, reply) => {
    const body = parse(planInput, request.body);
    const existing = await request.db.select({ id: t.plan.id }).from(t.plan);
    const inserted = await request.db
      .insert(t.plan)
      .values({ ...body, isActive: existing.length === 0 })
      .returning();
    reply.code(201);
    return inserted[0];
  });

  app.patch('/plans/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(planInput.partial(), request.body);
    const updated = await request.db
      .update(t.plan)
      .set(body)
      .where(eq(t.plan.id, id))
      .returning();
    if (!updated[0]) throw notFound('План не найден');
    return updated[0];
  });

  /**
   * Activating another plan leaves materialised days alone: the past stays as
   * it was lived, and the new plan takes effect from the nearest day that has
   * not been opened yet.
   */
  app.post('/plans/:id/activate', async (request) => {
    const { id } = parse(idParam, request.params);
    const plans = await request.db.select().from(t.plan).where(eq(t.plan.id, id));
    if (!plans[0]) throw notFound('План не найден');

    await request.db.transaction(async (tx) => {
      await tx.update(t.plan).set({ isActive: false });
      await tx.update(t.plan).set({ isActive: true }).where(eq(t.plan.id, id));
    });

    return { ok: true };
  });

  app.put('/plans/:id/entries', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(replaceEntriesInput, request.body);

    const plans = await request.db.select({ id: t.plan.id }).from(t.plan).where(eq(t.plan.id, id));
    if (!plans[0]) throw notFound('План не найден');

    await request.db.transaction(async (tx) => {
      await tx.delete(t.planEntry).where(eq(t.planEntry.planId, id));
      if (body.entries.length > 0) {
        await tx
          .insert(t.planEntry)
          .values(body.entries.map((entry) => ({ ...entry, planId: id })));
      }
    });

    const entries = await request.db
      .select()
      .from(t.planEntry)
      .where(eq(t.planEntry.planId, id))
      .orderBy(asc(t.planEntry.weekday), asc(t.planEntry.position), asc(t.planEntry.id));
    return entries;
  });

  app.delete('/plans/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const plans = await request.db.select().from(t.plan).where(eq(t.plan.id, id));
    const plan = plans[0];
    if (!plan) throw notFound('План не найден');
    if (plan.isActive) throw conflict('Нельзя удалить активный план — сначала активируйте другой');
    await request.db.delete(t.plan).where(eq(t.plan.id, id));
    return { ok: true };
  });
}
