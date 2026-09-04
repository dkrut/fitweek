import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as t from '../db/schema.js';
import { badRequest } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { addDays, today } from '../lib/date.js';
import { assertDate } from '../services/day.js';
import { getExerciseProgress, getMetricsOverview } from '../services/metrics.js';

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Defaults to the last 90 days: enough for the weight trend to be readable. */
function resolveRange(query: { from?: string | undefined; to?: string | undefined }) {
  const to = query.to ? assertDate(query.to) : today();
  const from = query.from ? assertDate(query.from) : addDays(to, -89);
  if (from > to) throw badRequest('Начало диапазона позже конца');
  return { from, to };
}

export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics/overview', async (request) => {
    const { from, to } = resolveRange(parse(rangeQuery, request.query));
    return getMetricsOverview(request.db, from, to);
  });

  /** Exercises that have recorded sets, for the chart selector. */
  app.get('/metrics/exercises', async (request) =>
    request.db
      .selectDistinct({
        id: t.exercise.id,
        name: t.exercise.name,
        category: t.exercise.category,
        muscleGroup: t.exercise.muscleGroup,
      })
      .from(t.setLog)
      .innerJoin(t.exercise, eq(t.exercise.id, t.setLog.exerciseId))
      .orderBy(asc(t.exercise.name)),
  );

  app.get('/metrics/exercises/:id', async (request) => {
    const { id } = parse(idParam, request.params);
    const { from, to } = resolveRange(parse(rangeQuery, request.query));
    return getExerciseProgress(request.db, id, from, to);
  });
}
