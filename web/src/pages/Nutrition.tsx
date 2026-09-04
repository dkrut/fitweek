import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import type { Dish, DishInput, MealSlot, MealSlotInput } from '@shared/index';
import { dishCategories, dishCategoryLabels } from '@shared/index';
import { PageHeader } from '../components/Layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  SearchInput,
  Segmented,
  Select,
  Sheet,
  Spinner,
  Textarea,
  cx,
  useToast,
} from '../components/ui';
import { useDishes, useMealSlots } from '../lib/queries';
import { num, plural } from '../lib/format';

const emptyDish: DishInput = {
  name: '',
  category: 'other',
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  portion: '',
  recipe: '',
};

export default function NutritionPage() {
  /*
   * The tab lives in the URL: the weekly plan links straight at the meal slots,
   * and a link that lands on the neighbouring tab is a dead end.
   */
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'slots' ? 'slots' : 'dishes';
  const setTab = (value: 'dishes' | 'slots') =>
    setParams(value === 'slots' ? { tab: 'slots' } : {}, { replace: true });

  return (
    <>
      <PageHeader
        title="Питание"
        subtitle="Блюда и приёмы пищи"
        action={
          <Segmented
            value={tab}
            options={[
              { value: 'dishes', label: 'Блюда' },
              { value: 'slots', label: 'Приёмы пищи' },
            ]}
            onChange={setTab}
          />
        }
      />
      {tab === 'dishes' ? <Dishes /> : <MealSlots />}
    </>
  );
}

function Dishes() {
  const dishes = useDishes();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | Dish['category']>('all');
  const [editing, setEditing] = useState<Dish | 'new' | null>(null);

  const filtered = useMemo(() => {
    const list = dishes.list.data ?? [];
    const needle = query.trim().toLowerCase();
    return list.filter((dish) => {
      if (category !== 'all' && dish.category !== category) return false;
      if (!needle) return true;
      return (
        dish.name.toLowerCase().includes(needle) ||
        dish.portion.toLowerCase().includes(needle) ||
        dish.recipe.toLowerCase().includes(needle)
      );
    });
  }, [dishes.list.data, query, category]);

  const incomplete = (dishes.list.data ?? []).filter(
    (dish) => dish.fatG === 0 && dish.carbsG === 0,
  ).length;

  // An empty catalogue and an empty search result are different states: the
  // first one needs a way in, the second one a hint to loosen the filter.
  const empty = dishes.list.data !== undefined && dishes.list.data.length === 0;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} />
          Блюдо
        </Button>
      </div>

      {incomplete > 0 ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-card bg-warn-soft px-3.5 py-3 text-[13px] text-warn">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            У {incomplete} {plural(incomplete, 'блюда', 'блюд', 'блюд')} не заполнены жиры и
            углеводы. Пока они нулевые, графики по этим макронутриентам будут неполными.
          </p>
        </div>
      ) : null}

      {/* Search over nothing only gets in the way. */}
      {empty ? null : (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Поиск по названию, порции, рецепту"
            className="flex-1"
          />
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="sm:w-52"
          >
            <option value="all">Все категории</option>
            {dishCategories.map((value) => (
              <option key={value} value={value}>
                {dishCategoryLabels[value]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {dishes.list.isPending ? <Spinner /> : null}
      {dishes.list.isError ? (
        <ErrorState error={dishes.list.error} onRetry={() => void dishes.list.refetch()} />
      ) : null}

      {dishes.list.data && filtered.length === 0 ? (
        <EmptyState
          title={empty ? 'Блюд пока нет' : 'Ничего не найдено'}
          description={
            empty
              ? 'Блюдо — это ккал, БЖУ и порция. Из блюд собираются приёмы пищи в плане недели.'
              : 'Попробуйте другой запрос или снимите фильтр.'
          }
          action={
            empty ? (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus size={16} />
                Добавить
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <ul className="flex flex-col gap-2">
        {filtered.map((dish) => (
          <li key={dish.id}>
            <Card padded={false}>
              <div className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  {/* The name takes the whole row: category labels are long
                      and do not fit next to it. */}
                  <p className="truncate text-sm font-medium">{dish.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-muted">
                    <Badge>{dishCategoryLabels[dish.category]}</Badge>
                    <span>{num(dish.kcal, 0)} ккал</span>
                    <span className="text-success">Б {num(dish.proteinG, 0)}</span>
                    <span className={cx(dish.fatG === 0 && 'opacity-50')}>
                      Ж {num(dish.fatG, 0)}
                    </span>
                    <span className={cx(dish.carbsG === 0 && 'opacity-50')}>
                      У {num(dish.carbsG, 0)}
                    </span>
                    {dish.portion ? (
                      <span className="truncate normal-nums">· {dish.portion}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 gap-0.5">
                  <IconButton label="Изменить" onClick={() => setEditing(dish)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label="В архив"
                    onClick={() => void dishes.remove.mutateAsync(dish.id)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {editing ? (
        <DishSheet
          dish={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function DishSheet({ dish, onClose }: { dish: Dish | null; onClose: () => void }) {
  const dishes = useDishes();
  const toast = useToast();
  const [form, setForm] = useState<DishInput>(() =>
    dish
      ? {
          name: dish.name,
          category: dish.category,
          kcal: dish.kcal,
          proteinG: dish.proteinG,
          fatG: dish.fatG,
          carbsG: dish.carbsG,
          portion: dish.portion,
          recipe: dish.recipe,
        }
      : emptyDish,
  );

  const set = <K extends keyof DishInput>(key: K, value: DishInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * A sanity check: 4*protein + 9*fat + 4*carbs should land near the stated
   * calories. A gap almost always means a typo.
   */
  const derivedKcal = form.proteinG * 4 + form.fatG * 9 + form.carbsG * 4;
  const macrosFilled = form.fatG > 0 || form.carbsG > 0;
  const mismatch =
    macrosFilled && form.kcal > 0 && Math.abs(derivedKcal - form.kcal) / form.kcal > 0.2;

  const submit = async () => {
    if (!form.name.trim()) {
      toast('Укажите название', 'error');
      return;
    }
    try {
      if (dish) {
        await dishes.update.mutateAsync({ id: dish.id, body: form });
      } else {
        await dishes.create.mutateAsync(form);
      }
      toast('Сохранено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  const pending = dishes.create.isPending || dishes.update.isPending;

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={dish ? 'Изменить блюдо' : 'Новое блюдо'}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={pending} onClick={() => void submit()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Название">
          <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>

        <Field label="Категория">
          <Segmented
            value={form.category}
            options={dishCategories.map((value) => ({
              value,
              label: dishCategoryLabels[value],
            }))}
            onChange={(value) => set('category', value)}
            className="flex-wrap"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Ккал">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={form.kcal === 0 ? '' : form.kcal}
              onChange={(event) => set('kcal', Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Белок, г">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={form.proteinG === 0 ? '' : form.proteinG}
              onChange={(event) => set('proteinG', Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Жиры, г">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={form.fatG === 0 ? '' : form.fatG}
              onChange={(event) => set('fatG', Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Углеводы, г">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={form.carbsG === 0 ? '' : form.carbsG}
              onChange={(event) => set('carbsG', Number(event.target.value) || 0)}
            />
          </Field>
        </div>

        {mismatch ? (
          <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12px] text-warn">
            По БЖУ выходит {Math.round(derivedKcal)} ккал, а указано {Math.round(form.kcal)}.
            Проверьте цифры — где-то опечатка.
          </p>
        ) : null}

        <Field label="Порция" hint="Например: грудка 250 г + гречка 70 г сухой">
          <Input value={form.portion} onChange={(event) => set('portion', event.target.value)} />
        </Field>

        <Field label="Как готовить">
          <Textarea
            value={form.recipe}
            onChange={(event) => set('recipe', event.target.value)}
            className="min-h-32"
          />
        </Field>
      </div>
    </Sheet>
  );
}

/* -------------------------------- Meal slots ----------------------------- */

const emptySlot: MealSlotInput = { name: '', timeHint: '12:00', position: 0 };

/**
 * Meal slots are the rows of a day: breakfast at 09:00, lunch at 14:00. In the
 * weekly plan a dish is placed into a slot, so without them there is no plan.
 */
function MealSlots() {
  const slots = useMealSlots();
  const toast = useToast();
  const [editing, setEditing] = useState<MealSlot | 'new' | null>(null);
  const [form, setForm] = useState<MealSlotInput>(emptySlot);

  const list = useMemo(
    () => [...(slots.list.data ?? [])].sort((a, b) => a.position - b.position),
    [slots.list.data],
  );

  const open = (slot: MealSlot | 'new') => {
    setEditing(slot);
    setForm(
      slot === 'new'
        ? { ...emptySlot, position: list.length }
        : { name: slot.name, timeHint: slot.timeHint, position: slot.position },
    );
  };

  const save = async () => {
    if (form.name.trim() === '') {
      toast('Впишите название', 'error');
      return;
    }
    try {
      if (editing === 'new') await slots.create.mutateAsync(form);
      else if (editing) await slots.update.mutateAsync({ id: editing.id, body: form });
      setEditing(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  const remove = async (slot: MealSlot) => {
    if (!window.confirm(`Удалить «${slot.name}»? Записи журнала останутся.`)) return;
    try {
      await slots.remove.mutateAsync(slot.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось удалить', 'error');
    }
  };

  if (slots.list.isPending) return <Spinner />;
  if (slots.list.error) return <ErrorState error={slots.list.error} onRetry={slots.list.refetch} />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => open('new')}>
          <Plus size={16} />
          Приём пищи
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="Приёмов пищи пока нет"
          description="Завтрак, обед, ужин — из них собирается день. Блюда расставляются по ним в плане недели."
          action={
            <Button variant="primary" onClick={() => open('new')}>
              <Plus size={16} />
              Добавить
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {list.map((slot) => (
            <div key={slot.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-14 shrink-0 text-[13px] tabular-nums text-muted">
                {slot.timeHint}
              </span>
              <span className="flex-1 text-sm font-medium">{slot.name}</span>
              <IconButton label="Изменить" onClick={() => open(slot)}>
                <Pencil size={15} />
              </IconButton>
              <IconButton label="Удалить" onClick={() => void remove(slot)}>
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
        </Card>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Новый приём пищи' : 'Приём пищи'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Отмена</Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              loading={slots.create.isPending || slots.update.isPending}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Название">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="например, Завтрак"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Время" hint="Подсказка в дне, не будильник">
              <Input
                type="time"
                value={form.timeHint}
                onChange={(event) => setForm({ ...form, timeHint: event.target.value })}
              />
            </Field>
            <Field label="Порядок" hint="Чем меньше, тем выше в дне">
              <Input
                type="number"
                min={0}
                value={form.position}
                onChange={(event) => setForm({ ...form, position: Number(event.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Sheet>
    </>
  );
}
