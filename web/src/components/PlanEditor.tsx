import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PlanEntryInput } from '@shared/index';
import { WEEKDAY_FULL, WEEK_ORDER_MONDAY } from '@shared/index';
import { Button, Card, CardTitle, Checkbox, Select, Spinner, cx, useToast } from './ui';
import { DishOptions } from './DishOptions';
import { useDishes, useMealSlots, usePlan, useSupplements, useTemplates } from '../lib/queries';
import { num } from '../lib/format';

/** weekday -> slotId -> dishId, plus weekday -> templateId. */
type Draft = {
  meals: Record<number, Record<number, number | null>>;
  workouts: Record<number, number | null>;
  /** A day may hold any number of supplements, hence a set of ids. */
  supplements: Record<number, number[]>;
};

function buildDraft(
  entries: PlanEntryInput[] | undefined,
  weekdays: readonly number[],
  slotIds: number[],
): Draft {
  const meals: Draft['meals'] = {};
  const workouts: Draft['workouts'] = {};
  const supplements: Draft['supplements'] = {};

  for (const weekday of weekdays) {
    meals[weekday] = {};
    workouts[weekday] = null;
    supplements[weekday] = [];
    for (const slotId of slotIds) {
      meals[weekday]![slotId] = null;
    }
  }

  for (const entry of entries ?? []) {
    if (entry.kind === 'meal' && entry.mealSlotId !== null) {
      const row = meals[entry.weekday];
      if (row) row[entry.mealSlotId] = entry.dishId;
    } else if (entry.kind === 'workout') {
      workouts[entry.weekday] = entry.workoutTemplateId;
    } else if (entry.kind === 'supplement' && entry.supplementId !== null) {
      supplements[entry.weekday]?.push(entry.supplementId);
    }
  }

  return { meals, workouts, supplements };
}

/**
 * The weekly plan editor: a day-by-slot grid. The plan is the template days are
 * materialised from; edits never touch dates that have already been lived.
 */
export function PlanEditor() {
  const plan = usePlan();
  const slots = useMealSlots();
  const dishes = useDishes();
  const templates = useTemplates();
  const supplements = useSupplements();
  const toast = useToast();

  const slotList = useMemo(
    () => [...(slots.list.data ?? [])].sort((a, b) => a.position - b.position),
    [slots.list.data],
  );
  const slotIds = slotList.map((slot) => slot.id);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // No slots is a valid draft: a day can hold a workout and supplements
    // without a single meal in it.
    if (!plan.list.data) return;
    setDraft(buildDraft(plan.list.data.entries, WEEK_ORDER_MONDAY, slotIds));
    setDirty(false);
    // slotIds is rebuilt on every render, so the comparison is done on a string.
  }, [plan.list.data, slotIds.join(',')]);

  // The catalogues are awaited too: while the dish list is empty a <select>
  // has no matching option, and a filled day would look like a skipped one.
  if (
    plan.list.isPending ||
    slots.list.isPending ||
    dishes.list.isPending ||
    templates.list.isPending ||
    supplements.list.isPending
  ) {
    return <Spinner />;
  }

  if (!plan.list.data) {
    return (
      <Card>
        <CardTitle>План недели</CardTitle>
        <p className="text-[13px] text-muted">
          Плана пока нет. Создайте его — дальше расставите по дням блюда,
          тренировки и добавки из справочников.
        </p>
        <Button
          className="mt-4"
          variant="primary"
          loading={plan.create.isPending}
          onClick={() => void plan.create.mutateAsync('Мой план')}
        >
          <Plus size={16} />
          Создать план недели
        </Button>
      </Card>
    );
  }

  const activePlan = plan.list.data;

  if (!draft) return <Spinner />;

  const setMeal = (weekday: number, slotId: number, dishId: number | null) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            meals: {
              ...current.meals,
              [weekday]: { ...current.meals[weekday], [slotId]: dishId },
            },
          }
        : current,
    );
    setDirty(true);
  };

  const toggleSupplement = (weekday: number, supplementId: number, on: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const list = current.supplements[weekday] ?? [];
      return {
        ...current,
        supplements: {
          ...current.supplements,
          [weekday]: on
            ? [...list, supplementId]
            : list.filter((value) => value !== supplementId),
        },
      };
    });
    setDirty(true);
  };

  const setWorkout = (weekday: number, templateId: number | null) => {
    setDraft((current) =>
      current ? { ...current, workouts: { ...current.workouts, [weekday]: templateId } } : current,
    );
    setDirty(true);
  };

  const save = async () => {
    const entries: PlanEntryInput[] = [];

    for (const weekday of WEEK_ORDER_MONDAY) {
      slotList.forEach((slot, index) => {
        const dishId = draft.meals[weekday]?.[slot.id] ?? null;
        if (dishId === null) return;
        entries.push({
          weekday,
          kind: 'meal',
          mealSlotId: slot.id,
          dishId,
          workoutTemplateId: null,
          supplementId: null,
          position: index,
        });
      });

      const templateId = draft.workouts[weekday] ?? null;
      if (templateId !== null) {
        entries.push({
          weekday,
          kind: 'workout',
          mealSlotId: null,
          dishId: null,
          workoutTemplateId: templateId,
          supplementId: null,
          position: 100,
        });
      }

      (draft.supplements[weekday] ?? []).forEach((supplementId, index) => {
        entries.push({
          weekday,
          kind: 'supplement',
          mealSlotId: null,
          dishId: null,
          workoutTemplateId: null,
          supplementId,
          position: index,
        });
      });
    }

    try {
      await plan.saveEntries.mutateAsync({ planId: activePlan.id, entries });
      setDirty(false);
      toast('План сохранён');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить план', 'error');
    }
  };

  const dishList = dishes.list.data ?? [];
  const templateList = templates.list.data ?? [];
  const supplementList = (supplements.list.data ?? []).filter((item) => item.active);

  return (
    <Card>
      <CardTitle
        action={
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty}
            loading={plan.saveEntries.isPending}
            onClick={() => void save()}
          >
            Сохранить
          </Button>
        }
      >
        План недели
      </CardTitle>

      <p className="-mt-1 mb-4 text-[12px] text-muted">
        Из этого шаблона собираются дни. Уже прожитые дни не изменятся — новый план вступит в силу
        со дня, который ещё не открывали.
      </p>

      {/*
        No meal slots is the first step rather than an error, and it blocks the
        meals alone: a workout and supplements are assigned to a day without
        them, so the editor stays open.
      */}
      {slotList.length === 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warn-soft px-3.5 py-3 text-[13px] text-warn">
          <p className="max-w-md">
            Приёмов пищи пока нет — блюда ставить некуда. Тренировки и добавки
            назначаются и без них.
          </p>
          <Link
            to="/reference/nutrition?tab=slots"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} />
            Настроить приёмы пищи
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {WEEK_ORDER_MONDAY.map((weekday) => (
          <details
            key={weekday}
            open={weekday === new Date().getDay()}
            className="rounded-xl border border-border"
          >
            <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-medium">
              <span className="inline-flex w-full items-center justify-between gap-2">
                {WEEKDAY_FULL[weekday]}
                <span className="text-[12px] font-normal text-muted">
                  {templateList.find((item) => item.id === draft.workouts[weekday])?.name ??
                    'без тренировки'}
                </span>
              </span>
            </summary>

            <div className="flex flex-col gap-2.5 border-t border-border px-3.5 py-3">
              {slotList.map((slot) => (
                <label key={slot.id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-[13px] text-muted">
                    {slot.name}
                    <span className="ml-1 text-[11px] tabular-nums opacity-70">
                      {slot.timeHint}
                    </span>
                  </span>
                  <Select
                    value={draft.meals[weekday]?.[slot.id] ?? ''}
                    onChange={(event) =>
                      setMeal(
                        weekday,
                        slot.id,
                        event.target.value === '' ? null : Number(event.target.value),
                      )
                    }
                  >
                    <option value="">— пропустить —</option>
                    <DishOptions dishes={dishList} />
                  </Select>
                </label>
              ))}

              <label
                className={cx(
                  'flex items-center gap-3',
                  slotList.length > 0 && 'border-t border-border pt-2.5',
                )}
              >
                <span className="w-32 shrink-0 text-[13px] text-muted">Тренировка</span>
                <Select
                  value={draft.workouts[weekday] ?? ''}
                  onChange={(event) =>
                    setWorkout(weekday, event.target.value === '' ? null : Number(event.target.value))
                  }
                >
                  <option value="">— без тренировки —</option>
                  {templateList.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </label>

              {supplementList.length > 0 ? (
                <div className="flex gap-3 border-t border-border pt-2.5">
                  <span className="w-32 shrink-0 pt-1 text-[13px] text-muted">Добавки</span>
                  <ul className="flex flex-1 flex-col gap-2">
                    {supplementList.map((item) => {
                      const on = (draft.supplements[weekday] ?? []).includes(item.id);
                      return (
                        <li key={item.id}>
                          <label className="flex items-center gap-2.5 text-[13px]">
                            <Checkbox
                              checked={on}
                              label={item.name}
                              onChange={(value) => toggleSupplement(weekday, item.id, value)}
                            />
                            <span className={on ? '' : 'text-muted'}>
                              {item.name}
                              {item.dose ? (
                                <span className="text-muted"> · {item.dose}</span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {slotList.length > 0 ? (
                <DayTotals
                  dishIds={slotList.map((slot) => draft.meals[weekday]?.[slot.id] ?? null)}
                  dishes={dishList}
                />
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}

/** Day totals right in the editor, so a protein shortfall is visible at once. */
function DayTotals({
  dishIds,
  dishes,
}: {
  dishIds: Array<number | null>;
  dishes: Array<{ id: number; kcal: number; proteinG: number }>;
}) {
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  let kcal = 0;
  let protein = 0;
  for (const id of dishIds) {
    if (id === null) continue;
    const dish = byId.get(id);
    if (!dish) continue;
    kcal += dish.kcal;
    protein += dish.proteinG;
  }

  return (
    <p className="text-[12px] tabular-nums text-muted">
      Итого за день: {num(kcal, 0)} ккал ·{' '}
      <span className="text-success">{num(protein, 0)} г белка</span>
    </p>
  );
}
