import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { today } from '../src/lib/date.js';
import { createTestContext, type TestContext } from './helpers.js';
import { COUNTS } from './fixtures.js';

/**
 * A backup exports the whole database and a restore replaces it whole.
 * Partial merging is deliberately absent: it would mean resolving conflicts
 * between two journals, and that is exactly the case where a silent merge
 * loses data.
 */
describe('бэкап и восстановление базы', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('выгружает все таблицы и восстанавливается целиком', async () => {
    const exported = await ctx.app
      .inject({ method: 'GET', url: '/api/export', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());

    expect(exported.dish.length).toBe(COUNTS.dishes);
    const byKind = (kind: string) =>
      exported.planEntry.filter((e: { kind: string }) => e.kind === kind).length;
    expect(byKind('meal')).toBe(COUNTS.mealEntries);
    expect(byKind('workout')).toBe(COUNTS.workoutEntries);
    expect(byKind('supplement')).toBe(COUNTS.supplementEntries);

    const restored = await ctx.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: { cookie: ctx.cookie },
      payload: { mode: 'replace', data: exported },
    });
    expect(restored.statusCode).toBe(200);

    const dishes = await ctx.app
      .inject({ method: 'GET', url: '/api/dishes', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(dishes).toHaveLength(COUNTS.dishes);
  });

  it('восстановление не удваивает справочники при повторном прогоне', async () => {
    const exported = await ctx.app
      .inject({ method: 'GET', url: '/api/export', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());

    for (let i = 0; i < 2; i += 1) {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/import',
        headers: { cookie: ctx.cookie },
        payload: { mode: 'replace', data: exported },
      });
      expect(response.statusCode).toBe(200);
    }

    const again = await ctx.app
      .inject({ method: 'GET', url: '/api/export', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(again.dish.length).toBe(exported.dish.length);
    expect(again.planEntry.length).toBe(exported.planEntry.length);
  });

  /*
   * A backup taken before the journal knew about unplanned meals carries no
   * such field. Everything in it came from a plan, so the restore has to read
   * it that way instead of refusing the file or dropping the day's norm.
   */
  it('восстанавливает бэкап, снятый до появления «сверх плана»', async () => {
    // Opening today is what writes the journal rows the backup then carries.
    await ctx.app.inject({
      method: 'GET',
      url: `/api/days/${today()}`,
      headers: { cookie: ctx.cookie },
    });

    const exported = await ctx.app
      .inject({ method: 'GET', url: '/api/export', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());

    expect(exported.mealLog.length).toBeGreaterThan(0);
    const old = {
      ...exported,
      mealLog: exported.mealLog.map(({ planned: _drop, ...rest }: { planned: boolean }) => rest),
    };

    const restored = await ctx.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: { cookie: ctx.cookie },
      payload: { mode: 'replace', data: old },
    });
    expect(restored.statusCode).toBe(200);

    const again = await ctx.app
      .inject({ method: 'GET', url: '/api/export', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(again.mealLog.length).toBe(exported.mealLog.length);
    expect(again.mealLog.every((meal: { planned: boolean }) => meal.planned)).toBe(true);
  });

  it('требует явного mode=replace: случайный POST не стирает базу', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/import',
      headers: { cookie: ctx.cookie },
      payload: { data: {} },
    });
    expect(response.statusCode).toBe(400);

    const dishes = await ctx.app
      .inject({ method: 'GET', url: '/api/dishes', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(dishes).toHaveLength(COUNTS.dishes);
  });
});
