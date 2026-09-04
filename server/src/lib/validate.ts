import { z } from 'zod';
import { badRequest } from './errors.js';

/**
 * Parses input against a zod schema. Schema errors become a 400 carrying a
 * readable list of fields, which the client shows inline in the form.
 */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = fields
      .map((f) => (f.path ? `${f.path}: ${f.message}` : f.message))
      .join('; ');
    throw badRequest(summary || 'Некорректные данные', fields);
  }
  return result.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
