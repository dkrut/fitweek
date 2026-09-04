import { z } from 'zod';
import { dateString, id } from './common.js';

/**
 * Every figure is optional: weighing in daily but measuring the waist once a
 * week is a normal habit, so gaps in the data are expected.
 */
export const measurementInput = z.object({
  date: dateString,
  weightKg: z.number().min(20).max(400).nullable().default(null),
  waistCm: z.number().min(30).max(250).nullable().default(null),
  chestCm: z.number().min(30).max(250).nullable().default(null),
  hipCm: z.number().min(30).max(250).nullable().default(null),
  bicepCm: z.number().min(10).max(100).nullable().default(null),
  fatPct: z.number().min(1).max(70).nullable().default(null),
  visceral: z.number().min(1).max(60).nullable().default(null),
  muscleKg: z.number().min(10).max(150).nullable().default(null),
  bmrKcal: z.number().min(500).max(5000).nullable().default(null),
  notes: z.string().max(1000).default(''),
});
export type MeasurementInput = z.infer<typeof measurementInput>;

export const measurement = measurementInput.extend({ id });
export type Measurement = z.infer<typeof measurement>;

export const measurementPatch = measurementInput.partial().omit({ date: true });
export type MeasurementPatch = z.infer<typeof measurementPatch>;

/** Measurement fields available as chart series. */
export const measurementFields = [
  'weightKg',
  'waistCm',
  'chestCm',
  'hipCm',
  'bicepCm',
  'fatPct',
  'visceral',
  'muscleKg',
  'bmrKcal',
] as const;
export type MeasurementField = (typeof measurementFields)[number];

export const measurementFieldLabels: Record<MeasurementField, { label: string; unit: string }> = {
  weightKg: { label: 'Вес', unit: 'кг' },
  waistCm: { label: 'Талия', unit: 'см' },
  chestCm: { label: 'Грудь', unit: 'см' },
  hipCm: { label: 'Бёдра', unit: 'см' },
  bicepCm: { label: 'Бицепс', unit: 'см' },
  fatPct: { label: '% жира', unit: '%' },
  visceral: { label: 'Висцеральный жир', unit: 'ур.' },
  muscleKg: { label: 'Мышцы', unit: 'кг' },
  bmrKcal: { label: 'BMR', unit: 'ккал' },
};
