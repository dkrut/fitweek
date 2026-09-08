import type {
  DishCategory,
  DishUnit,
  ExerciseCategory,
  MuscleGroup,
  WorkoutKind,
} from './schemas/catalog.js';
import type { WorkoutStatus } from './schemas/day.js';

export const WEEKDAY_SHORT = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'] as const;
export const WEEKDAY_FULL = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
] as const;

/** Day order for rendering a week that starts on Monday. */
export const WEEK_ORDER_MONDAY = [1, 2, 3, 4, 5, 6, 0] as const;

export const dishCategoryLabels: Record<DishCategory, string> = {
  breakfast: 'Завтрак',
  main: 'Основное блюдо',
  snack: 'Перекус',
  other: 'Другое',
};

export const exerciseCategoryLabels: Record<ExerciseCategory, string> = {
  strength: 'Силовое',
  cardio: 'Кардио',
  mobility: 'Мобильность',
};

export const muscleGroupLabels: Record<MuscleGroup, string> = {
  legs: 'Ноги',
  back: 'Спина',
  chest: 'Грудь',
  shoulders: 'Плечи',
  arms: 'Руки',
  core: 'Корпус',
  full_body: 'Всё тело',
  none: 'Без группы',
};

export const workoutKindLabels: Record<WorkoutKind, string> = {
  strength: 'Силовая',
  cardio: 'Кардио',
  rest: 'Отдых',
};

export const workoutStatusLabels: Record<WorkoutStatus, string> = {
  planned: 'Запланирована',
  done: 'Выполнена',
  skipped: 'Пропущена',
};


/**
 * Which fields make sense for an exercise. The rule is simple: strength work is
 * counted in sets and reps, cardio and mobility in time. A plank counts as
 * strength too — it has sets and reps, and its duration goes into the note.
 */
export interface ExerciseFields {
  sets: boolean;
  reps: boolean;
  time: boolean;
  rest: boolean;
  weight: boolean;
  band: boolean;
  /**
   * Distance exists only in the journal. A plan cannot set it: how far you
   * actually walked is known only after the walk.
   */
  distance: boolean;
}

export function exerciseFields(
  category: 'strength' | 'cardio' | 'mobility',
): ExerciseFields {
  const strength = category === 'strength';
  return {
    // Cardio and mobility have no sets and no rest: it is one continuous
    // effort, and the extra fields only get in the way.
    sets: strength,
    reps: strength,
    time: !strength,
    rest: strength,
    weight: strength,
    band: strength,
    distance: category === 'cardio',
  };
}

/* --------------------------------- Amounts -------------------------------- */

export const dishUnitLabels: Record<DishUnit, string> = {
  pcs: 'шт',
  g: 'г',
  ml: 'мл',
};

export const dishUnitFormLabels: Record<DishUnit, string> = {
  pcs: 'штуками',
  g: 'в граммах',
  ml: 'в миллилитрах',
};

/**
 * What the macros of a dish are stated for. A hundred grams is the number
 * printed on every package, so it is a constant rather than a field: a dish
 * measured by a 30 g scoop is a dish counted in pieces and named after one.
 */
export function unitBase(unit: DishUnit): number {
  return unit === 'pcs' ? 1 : 100;
}

/** Half a helping is common; ten grams is as fine as weighing gets. */
export function unitStep(unit: DishUnit): number {
  return unit === 'pcs' ? 0.5 : 10;
}

export interface Macros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** Macros of `amount` units, given the macros of one base of the dish. */
export function scaleMacros(perBase: Macros, unit: DishUnit, amount: number): Macros {
  const k = amount / unitBase(unit);
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    kcal: round(perBase.kcal * k),
    proteinG: round(perBase.proteinG * k),
    fatG: round(perBase.fatG * k),
    carbsG: round(perBase.carbsG * k),
  };
}

/**
 * How an amount reads next to a name. A single piece says nothing worth the
 * ink — "Овсянка ×1" is noise — so it comes back empty.
 */
export function formatAmount(amount: number | null, unit: DishUnit): string {
  if (amount === null) return '';
  if (unit === 'pcs') return amount === 1 ? '' : `×${amount}`;
  return `${amount} ${dishUnitLabels[unit]}`;
}
