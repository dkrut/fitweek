import { afterAll, beforeAll, vi } from 'vitest';
import { WEEK } from './fixtures.js';

/**
 * The clock every test runs on.
 *
 * The plan in the fixture differs by weekday: Wednesday and Saturday are rest
 * days with no workout. Left on the real calendar, a test that opens «today»
 * and expects a workout in it passed five days a week and failed the other
 * two — a suite that is green or red depending on when it is run reports
 * nothing about the code.
 *
 * Monday is pinned instead: the fixture puts a strength workout on it, and a
 * fixed date also keeps «yesterday», «a week ago» and the metric ranges built
 * from them the same on every run. Only Date is faked; timers stay real, or
 * the server would never finish a request.
 */
const MONDAY = new Date(2026, 2, 2, 9, 0, 0);

beforeAll(() => {
  // Said out loud, because half a dozen tests quietly depend on it: change the
  // fixture so that this weekday rests, and they all fail at once with nothing
  // pointing here.
  const planned = WEEK.find((day) => day.weekday === MONDAY.getDay());
  if (!planned?.template) {
    throw new Error(
      `День недели ${MONDAY.getDay()} в фикстуре без тренировки — ` +
        'выберите для тестов день, на который план её ставит',
    );
  }

  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MONDAY);
});

afterAll(() => {
  vi.useRealTimers();
});
