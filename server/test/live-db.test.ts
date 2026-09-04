import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiveContext, hasLiveDb, liveDbPath, type TestContext } from './helpers.js';
import { today } from '../src/lib/date.js';

/**
 * Checks against a copy of the working database. The fixture is tidy: it has no
 * empty templates and no half-filled days, which is exactly where things break.
 *
 * The snapshot is taken by `scripts/copy-live-db.sh` (or by hand, see README);
 * without one this suite is skipped so `npm test` works on a clean machine.
 * Data is only read: everything runs on a disposable copy in a temp directory.
 */
const enabled = hasLiveDb();

describe.skipIf(!enabled)('копия рабочей базы', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createLiveContext();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const get = async (url: string) => {
    const response = await ctx.app.inject({ method: 'GET', url, headers: { cookie: ctx.cookie } });
    expect(response.statusCode, `${url} ответил ${response.statusCode}`).toBe(200);
    return response.json();
  };

  it('миграции применяются к рабочим данным', async () => {
    // beforeAll has already run the migrations; this pins down that the schema
    // matches the code: any extra or missing column breaks the select.
    const dishes = await get('/api/dishes');
    const exercises = await get('/api/exercises');
    expect(Array.isArray(dishes)).toBe(true);
    expect(Array.isArray(exercises)).toBe(true);
  });

  it('все разделы открываются', async () => {
    const from = '2020-01-01';
    for (const url of [
      '/api/auth/me',
      '/api/settings',
      '/api/meal-slots',
      '/api/dishes',
      '/api/exercises',
      '/api/workout-templates',
      '/api/supplements',
      '/api/plans/active',
      `/api/days?from=${from}&to=${today()}`,
      `/api/days/${today()}`,
      '/api/measurements',
      `/api/metrics/overview?from=${from}&to=${today()}`,
      '/api/metrics/exercises',
    ]) {
      await get(url);
    }
  });

  it('план недели ссылается только на существующие справочники', async () => {
    const plan = await get('/api/plans/active');
    const ids = (rows: { id: number }[]) => new Set(rows.map((r) => r.id));
    const dishes = ids(await get('/api/dishes'));
    const templates = ids(await get('/api/workout-templates'));
    const supplements = ids(await get('/api/supplements'));

    for (const entry of plan.entries as {
      kind: string;
      dishId: number | null;
      workoutTemplateId: number | null;
      supplementId: number | null;
    }[]) {
      if (entry.dishId !== null) {
        expect(dishes.has(entry.dishId), `блюдо ${entry.dishId} из плана удалено`).toBe(true);
      }
      if (entry.workoutTemplateId !== null) {
        expect(
          templates.has(entry.workoutTemplateId),
          `шаблон ${entry.workoutTemplateId} удалён`,
        ).toBe(true);
      }
      if (entry.supplementId !== null) {
        expect(supplements.has(entry.supplementId), `добавка ${entry.supplementId} удалена`).toBe(
          true,
        );
      }
    }
  });

  it('суммы дня согласованы с его составом', async () => {
    const day = await get(`/api/days/${today()}`);
    const items =
      day.meals.length + day.supplements.length + (day.workout ? 1 : 0);
    expect(day.totals.itemsTotal).toBe(items);
    expect(day.totals.itemsDone).toBeLessThanOrEqual(day.totals.itemsTotal);
    expect(day.totals.completionPct).toBeGreaterThanOrEqual(0);
    expect(day.totals.completionPct).toBeLessThanOrEqual(100);
  });

  it('бэкап рабочей базы восстанавливается без потерь', async () => {
    const before = await get('/api/export');
    const restored = await ctx.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: { cookie: ctx.cookie },
      payload: { mode: 'replace', data: before },
    });
    expect(restored.statusCode).toBe(200);

    const after = await get('/api/export');
    for (const table of Object.keys(before)) {
      if (!Array.isArray(before[table])) continue;
      expect(after[table].length, `таблица ${table} изменилась в размере`).toBe(
        before[table].length,
      );
    }
  });
});

if (!enabled) {
  console.log(`Набор «копия рабочей базы» пропущен: нет снимка ${liveDbPath()}`);
}
