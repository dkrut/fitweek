import { z } from 'zod';

/** A YYYY-MM-DD date — the only date format used in the API and the database. */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата в формате YYYY-MM-DD');

export const id = z.number().int().positive();

/** 0 = Sunday … 6 = Saturday, matching Date.getDay(). */
export const weekday = z.number().int().min(0).max(6);

