import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Dish, MealSlot, PlanEntryInput } from '@shared/index';
import {
  WEEKDAY_FULL,
  WEEK_ORDER_MONDAY,
  dishUnitLabels,
  scaleMacros,
  unitStep,
} from '@shared/index';
import { Button, Card, CardTitle, Checkbox, Input, Select, Spinner, cx, useToast } from './ui';
import { DishOptions } from './DishOptions';
import { useDishes, useMealSlots, usePlan, useSupplements, useTemplates } from '../lib/queries';
import { num } from '../lib/format';

/**
 * What a slot of a weekday holds. The amount is null far more often than not:
 * it means the usual helping of that dish, so that correcting the dish reaches
 * the plan instead of leaving two numbers to be kept in step by hand.
 */
type MealCell = { dishId: number; amount: number | null } | null;

/** weekday -> slotId -> dish and amount, plus weekday -> templateId. */
type Draft = {
  meals: Record<number, Record<number, MealCell>>;
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
      if (row && entry.dishId !== null) {
        row[entry.mealSlotId] = { dishId: entry.dishId, amount: entry.amount };
      }
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

  const setMeal = (weekday: number, slotId: number, cell: MealCell) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            meals: {
              ...current.meals,
              [weekday]: { ...current.meals[weekday], [slotId]: cell },
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
        const cell = draft.meals[weekday]?.[slot.id] ?? null;
        if (cell === null) return;
        entries.push({
          weekday,
          kind: 'meal',
          mealSlotId: slot.id,
          dishId: cell.dishId,
          workoutTemplateId: null,
          supplementId: null,
          amount: cell.amount,
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
          amount: null,
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
          amount: null,
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
                <MealRow
                  key={slot.id}
                  slot={slot}
                  cell={draft.meals[weekday]?.[slot.id] ?? null}
                  dishes={dishList}
                  onChange={(cell) => setMeal(weekday, slot.id, cell)}
                />
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
                  cells={slotList.map((slot) => draft.meals[weekday]?.[slot.id] ?? null)}
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

/**
 * One slot of one day: which dish, and how much of it. The amount sits behind a
 * placeholder rather than a value, so a plan that wants the usual helping — as
 * most of it does — reads as an empty field and asks for no attention.
 */
function MealRow({
  slot,
  cell,
  dishes,
  onChange,
}: {
  slot: MealSlot;
  cell: MealCell;
  dishes: Dish[];
  onChange: (cell: MealCell) => void;
}) {
  const dish = cell === null ? undefined : dishes.find((item) => item.id === cell.dishId);

  return (
    /*
     * The amount takes room the slot name and the select used to share, and on
     * a phone there is not enough of it for all three. So the name steps onto
     * its own line below sm, and the two controls keep the width to themselves.
     */
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-[13px] text-muted sm:w-32">
        {slot.name}
        <span className="ml-1 text-[11px] tabular-nums opacity-70">{slot.timeHint}</span>
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Select
          className="min-w-0 flex-1"
          aria-label={`Блюдо: ${slot.name}`}
          value={cell?.dishId ?? ''}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? null
                : // A different dish arrives at its own usual helping, not at
                  // the number the previous one happened to be measured in.
                  { dishId: Number(event.target.value), amount: null },
            )
          }
        >
          <option value="">— пропустить —</option>
          <DishOptions dishes={dishes} />
        </Select>

        {/* Input is w-full by design, and cx does not merge classes: the width
            belongs to the wrapper, not to an override that may or may not win. */}
        <div className="w-20 shrink-0">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={dish ? unitStep(dish.unit) : 1}
            className="text-center"
            aria-label={`Количество: ${slot.name}`}
            disabled={!dish}
            placeholder={dish ? String(dish.defaultAmount) : ''}
            value={cell?.amount ?? ''}
            onChange={(event) =>
              cell === null
                ? undefined
                : onChange({
                    ...cell,
                    amount: event.target.value === '' ? null : Number(event.target.value),
                  })
            }
          />
        </div>
        <span className="w-6 shrink-0 text-[13px] text-muted">
          {dish ? dishUnitLabels[dish.unit] : ''}
        </span>
      </div>
    </div>
  );
}

/** Day totals right in the editor, so a protein shortfall is visible at once. */
function DayTotals({
  cells,
  dishes,
}: {
  cells: MealCell[];
  dishes: Dish[];
}) {
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  let kcal = 0;
  let protein = 0;
  for (const cell of cells) {
    if (cell === null) continue;
    const dish = byId.get(cell.dishId);
    if (!dish) continue;
    const macros = scaleMacros(dish, dish.unit, cell.amount ?? dish.defaultAmount);
    kcal += macros.kcal;
    protein += macros.proteinG;
  }

  return (
    <p className="text-[12px] tabular-nums text-muted">
      Итого за день: {num(kcal, 0)} ккал ·{' '}
      <span className="text-success">{num(protein, 0)} г белка</span>
    </p>
  );
}
