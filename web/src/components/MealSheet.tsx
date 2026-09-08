import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Dish, MealLog } from '@shared/index';
import { dishUnitLabels, scaleMacros, unitStep } from '@shared/index';
import { Button, Field, Input, NumberStepper, Select, Sheet, useToast } from './ui';
import { DishOptions } from './DishOptions';
import { useDeleteMeal, useDishes, usePatchMeal } from '../lib/queries';
import { num } from '../lib/format';

const FREEFORM = 'free';

/**
 * Viewing and editing a meal. A row is one of two kinds and the dish select
 * says which: a dish from the catalogue with an amount, its macros computed;
 * or something of one's own, four numbers and no amount. Editing the macros of
 * a dish-linked row is not offered on purpose — a quantity and a hand-written
 * total are two accounts of the same meal, and they drift apart.
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
  const [amount, setAmount] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  // Which button is working: both write, and one spinner for two lies.
  const [keeping, setKeeping] = useState(false);

  useEffect(() => {
    if (!meal) return;
    setDishId(meal.dishId);
    setAmount(meal.amount);
    setName(meal.name);
    setKcal(String(meal.kcal));
    setProteinG(String(meal.proteinG));
    setFatG(String(meal.fatG));
    setCarbsG(String(meal.carbsG));
  }, [meal]);

  if (!meal) return null;

  const dishList: Dish[] = dishes.list.data ?? [];
  const dish = dishId === null ? undefined : dishList.find((item) => item.id === dishId);
  // Macros of a linked row follow the amount; of an unlinked one, the fields.
  const preview = dish ? scaleMacros(dish, dish.unit, amount ?? dish.defaultAmount) : null;

  const pickDish = (value: string) => {
    if (value === FREEFORM) {
      /*
       * Unlinking gives a blank slate. Carrying the numbers over would clone a
       * dish you have just said you did not eat, and a clone is far too easy to
       * save by accident. A row that was hand-written to begin with is another
       * matter: there the values are its own, and it gets them back.
       */
      const own = meal.dishId === null;
      setDishId(null);
      setAmount(null);
      setName(own ? meal.name : '');
      setKcal(own ? String(meal.kcal) : '');
      setProteinG(own ? String(meal.proteinG) : '');
      setFatG(own ? String(meal.fatG) : '');
      setCarbsG(own ? String(meal.carbsG) : '');
      return;
    }
    const next = dishList.find((item) => item.id === Number(value));
    if (!next) return;
    setDishId(next.id);
    // A different dish arrives at its own usual helping.
    setAmount(next.defaultAmount);
    setName(next.name);
  };

  const save = async () => {
    if (dishId === null && !name.trim()) {
      toast('Укажите название', 'error');
      return;
    }
    try {
      await patch.mutateAsync({
        id: meal.id,
        patch:
          dishId === null
            ? {
                dishId: null,
                name: name.trim(),
                kcal: Number(kcal) || 0,
                proteinG: Number(proteinG) || 0,
                fatG: Number(fatG) || 0,
                carbsG: Number(carbsG) || 0,
              }
            : {
                ...(dishId !== meal.dishId ? { dishId } : {}),
                amount: amount ?? dish?.defaultAmount ?? 1,
              },
      });
      toast('Сохранено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  /*
   * Filing a hand-written row into the catalogue. Its four numbers stood for
   * everything eaten, so the dish they make is counted in pieces at one
   * helping — the only reading that loses nothing — and the row then points at
   * it, or the catalogue would gain a card with no relation to the day.
   */
  const keep = async () => {
    if (!name.trim()) {
      toast('Укажите название', 'error');
      return;
    }
    setKeeping(true);
    try {
      const created = await dishes.create.mutateAsync({
        name: name.trim(),
        category: 'other',
        unit: 'pcs',
        defaultAmount: 1,
        kcal: Number(kcal) || 0,
        proteinG: Number(proteinG) || 0,
        fatG: Number(fatG) || 0,
        carbsG: Number(carbsG) || 0,
        portion: meal.portion,
        recipe: '',
      });
      await patch.mutateAsync({ id: meal.id, patch: { dishId: created.id, amount: 1 } });
      toast('Сохранено в справочник');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    } finally {
      setKeeping(false);
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

  const macroTiles = (values: Array<[string, number]>) => (
    <div className="grid grid-cols-4 gap-3 text-center">
      {values.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-surface-2 px-2 py-2.5">
          <div className="text-[11px] text-muted">{label}</div>
          <div className="text-sm font-semibold tabular-nums">{num(value, 0)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      wide
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
            {/* Only a row of one's own is worth filing: a dish from the
                catalogue differs from its card by the amount alone. */}
            {dishId === null ? (
              <Button loading={keeping} onClick={() => void keep()}>
                Добавить в справочник
              </Button>
            ) : null}
            <Button
              variant="primary"
              onClick={() => void save()}
              loading={patch.isPending && !keeping}
            >
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
              <span className="text-muted">Состав: </span>
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
            <Field label="Блюдо">
              <Select
                value={dishId === null ? FREEFORM : dishId}
                onChange={(event) => pickDish(event.target.value)}
              >
                <option value={FREEFORM}>— своё, вписать руками —</option>
                <DishOptions dishes={dishList} />
              </Select>
            </Field>

            {dish ? (
              <>
                <Field label="Сколько съел" group>
                  <NumberStepper
                    value={amount ?? dish.defaultAmount}
                    onChange={setAmount}
                    step={unitStep(dish.unit)}
                    min={0}
                    max={10000}
                    suffix={dishUnitLabels[dish.unit]}
                  />
                </Field>

                {preview
                  ? macroTiles([
                      ['Ккал', preview.kcal],
                      ['Белок', preview.proteinG],
                      ['Жиры', preview.fatG],
                      ['Углеводы', preview.carbsG],
                    ])
                  : null}

                <p className="text-[12px] text-muted">
                  КБЖУ считаются из количества. Съели что-то другое под этим именем — выберите
                  «своё».
                </p>
              </>
            ) : (
              <>
                <Field label="Название">
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="например, шаверма у метро"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Ккал">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="0"
                      value={kcal}
                      onChange={(event) => setKcal(event.target.value)}
                    />
                  </Field>
                  <Field label="Белок, г">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="0"
                      value={proteinG}
                      onChange={(event) => setProteinG(event.target.value)}
                    />
                  </Field>
                  <Field label="Жиры, г">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="0"
                      value={fatG}
                      onChange={(event) => setFatG(event.target.value)}
                    />
                  </Field>
                  <Field label="Углеводы, г">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="0"
                      value={carbsG}
                      onChange={(event) => setCarbsG(event.target.value)}
                    />
                  </Field>
                </div>

                <p className="text-[12px] text-muted">
                  Числа за всё съеденное, количества здесь нет. Правка меняет только этот день.
                  «Добавить в справочник» заведёт блюдо с этими КБЖУ за одну штуку: если тут две
                  порции, поделите.
                </p>
              </>
            )}
          </>
        ) : (
          macroTiles([
            ['Ккал', meal.kcal],
            ['Белок', meal.proteinG],
            ['Жиры', meal.fatG],
            ['Углеводы', meal.carbsG],
          ])
        )}
      </div>
    </Sheet>
  );
}
