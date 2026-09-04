import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Dish, MealLog } from '@shared/index';
import { Button, Field, Input, Select, Sheet, useToast } from './ui';
import { DishOptions } from './DishOptions';
import { useDeleteMeal, useDishes, usePatchMeal } from '../lib/queries';
import { num } from '../lib/format';

/**
 * Viewing and editing a meal. Swapping the dish pulls in its macros, and the
 * values can still be corrected by hand: the journal keeps them as a snapshot.
 */
export function MealSheet({
  meal,
  editable,
  onClose,
}: {
  meal: MealLog | null;
  editable: boolean;
  onClose: () => void;
}) {
  const dishes = useDishes();
  const patch = usePatchMeal();
  const remove = useDeleteMeal();
  const toast = useToast();

  const [dishId, setDishId] = useState<number | null>(null);
  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!meal) return;
    setDishId(meal.dishId);
    setKcal(String(meal.kcal));
    setProteinG(String(meal.proteinG));
    setFatG(String(meal.fatG));
    setCarbsG(String(meal.carbsG));
    setDirty(false);
  }, [meal]);

  if (!meal) return null;

  const dishList: Dish[] = dishes.list.data ?? [];

  const pickDish = (value: string) => {
    const id = value === '' ? null : Number(value);
    setDishId(id);
    setDirty(true);
    const dish = dishList.find((item) => item.id === id);
    if (dish) {
      setKcal(String(dish.kcal));
      setProteinG(String(dish.proteinG));
      setFatG(String(dish.fatG));
      setCarbsG(String(dish.carbsG));
    }
  };

  const save = async () => {
    try {
      await patch.mutateAsync({
        id: meal.id,
        patch: {
          ...(dishId !== null && dishId !== meal.dishId ? { dishId } : {}),
          kcal: Number(kcal) || 0,
          proteinG: Number(proteinG) || 0,
          fatG: Number(fatG) || 0,
          carbsG: Number(carbsG) || 0,
        },
      });
      toast('Сохранено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  const drop = async () => {
    try {
      await remove.mutateAsync(meal.id);
      toast('Приём пищи удалён');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось удалить', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={meal.name}
      footer={
        editable ? (
          <>
            <Button variant="danger" onClick={() => void drop()} loading={remove.isPending}>
              <Trash2 size={16} />
              Удалить
            </Button>
            <div className="flex-1" />
            <Button onClick={onClose}>Отмена</Button>
            <Button variant="primary" onClick={() => void save()} loading={patch.isPending}>
              Сохранить
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Закрыть</Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px]">
          <span>
            <span className="text-muted">Слот: </span>
            {meal.mealSlotName || '—'}
            {meal.timeHint ? ` · ${meal.timeHint}` : ''}
          </span>
          {meal.portion ? (
            <span>
              <span className="text-muted">Порция: </span>
              {meal.portion}
            </span>
          ) : null}
        </div>

        {meal.recipe ? (
          <div>
            <p className="mb-1 text-[13px] font-medium text-muted">Как готовить</p>
            <p className="whitespace-pre-line text-sm">{meal.recipe}</p>
          </div>
        ) : null}

        {editable ? (
          <>
            <Field label="Блюдо" hint="Замена подставит БЖУ из справочника">
              <Select value={dishId ?? ''} onChange={(event) => pickDish(event.target.value)}>
                <option value="">— без блюда из справочника —</option>
                <DishOptions dishes={dishList} />
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Ккал">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={kcal}
                  onChange={(event) => {
                    setKcal(event.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Белок, г">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={proteinG}
                  onChange={(event) => {
                    setProteinG(event.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Жиры, г">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={fatG}
                  onChange={(event) => {
                    setFatG(event.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Углеводы, г">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={carbsG}
                  onChange={(event) => {
                    setCarbsG(event.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
            </div>

            {dirty ? (
              <p className="text-[12px] text-muted">
                Правка меняет только этот день — справочник блюд останется как был.
              </p>
            ) : null}
          </>
        ) : (
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              ['Ккал', meal.kcal],
              ['Белок', meal.proteinG],
              ['Жиры', meal.fatG],
              ['Углеводы', meal.carbsG],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-surface-2 px-2 py-2.5">
                <div className="text-[11px] text-muted">{label}</div>
                <div className="text-sm font-semibold tabular-nums">{num(Number(value), 0)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
