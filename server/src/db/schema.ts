import { sql } from 'drizzle-orm';
import {
  integer,
  index,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/* ========================================================================== */
/*                             User and sessions                              */
/* ========================================================================== */

export const appUser = sqliteTable('app_user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(now),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(now),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [index('session_expires_idx').on(t.expiresAt)],
);

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  waterTargetMl: integer('water_target_ml').notNull().default(2500),
  weekStart: integer('week_start').notNull().default(1),
  theme: text('theme').notNull().default('system'),
});

/* ========================================================================== */
/*                                 Catalogues                                 */
/* ========================================================================== */

export const mealSlot = sqliteTable(
  'meal_slot',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    timeHint: text('time_hint').notNull().default('12:00'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('meal_slot_position_idx').on(t.position)],
);

export const dish = sqliteTable(
  'dish',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    category: text('category').notNull().default('other'),
    kcal: real('kcal').notNull().default(0),
    proteinG: real('protein_g').notNull().default(0),
    fatG: real('fat_g').notNull().default(0),
    carbsG: real('carbs_g').notNull().default(0),
    portion: text('portion').notNull().default(''),
    recipe: text('recipe').notNull().default(''),
    createdAt: text('created_at').notNull().default(now),
    archivedAt: text('archived_at'),
  },
  (t) => [index('dish_archived_idx').on(t.archivedAt)],
);

export const exercise = sqliteTable(
  'exercise',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    category: text('category').notNull().default('strength'),
    muscleGroup: text('muscle_group').notNull().default('none'),
    equipment: text('equipment').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull().default(now),
    archivedAt: text('archived_at'),
  },
  (t) => [index('exercise_archived_idx').on(t.archivedAt)],
);

export const workoutTemplate = sqliteTable(
  'workout_template',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('strength'),
    warmup: text('warmup').notNull().default(''),
    cooldown: text('cooldown').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: text('created_at').notNull().default(now),
    archivedAt: text('archived_at'),
  },
  (t) => [index('workout_template_archived_idx').on(t.archivedAt)],
);

export const workoutTemplateExercise = sqliteTable(
  'workout_template_exercise',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    templateId: integer('template_id')
      .notNull()
      .references(() => workoutTemplate.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercise.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
    targetSets: integer('target_sets').notNull().default(3),
    targetRepsMin: integer('target_reps_min'),
    targetRepsMax: integer('target_reps_max'),
    targetSeconds: integer('target_seconds'),
    restSec: integer('rest_sec').notNull().default(90),
    notes: text('notes').notNull().default(''),
  },
  (t) => [index('wte_template_idx').on(t.templateId, t.position)],
);

export const supplement = sqliteTable('supplement', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  dose: text('dose').notNull().default(''),
  notes: text('notes').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  position: integer('position').notNull().default(0),
});

/* ========================================================================== */
/*                                    Plan                                    */
/* ========================================================================== */

export const plan = sqliteTable('plan', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(now),
  archivedAt: text('archived_at'),
});

export const planEntry = sqliteTable(
  'plan_entry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    planId: integer('plan_id')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    kind: text('kind').notNull(),
    mealSlotId: integer('meal_slot_id').references(() => mealSlot.id, { onDelete: 'cascade' }),
    dishId: integer('dish_id').references(() => dish.id, { onDelete: 'cascade' }),
    workoutTemplateId: integer('workout_template_id').references(() => workoutTemplate.id, {
      onDelete: 'cascade',
    }),
    supplementId: integer('supplement_id').references(() => supplement.id, {
      onDelete: 'cascade',
    }),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('plan_entry_plan_day_idx').on(t.planId, t.weekday, t.position)],
);

/* ========================================================================== */
/*                                  Journal                                   */
/* ========================================================================== */

export const dayLog = sqliteTable('day_log', {
  /** YYYY-MM-DD */
  date: text('date').primaryKey(),
  planId: integer('plan_id').references(() => plan.id, { onDelete: 'set null' }),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull().default(now),
});

export const mealLog = sqliteTable(
  'meal_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date')
      .notNull()
      .references(() => dayLog.date, { onDelete: 'cascade' }),
    mealSlotId: integer('meal_slot_id').references(() => mealSlot.id, { onDelete: 'set null' }),
    mealSlotName: text('meal_slot_name').notNull().default(''),
    timeHint: text('time_hint').notNull().default(''),
    dishId: integer('dish_id').references(() => dish.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kcal: real('kcal').notNull().default(0),
    proteinG: real('protein_g').notNull().default(0),
    fatG: real('fat_g').notNull().default(0),
    carbsG: real('carbs_g').notNull().default(0),
    portion: text('portion').notNull().default(''),
    recipe: text('recipe').notNull().default(''),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    /*
     * Whether the row came from the plan. A meal eaten on top of the plan is
     * counted as eaten but never raises the target of the day: the norm is
     * what was planned, and going over it has to stay visible as going over.
     */
    planned: integer('planned', { mode: 'boolean' }).notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('meal_log_date_idx').on(t.date, t.position)],
);

export const workoutLog = sqliteTable(
  'workout_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date')
      .notNull()
      .references(() => dayLog.date, { onDelete: 'cascade' }),
    templateId: integer('template_id').references(() => workoutTemplate.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('strength'),
    status: text('status').notNull().default('planned'),
    warmup: text('warmup').notNull().default(''),
    cooldown: text('cooldown').notNull().default(''),
    /** JSON snapshot of the template exercises taken when the day was built. */
    plannedJson: text('planned_json').notNull().default('[]'),
    /** Cardio totals for the whole session when it is not split into sets. */
    durationMin: real('duration_min'),
    distanceKm: real('distance_km'),
    rpe: real('rpe'),
    notes: text('notes').notNull().default(''),
  },
  (t) => [uniqueIndex('workout_log_date_uq').on(t.date)],
);

export const setLog = sqliteTable(
  'set_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutLogId: integer('workout_log_id')
      .notNull()
      .references(() => workoutLog.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercise.id, { onDelete: 'restrict' }),
    setIndex: integer('set_index').notNull().default(0),
    reps: integer('reps'),
    weightKg: real('weight_kg'),
    seconds: integer('seconds'),
    /** Cardio only: a strength set has no distance. */
    distanceKm: real('distance_km'),
    band: text('band').notNull().default(''),
    rpe: real('rpe'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('set_log_workout_idx').on(t.workoutLogId, t.exerciseId, t.setIndex)],
);

export const supplementLog = sqliteTable(
  'supplement_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date')
      .notNull()
      .references(() => dayLog.date, { onDelete: 'cascade' }),
    /*
     * Name and dose are a snapshot while the catalogue reference may become
     * null: deleting a supplement must not erase the history of taking it,
     * exactly as with dishes.
     */
    supplementId: integer('supplement_id').references(() => supplement.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull().default(''),
    dose: text('dose').notNull().default(''),
    position: integer('position').notNull().default(0),
    taken: integer('taken', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('supplement_log_uq').on(t.date, t.supplementId)],
);

/* ========================================================================== */
/*                                Measurements                                */
/* ========================================================================== */

export const measurement = sqliteTable(
  'measurement',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    weightKg: real('weight_kg'),
    waistCm: real('waist_cm'),
    chestCm: real('chest_cm'),
    hipCm: real('hip_cm'),
    bicepCm: real('bicep_cm'),
    fatPct: real('fat_pct'),
    visceral: real('visceral'),
    muscleKg: real('muscle_kg'),
    bmrKcal: real('bmr_kcal'),
    notes: text('notes').notNull().default(''),
  },
  (t) => [uniqueIndex('measurement_date_uq').on(t.date)],
);
