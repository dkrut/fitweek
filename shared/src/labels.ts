import type {
  DishCategory,
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
