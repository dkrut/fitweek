import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { defaultSettings, settingsPatch, type Settings } from '@shared/index.js';
import * as t from '../db/schema.js';
import { parse } from '../lib/validate.js';
import type { Database } from '../db/client.js';

/** Settings live in a single row with id = 1, created from defaults if absent. */
export async function readSettings(db: Database): Promise<Settings> {
  const rows = await db.select().from(t.settings).where(eq(t.settings.id, 1));
  const row = rows[0];
  if (!row) {
    await db.insert(t.settings).values({ id: 1, ...defaultSettings });
    return defaultSettings;
  }
  return {
    waterTargetMl: row.waterTargetMl,
    weekStart: row.weekStart === 0 ? 0 : 1,
    theme: row.theme as Settings['theme'],
  };
}

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async (request) => readSettings(request.db));

  app.patch('/settings', async (request) => {
    const body = parse(settingsPatch, request.body);
    await readSettings(request.db);
    await request.db.update(t.settings).set(body).where(eq(t.settings.id, 1));
    return readSettings(request.db);
  });
}
