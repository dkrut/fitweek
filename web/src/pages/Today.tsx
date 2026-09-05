import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Pill, Plus } from 'lucide-react';
import type { MealLog, MealLogCreate } from '@shared/index';
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  ErrorState,
  IconButton,
  ProgressBar,
  Ring,
  Field,
  Input,
  Select,
  Sheet,
  Spinner,
  Textarea,
  cx,
  useToast,
} from '../components/ui';
import { MealSheet } from '../components/MealSheet';
import { WorkoutSession } from '../components/WorkoutSession';
import {
  useAddMeal,
  useDay,
  useDishes,
  useMaterializeDay,
  useSetDayNotes,
  useStartWorkout,
  useTemplates,
  useToggleMeal,
  useToggleSupplement,
} from '../lib/queries';
import {
  addDays,
  isFuture,
  num,
  relativeDayLabel,
  today,
  weekdayFull,
} from '../lib/format';

export default function TodayPage() {
  const params = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const date = params.date ?? today();

  const day = useDay(date);
  const toggleMeal = useToggleMeal(date);
  const toggleSupplement = useToggleSupplement();
  const toast = useToast();

  const [openMeal, setOpenMeal] = useState<MealLog | null>(null);
  const [addingMeal, setAddingMeal] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const readOnly = isFuture(date);
  const go = (delta: number) => navigate(`/day/${addDays(date, delta)}`);

  if (day.isPending) return <Spinner />;
  if (day.isError) return <ErrorState error={day.error} onRetry={() => void day.refetch()} />;
  if (!day.data) return null;

  const view = day.data;
  // The target for a day is whatever the plan holds for it, not one number in
  // settings: a strength day carries more food, a rest day less.
  const targets = view.totals;
  // Ticking works only where journal rows exist: a projected plan carries
  // negative ids, and a PATCH against those would go nowhere.
  const editable = !readOnly && view.materialized;

  return (
    <>
      {/* Date navigation: the main screen must look both back and forward. */}
      <header className="mb-5 flex items-center justify-between gap-2">
        <IconButton label="Предыдущий день" onClick={() => go(-1)}>
          <ChevronLeft size={20} />
        </IconButton>

        <div className="text-center">
          <h1 className="text-[19px] font-semibold tracking-tight sm:text-xl">
            {relativeDayLabel(date)}
          </h1>
          <p className="text-[12px] text-muted">
            {weekdayFull(date)}
            {date !== today() ? (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="font-medium text-accent"
                >
                  к сегодня
                </button>
              </>
            ) : null}
          </p>
        </div>

        <IconButton label="Следующий день" onClick={() => go(1)}>
          <ChevronRight size={20} />
        </IconButton>
      </header>

      {readOnly ? (
        <p className="mb-4 rounded-xl bg-accent-soft px-3.5 py-2.5 text-[13px] text-accent">
          Это план на будущее. Отмечать выполнение можно начиная с сегодняшнего дня.
        </p>
      ) : null}

      {/* A past day never filled in: no journal exists for it. */}
      {!readOnly && !view.materialized ? <FillDayBanner date={date} /> : null}

      {/* Target rings: how much of the calories and protein is in. */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-around gap-5">
          <Ring
            value={view.totals.kcal}
            target={targets.plannedKcal}
            label="Калории"
            unit="ккал"
          />
          <Ring
            value={view.totals.proteinG}
            target={targets.plannedProteinG}
            label="Белок"
            unit="г"
            tone="success"
          />
          <div className="min-w-40 flex-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-muted">Выполнено за день</span>
              <span className="text-sm font-semibold tabular-nums">
                {view.totals.itemsDone}/{view.totals.itemsTotal}
              </span>
            </div>
            <ProgressBar value={view.totals.completionPct} className="mt-2" />
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              {[
                ['Жиры, г', view.totals.fatG, targets.plannedFatG],
                ['Углеводы, г', view.totals.carbsG, targets.plannedCarbsG],
              ].map(([label, value, planned]) => (
                <div key={String(label)} className="rounded-lg bg-surface-2 px-2 py-1.5">
                  <dt className="text-[11px] text-muted">{label}</dt>
                  <dd className="text-[13px] font-semibold tabular-nums">
                    {Number(planned) > 0 ? (
                      <>
                        {num(Number(value), 0)}
                        <span className="font-normal text-muted">/{num(Number(planned), 0)}</span>
                      </>
                    ) : Number(value) > 0 ? (
                      /* No plan for the day, but something was eaten: the
                         figure is known, there is only nothing to compare it
                         against. */
                      num(Number(value), 0)
                    ) : (
                      /* Nothing eaten and nothing planned — or the dishes of
                         the plan carry no such figure at all. */
                      <span className="font-normal text-muted">не заполнено</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Card>

      {/* Meals */}
      <Card className="mb-4" padded={false}>
        <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
          <CardTitle>Питание</CardTitle>
          {editable ? (
            <IconButton label="Добавить приём пищи" onClick={() => setAddingMeal(true)}>
              <Plus size={18} />
            </IconButton>
          ) : null}
        </div>

        <ul className="divide-y divide-border">
          {view.meals.map((meal) => (
            <li key={meal.id}>
              <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Checkbox
                  checked={meal.completed}
                  disabled={!editable}
                  label={`Отметить: ${meal.name}`}
                  onChange={(checked) => {
                    toggleMeal.mutate({ id: meal.id, completed: checked });
                  }}
                />
                <button
                  type="button"
                  onClick={() => setOpenMeal(meal)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted">
                      {meal.timeHint}
                    </span>
                    <span
                      className={cx(
                        'truncate text-sm',
                        meal.completed && 'text-muted line-through decoration-1',
                      )}
                    >
                      {meal.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                    <span className="tabular-nums">{num(meal.kcal, 0)} ккал</span>
                    <span className="tabular-nums text-success">
                      {num(meal.proteinG, 0)} г белка
                    </span>
                    {/* Without the mark it is a puzzle why the target did not
                        move when the meal was added. */}
                    {meal.planned ? null : <span>· сверх плана</span>}
                    {meal.fatG === 0 && meal.carbsG === 0 ? (
                      <span title="Жиры и углеводы не заполнены">
                        <Info size={12} />
                      </span>
                    ) : null}
                  </div>
                </button>
              </div>
            </li>
          ))}
        </ul>

        {view.meals.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-muted">
            На этот день недели в плане нет приёмов пищи. Соберите его в разделе «План
            недели».
          </p>
        ) : null}
      </Card>

      {/* Workout */}
      {view.workout ? (
        <div className="mb-4">
          <WorkoutSession workout={view.workout} editable={editable} />
        </div>
      ) : (
        <Card className="mb-4">
          <CardTitle>Тренировка</CardTitle>
          {editable ? (
            <StartWorkout date={date} />
          ) : (
            <p className="text-[13px] text-muted">В плане на этот день тренировки нет.</p>
          )}
        </Card>
      )}

      {/* Supplements */}
      {view.supplements.length > 0 ? (
        <Card className="mb-4">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Pill size={15} className="text-accent" />
              Добавки
            </span>
          </CardTitle>
          <ul className="flex flex-col gap-2.5">
            {view.supplements.map((supplement) => (
              <li key={supplement.id} className="flex items-center gap-3">
                <Checkbox
                  checked={supplement.taken}
                  disabled={!editable}
                  label={`Отметить: ${supplement.name}`}
                  onChange={(taken) => toggleSupplement.mutate({ id: supplement.id, taken })}
                />
                {/* Struck through like meals: the same gesture should look
                    the same in every list of the day. */}
                <span
                  className={cx(
                    'text-sm',
                    supplement.taken && 'text-muted line-through decoration-1',
                  )}
                >
                  {supplement.name}
                  {/* The dose stays muted; the strike-through is inherited. */}
                  {supplement.dose ? (
                    <span className="text-muted"> · {supplement.dose}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Note of the day */}
      {editable ? (
        <Card>
          <CardTitle
            action={
              <button
                type="button"
                onClick={() => setEditingNotes(true)}
                className="text-[13px] font-medium text-accent"
              >
                {view.notes ? 'Изменить' : 'Добавить'}
              </button>
            }
          >
            Заметка дня
          </CardTitle>
          <p className={cx('whitespace-pre-line text-[13px]', !view.notes && 'text-muted')}>
            {view.notes || 'Самочувствие, сон, что пошло не так — всё, что стоит помнить.'}
          </p>
        </Card>
      ) : null}

      {openMeal ? (
        <MealSheet
          meal={openMeal}
          editable={editable && openMeal.id > 0}
          onClose={() => setOpenMeal(null)}
        />
      ) : null}

      {addingMeal ? (
        <AddMealSheet date={date} onClose={() => setAddingMeal(false)} />
      ) : null}

      {editingNotes ? (
        <NotesSheet
          date={date}
          initial={view.notes}
          onClose={() => setEditingNotes(false)}
          onSaved={() => toast('Заметка сохранена')}
        />
      ) : null}
    </>
  );
}

/* --------------------------- Fill in a past day --------------------------- */

/**
 * Past dates are deliberately not written to the journal on a mere look: paging
 * through the calendar would otherwise add days that never happened and drag
 * plan adherence down. Filling in a missed day is an explicit step.
 */
function FillDayBanner({ date }: { date: string }) {
  const materialize = useMaterializeDay(date);
  const toast = useToast();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
      <p className="text-[13px] text-muted">
        Этот день не заполнялся — показан план. В метрики он не попадает.
      </p>
      <Button
        size="sm"
        variant="primary"
        loading={materialize.isPending}
        onClick={async () => {
          try {
            await materialize.mutateAsync();
            toast('День открыт для заполнения');
          } catch (error) {
            toast(error instanceof Error ? error.message : 'Не удалось', 'error');
          }
        }}
      >
        Заполнить день
      </Button>
    </div>
  );
}

/* ----------------------------- Start a workout ---------------------------- */

function StartWorkout({ date }: { date: string }) {
  const templates = useTemplates();
  const start = useStartWorkout(date);
  const toast = useToast();
  const [templateId, setTemplateId] = useState('');

  const submit = async () => {
    if (templateId === '') return;
    try {
      await start.mutateAsync(Number(templateId));
      toast('Тренировка добавлена в день');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось добавить', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">
        В плане на этот день тренировки нет. Можно добавить разово.
      </p>
      <div className="flex gap-2">
        <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Выберите шаблон</option>
          {(templates.list.data ?? []).map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          disabled={templateId === ''}
          loading={start.isPending}
          onClick={() => void submit()}
        >
          Добавить
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- Unplanned meal ----------------------------- */

/**
 * A meal eaten outside the plan is described on the spot rather than picked
 * from the catalogue: what you ate once is usually not a dish you keep.
 */
const emptyMeal = {
  name: '',
  kcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  portion: '',
};

function AddMealSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const addMeal = useAddMeal(date);
  const dishes = useDishes();
  const toast = useToast();
  const [form, setForm] = useState(emptyMeal);

  const set = <K extends keyof typeof emptyMeal>(key: K, value: (typeof emptyMeal)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // The same check the dish form makes: 4/9/4 should land near the stated
  // calories, and a wide gap is almost always a typo.
  const derivedKcal = form.proteinG * 4 + form.fatG * 9 + form.carbsG * 4;
  const macrosFilled = form.fatG > 0 || form.carbsG > 0;
  const mismatch =
    macrosFilled && form.kcal > 0 && Math.abs(derivedKcal - form.kcal) / form.kcal > 0.2;

  /**
   * Adds the meal to the day. With `keep` the dish is written to the catalogue
   * first and the journal row points at it — what you ate twice is worth
   * keeping, and retyping it every time is not.
   */
  const submit = async (keep = false) => {
    const name = form.name.trim();
    if (!name) {
      toast('Укажите название', 'error');
      return;
    }
    try {
      let dishId: number | null = null;
      if (keep) {
        // The category is left at «Другое»: this form is about what was eaten,
        // and sorting it into the catalogue is a job for the catalogue.
        const dish = await dishes.create.mutateAsync({
          ...form,
          name,
          category: 'other',
          recipe: '',
        });
        dishId = dish.id;
      }
      const body: MealLogCreate = { ...form, name, dishId, mealSlotId: null };
      await addMeal.mutateAsync(body);
      toast(keep ? 'Добавлено и сохранено в справочник' : 'Добавлено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось добавить', 'error');
    }
  };

  const pending = addMeal.isPending || dishes.create.isPending;
  const incomplete = form.name.trim() === '';

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title="Добавить приём пищи"
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            disabled={incomplete}
            loading={pending}
            onClick={() => void submit(true)}
          >
            Добавить в справочник
          </Button>
          <Button
            variant="primary"
            disabled={incomplete}
            loading={pending}
            onClick={() => void submit()}
          >
            Добавить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">
          Съели что-то вне плана — запишите. В норму дня это не войдёт, а в съеденное за
          день войдёт.
        </p>

        <Field label="Название">
          <Input
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="например, печенье"
            autoFocus
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

        <Field label="Порция" hint="Например: 4 штуки, 150 г">
          <Input value={form.portion} onChange={(event) => set('portion', event.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

/* ----------------------------------- Note --------------------------------- */

function NotesSheet({
  date,
  initial,
  onClose,
  onSaved,
}: {
  date: string;
  initial: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const save = useSetDayNotes(date);
  const toast = useToast();

  const submit = async () => {
    try {
      await save.mutateAsync(value);
      onSaved();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Заметка дня"
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            Сохранить
          </Button>
        </>
      }
    >
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Самочувствие, сон, нагрузка…"
        autoFocus
      />
    </Sheet>
  );
}
