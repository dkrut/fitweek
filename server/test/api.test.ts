import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, today } from '../src/lib/date.js';
import { createTestContext, credentials, type TestContext } from './helpers.js';
import { WEEK } from './fixtures.js';

/** How many meals the plan holds for that weekday. */
function mealsOn(date: string): number {
  const weekday = new Date(date + 'T00:00:00').getDay();
  return WEEK.find((day) => day.weekday === weekday)!.meals.length;
}

describe('API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('закрывает данные без сессии', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: `/api/days/${today()}` });
    expect(response.statusCode).toBe(401);
  });

  it('пускает с сессионной кукой', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/days/${today()}`,
      headers: { cookie: ctx.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().meals).toHaveLength(mealsOn(today()));
  });

  it('ограничивает перебор пароля', async () => {
    const attempt = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: credentials.username, password: 'wrong-password' },
      });

    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      codes.push((await attempt()).statusCode);
    }

    expect(codes.slice(0, 5).every((code) => code === 401)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('сообщает свой календарный день и пояс — по ним клиент считает «сегодня»', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/auth/me' });
    const body = response.json();

    expect(body.serverDate).toBe(today());
    expect(typeof body.timezone).toBe('string');
    expect(body.timezone.length).toBeGreaterThan(0);
  });

  it('health доступен без авторизации', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('отмечает приём пищи и пересчитывает суммы', async () => {
    const day = await ctx.app
      .inject({ method: 'GET', url: `/api/days/${today()}`, headers: { cookie: ctx.cookie } })
      .then((r) => r.json());

    const meal = day.meals[0];
    const patched = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/meal-logs/${meal.id}`,
      headers: { cookie: ctx.cookie },
      payload: { completed: true },
    });
    expect(patched.statusCode).toBe(200);

    const updated = await ctx.app
      .inject({ method: 'GET', url: `/api/days/${today()}`, headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(updated.totals.kcal).toBe(meal.kcal);
  });

  it('не позволяет отмечать выполнение в будущем', async () => {
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/days/${addDays(today(), 3)}/notes`,
      headers: { cookie: ctx.cookie },
      payload: { notes: 'заметка' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('записывает подходы и отдаёт их в дне', async () => {
    const day = await ctx.app
      .inject({ method: 'GET', url: `/api/days/${today()}`, headers: { cookie: ctx.cookie } })
      .then((r) => r.json());

    const workoutId = day.workout.id;
    const exerciseId = day.workout.planned[0].exerciseId;

    const created = await ctx.app.inject({
      method: 'POST',
      url: `/api/workout-logs/${workoutId}/sets`,
      headers: { cookie: ctx.cookie },
      payload: { exerciseId, reps: 10, weightKg: 40 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().setIndex).toBe(0);

    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/workout-logs/${workoutId}/sets`,
      headers: { cookie: ctx.cookie },
      payload: { exerciseId, reps: 8, weightKg: 42.5 },
    });
    expect(second.json().setIndex).toBe(1);

    const updated = await ctx.app
      .inject({ method: 'GET', url: `/api/days/${today()}`, headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(updated.workout.sets).toHaveLength(2);
  });

  it('валидирует тело запроса и объясняет, что не так', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/dishes',
      headers: { cookie: ctx.cookie },
      payload: { name: '', kcal: -5, proteinG: 0, fatG: 0, carbsG: 0 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().details.length).toBeGreaterThan(0);
  });

  it('сохраняет замер и обновляет его при повторе за ту же дату', async () => {
    const payload = { date: today(), weightKg: 82.4, waistCm: 91 };

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/measurements',
      headers: { cookie: ctx.cookie },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/measurements',
      headers: { cookie: ctx.cookie },
      payload: { ...payload, weightKg: 82.0 },
    });
    expect(second.statusCode).toBe(200);

    const all = await ctx.app
      .inject({ method: 'GET', url: '/api/measurements', headers: { cookie: ctx.cookie } })
      .then((r) => r.json());
    expect(all).toHaveLength(1);
    expect(all[0].weightKg).toBe(82.0);
  });
});
