import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as t from '../db/schema.js';
import { parse } from '../lib/validate.js';
import { today } from '../lib/date.js';
import type { Database } from '../db/client.js';

const EXPORT_VERSION = 1;

/** Order matters: on restore, parent tables are filled first. */
const TABLES = [
  ['settings', t.settings],
  ['mealSlot', t.mealSlot],
  ['dish', t.dish],
  ['exercise', t.exercise],
  ['workoutTemplate', t.workoutTemplate],
  ['workoutTemplateExercise', t.workoutTemplateExercise],
  ['supplement', t.supplement],
  ['plan', t.plan],
  ['planEntry', t.planEntry],
  ['dayLog', t.dayLog],
  ['mealLog', t.mealLog],
  ['workoutLog', t.workoutLog],
  ['setLog', t.setLog],
  ['supplementLog', t.supplementLog],
  ['measurement', t.measurement],
] as const;

export async function exportAll(db: Database): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  for (const [name, table] of TABLES) {
    data[name] = await db.select().from(table);
  }
  return data;
}

const importBody = z.object({
  /** Explicit confirmation: a restore wipes the current contents. */
  mode: z.literal('replace'),
  // In zod 4 the key type of z.record is mandatory.
  data: z.record(z.string(), z.unknown()),
});

export async function registerBackupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/export', async (request, reply) => {
    reply.header(
      'Content-Disposition',
      `attachment; filename="fitweek-backup-${today()}.json"`,
    );
    return exportAll(request.db);
  });

  /** A restore replaces the whole database; partial merging is left out. */
  app.post('/import', async (request) => {
    const body = parse(importBody, request.body);
    const data = body.data;

    await request.db.transaction(async (tx) => {
      // Delete in reverse order, from children to parents.
      for (const [, table] of [...TABLES].reverse()) {
        await tx.delete(table);
      }
      for (const [name, table] of TABLES) {
        const rows = data[name];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        await tx.insert(table).values(rows as never);
      }
    });

    return { ok: true, restored: TABLES.map(([name]) => name) };
  });
}
