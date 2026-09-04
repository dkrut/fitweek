import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { measurementInput, measurementPatch } from '@shared/index.js';
import * as t from '../db/schema.js';
import { notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { assertDate } from '../services/day.js';

const rangeQuery = z.object({ from: z.string().optional(), to: z.string().optional() });

export async function registerMeasurementRoutes(app: FastifyInstance): Promise<void> {
  app.get('/measurements', async (request) => {
    const query = parse(rangeQuery, request.query);
    const conditions = [];
    if (query.from) conditions.push(gte(t.measurement.date, assertDate(query.from)));
    if (query.to) conditions.push(lte(t.measurement.date, assertDate(query.to)));

    return request.db
      .select()
      .from(t.measurement)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(t.measurement.date));
  });

  /**
   * One measurement per date: saving again for the same day updates the row
   * instead of duplicating it, or the chart would break on several points.
   */
  app.post('/measurements', async (request, reply) => {
    const body = parse(measurementInput, request.body);
    assertDate(body.date);

    const existing = await request.db
      .select()
      .from(t.measurement)
      .where(eq(t.measurement.date, body.date));

    if (existing[0]) {
      const updated = await request.db
        .update(t.measurement)
        .set(body)
        .where(eq(t.measurement.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const inserted = await request.db.insert(t.measurement).values(body).returning();
    reply.code(201);
    return inserted[0];
  });

  app.patch('/measurements/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const body = parse(measurementPatch, request.body);
    const updated = await request.db
      .update(t.measurement)
      .set(body)
      .where(eq(t.measurement.id, id))
      .returning();
    if (!updated[0]) throw notFound('Замер не найден');
    return updated[0];
  });

  app.delete('/measurements/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const deleted = await request.db
      .delete(t.measurement)
      .where(eq(t.measurement.id, id))
      .returning();
    if (!deleted[0]) throw notFound('Замер не найден');
    return { ok: true };
  });
}
