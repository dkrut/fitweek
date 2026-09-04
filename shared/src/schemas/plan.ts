import { z } from 'zod';
import { id, weekday } from './common.js';

export const planEntryKinds = ['meal', 'workout', 'supplement'] as const;
export const planEntryKind = z.enum(planEntryKinds);
export type PlanEntryKind = z.infer<typeof planEntryKind>;

export const planEntryInput = z
  .object({
    weekday,
    kind: planEntryKind,
    mealSlotId: id.nullable().default(null),
    dishId: id.nullable().default(null),
    workoutTemplateId: id.nullable().default(null),
    supplementId: id.nullable().default(null),
    position: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'meal' && (value.mealSlotId === null || value.dishId === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Для приёма пищи нужны и слот, и блюдо',
      });
    }
    if (value.kind === 'workout' && value.workoutTemplateId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Для тренировки нужен шаблон',
      });
    }
    if (value.kind === 'supplement' && value.supplementId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Для добавки нужна сама добавка',
      });
    }
  });
export type PlanEntryInput = z.infer<typeof planEntryInput>;

export const planEntry = z.object({
  id,
  planId: id,
  weekday,
  kind: planEntryKind,
  mealSlotId: id.nullable(),
  dishId: id.nullable(),
  workoutTemplateId: id.nullable(),
  supplementId: id.nullable(),
  position: z.number().int(),
});
export type PlanEntry = z.infer<typeof planEntry>;

export const planInput = z.object({
  name: z.string().trim().min(1, 'Укажите название плана').max(120),
});
export type PlanInput = z.infer<typeof planInput>;

export const plan = planInput.extend({
  id,
  isActive: z.boolean(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Plan = z.infer<typeof plan>;

export const planWithEntries = plan.extend({
  entries: z.array(planEntry),
});
export type PlanWithEntries = z.infer<typeof planWithEntries>;

export const replaceEntriesInput = z.object({
  entries: z.array(planEntryInput),
});
export type ReplaceEntriesInput = z.infer<typeof replaceEntriesInput>;
