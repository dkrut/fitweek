import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  Exercise,
  ExerciseInput,
  TemplateExerciseInput,
  WorkoutTemplate,
  WorkoutTemplateInput,
} from '@shared/index';
import {
  exerciseCategories,
  exerciseCategoryLabels,
  exerciseFields,
  muscleGroupLabels,
  muscleGroups,
  workoutKindLabels,
  workoutKinds,
} from '@shared/index';
import { ExerciseOptions } from '../components/ExerciseOptions';
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
  useToast,
} from '../components/ui';
import { useExercises, useTemplates } from '../lib/queries';
import { formatTarget, minutesToSeconds, secondsToMinutes } from '../lib/format';

export default function WorkoutsPage() {
  // In the URL rather than in state: the template editor links at the exercise
  // catalogue, and that link has to open the right tab.
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'exercises' ? 'exercises' : 'templates';
  const setTab = (value: 'templates' | 'exercises') =>
    setParams(value === 'exercises' ? { tab: 'exercises' } : {}, { replace: true });

  return (
    <>
      <PageHeader
        title="Тренировки"
        subtitle="Шаблоны и каталог упражнений"
        action={
          <Segmented
            value={tab}
            options={[
              { value: 'templates', label: 'Шаблоны' },
              { value: 'exercises', label: 'Упражнения' },
            ]}
            onChange={setTab}
          />
        }
      />
      {tab === 'templates' ? <Templates /> : <Exercises />}
    </>
  );
}

/* -------------------------------- Templates ------------------------------- */

function Templates() {
  const templates = useTemplates();
  const [editing, setEditing] = useState<WorkoutTemplate | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | WorkoutTemplate['kind']>('all');
  const toast = useToast();

  // An empty catalogue is a different state from an empty search result.
  const empty = templates.list.data !== undefined && templates.list.data.length === 0;

  const filtered = useMemo(() => {
    const list = templates.list.data ?? [];
    const needle = query.trim().toLowerCase();
    return list.filter((template) => {
      if (kind !== 'all' && template.kind !== kind) return false;
      if (!needle) return true;
      // Search covers the contents too: which template holds a given exercise.
      return (
        template.name.toLowerCase().includes(needle) ||
        template.notes.toLowerCase().includes(needle) ||
        template.exercises.some((item) => item.exerciseName.toLowerCase().includes(needle))
      );
    });
  }, [templates.list.data, query, kind]);

  return (
    <>
      {/* While the catalogue is empty the only way in is the button in the
          empty state: two identical buttons on one screen is a choice that
          is not one. */}
      {empty ? null : (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Поиск по названию, заметке, упражнению"
            className="flex-1"
          />
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="sm:w-44"
          >
            <option value="all">Все типы</option>
            {workoutKinds.map((value) => (
              <option key={value} value={value}>
                {workoutKindLabels[value]}
              </option>
            ))}
          </Select>
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={16} />
            Шаблон
          </Button>
        </div>
      )}

      {templates.list.isPending ? <Spinner /> : null}
      {templates.list.isError ? (
        <ErrorState error={templates.list.error} onRetry={() => void templates.list.refetch()} />
      ) : null}

      {templates.list.data && filtered.length === 0 ? (
        <EmptyState
          title={empty ? 'Шаблонов пока нет' : 'Ничего не найдено'}
          description={
            empty
              ? 'Шаблон описывает состав тренировки: упражнения, подходы и отдых.'
              : 'Попробуйте другой запрос или тип.'
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
        {filtered.map((template) => (
          <li key={template.id}>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium">
                      {template.name}
                    </h3>
                    <Badge tone={template.kind === 'rest' ? 'neutral' : 'accent'}>
                      {workoutKindLabels[template.kind]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {template.exercises.length === 0
                      ? 'Без упражнений'
                      : `${template.exercises.length} упр.`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <IconButton label="Изменить" onClick={() => setEditing(template)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label="В архив"
                    onClick={async () => {
                      try {
                        await templates.remove.mutateAsync(template.id);
                        toast('Шаблон в архиве');
                      } catch (error) {
                        toast(error instanceof Error ? error.message : 'Ошибка', 'error');
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>

              {template.exercises.length > 0 ? (
                <ol className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
                  {template.exercises.map((exercise) => (
                    <li
                      key={exercise.id}
                      className="flex items-baseline justify-between gap-3 text-[13px]"
                    >
                      <span className="truncate">{exercise.exerciseName}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatTarget(exercise)}
                        {exercise.restSec > 0 ? ` · ${exercise.restSec} сек` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      {editing ? (
        <TemplateSheet
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/** The defaults depend on the exercise type. */
const emptyRow = (exercise: Exercise): TemplateExerciseInput => {
  const fields = exerciseFields(exercise.category);
  return {
    exerciseId: exercise.id,
    position: 0,
    targetSets: fields.sets ? 3 : 1,
    targetRepsMin: fields.reps ? 8 : null,
    targetRepsMax: fields.reps ? 12 : null,
    // Cardio and mobility default to 30 minutes.
    targetSeconds: fields.time ? 1800 : null,
    restSec: fields.rest ? 90 : 0,
    notes: '',
  };
};

function TemplateSheet({
  template,
  onClose,
}: {
  template: WorkoutTemplate | null;
  onClose: () => void;
}) {
  const templates = useTemplates();
  const exercises = useExercises();
  const toast = useToast();

  const [form, setForm] = useState<Omit<WorkoutTemplateInput, 'exercises'>>(() => ({
    name: template?.name ?? '',
    kind: template?.kind ?? 'strength',
    warmup: template?.warmup ?? '',
    cooldown: template?.cooldown ?? '',
    notes: template?.notes ?? '',
  }));

  const [rows, setRows] = useState<TemplateExerciseInput[]>(
    () =>
      template?.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        position: exercise.position,
        targetSets: exercise.targetSets,
        targetRepsMin: exercise.targetRepsMin,
        targetRepsMax: exercise.targetRepsMax,
        targetSeconds: exercise.targetSeconds,
        restSec: exercise.restSec,
        notes: exercise.notes,
      })) ?? [],
  );

  const available = exercises.list.data ?? [];
  const byId = useMemo(
    () => new Map(available.map((exercise) => [exercise.id, exercise])),
    [available],
  );

  const move = (index: number, delta: number) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    setRows(next);
  };

  const updateRow = (index: number, patch: Partial<TemplateExerciseInput>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast('Укажите название', 'error');
      return;
    }

    /*
     * Saving replaces the whole content of a template. If it had exercises and
     * the list is now empty, that is almost certainly not what was meant, so we
     * ask: there would be nothing to restore it from afterwards.
     */
    const hadExercises = (template?.exercises.length ?? 0) > 0;
    if (hadExercises && rows.length === 0) {
      const ok = window.confirm(
        `В шаблоне «${form.name}» было ${template?.exercises.length} упр., ` +
          'а сейчас список пуст. Сохранить пустой шаблон?',
      );
      if (!ok) return;
    }

    const payload: WorkoutTemplateInput = {
      ...form,
      exercises: rows.map((row, index) => ({ ...row, position: index })),
    };
    try {
      if (template) {
        await templates.update.mutateAsync({ id: template.id, body: payload });
      } else {
        await templates.create.mutateAsync(payload);
      }
      toast('Сохранено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  const pending = templates.create.isPending || templates.update.isPending;

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={template ? 'Изменить шаблон' : 'Новый шаблон'}
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
          <Input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Силовая A"
          />
        </Field>

        <Field label="Тип">
          <Segmented
            value={form.kind}
            options={workoutKinds.map((value) => ({ value, label: workoutKindLabels[value] }))}
            onChange={(kind) => setForm({ ...form, kind })}
          />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-muted">Упражнения</span>
            {/* An empty picker explains nothing: point at the place where
                exercises are created instead of a list with no options. */}
            {available.length === 0 ? (
              <Link
                to="/reference/workouts?tab=exercises"
                className="text-[13px] font-medium text-accent"
              >
                Завести упражнения →
              </Link>
            ) : (
              <Select
                value=""
                onChange={(event) => {
                  if (event.target.value === '') return;
                  const picked = byId.get(Number(event.target.value));
                  if (picked) setRows([...rows, emptyRow(picked)]);
                }}
                className="w-auto text-[13px]"
              >
                <option value="">+ добавить упражнение</option>
                <ExerciseOptions exercises={available} />
              </Select>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-muted">
              {available.length === 0
                ? 'Каталог упражнений пуст — сначала заведите упражнения на соседней вкладке. Пустой шаблон тоже сохранится: он подойдёт для дня отдыха.'
                : 'Без упражнений — подойдёт для дня отдыха.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row, index) => {
                const info = byId.get(row.exerciseId);
                // The exercise type decides which fields to show.
                const fields = exerciseFields(info?.category ?? 'strength');

                return (
                <li key={`${row.exerciseId}-${index}`} className="rounded-xl border border-border p-3">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {info?.name ?? 'Упражнение удалено'}
                    </span>
                    <div className="flex shrink-0 gap-0.5">
                      <IconButton
                        label="Выше"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        label="Ниже"
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton
                        label="Убрать"
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {fields.sets ? (
                      <Field label="Подходы">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={row.targetSets}
                          onChange={(event) =>
                            updateRow(index, { targetSets: Number(event.target.value) || 1 })
                          }
                        />
                      </Field>
                    ) : null}

                    {fields.reps ? (
                      <>
                        <Field label="Повт. от">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={row.targetRepsMin ?? ''}
                            onChange={(event) =>
                              updateRow(index, {
                                targetRepsMin:
                                  event.target.value === '' ? null : Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                        <Field label="Повт. до">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={row.targetRepsMax ?? ''}
                            onChange={(event) =>
                              updateRow(index, {
                                targetRepsMax:
                                  event.target.value === '' ? null : Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                      </>
                    ) : null}

                    {fields.time ? (
                      <Field label="Время, мин">
                        <Input
                          type="number"
                          inputMode="numeric"
                          step={5}
                          value={secondsToMinutes(row.targetSeconds)}
                          onChange={(event) =>
                            updateRow(index, {
                              targetSeconds: minutesToSeconds(event.target.value),
                            })
                          }
                        />
                      </Field>
                    ) : null}

                    {fields.rest ? (
                      <Field label="Отдых, сек">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={row.restSec}
                          onChange={(event) =>
                            updateRow(index, { restSec: Number(event.target.value) || 0 })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>

                  <Field label="Заметка" className="mt-2">
                    <Input
                      value={row.notes}
                      onChange={(event) => updateRow(index, { notes: event.target.value })}
                      placeholder="на каждую ногу, медленно…"
                    />
                  </Field>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field label="Разминка">
          <Textarea
            value={form.warmup}
            onChange={(event) => setForm({ ...form, warmup: event.target.value })}
            className="min-h-20"
          />
        </Field>
        <Field label="Заминка">
          <Textarea
            value={form.cooldown}
            onChange={(event) => setForm({ ...form, cooldown: event.target.value })}
            className="min-h-20"
          />
        </Field>
        <Field label="Заметки">
          <Textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            className="min-h-20"
          />
        </Field>
      </div>
    </Sheet>
  );
}

/* -------------------------------- Exercises ------------------------------- */

const emptyExercise: ExerciseInput = {
  name: '',
  category: 'strength',
  muscleGroup: 'none',
  equipment: '',
  notes: '',
};

function Exercises() {
  const exercises = useExercises();
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | Exercise['category']>('all');
  const [muscle, setMuscle] = useState<'all' | Exercise['muscleGroup']>('all');
  const toast = useToast();

  const empty = exercises.list.data !== undefined && exercises.list.data.length === 0;

  const filtered = useMemo(() => {
    const list = exercises.list.data ?? [];
    const needle = query.trim().toLowerCase();
    return list.filter((exercise) => {
      if (category !== 'all' && exercise.category !== category) return false;
      if (muscle !== 'all' && exercise.muscleGroup !== muscle) return false;
      if (!needle) return true;
      return (
        exercise.name.toLowerCase().includes(needle) ||
        exercise.equipment.toLowerCase().includes(needle) ||
        exercise.notes.toLowerCase().includes(needle)
      );
    });
  }, [exercises.list.data, query, category, muscle]);

  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const exercise of filtered) {
      const list = map.get(exercise.category) ?? [];
      list.push(exercise);
      map.set(exercise.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <>
      {/* While the catalogue is empty the only way in is the button in the
          empty state: two identical buttons on one screen is a choice that
          is not one. */}
      {empty ? null : (
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Поиск по названию, инвентарю, заметке"
              className="flex-1"
            />
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} />
              Упражнение
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as typeof category)}
              className="sm:w-48"
            >
              <option value="all">Все типы</option>
              {exerciseCategories.map((value) => (
                <option key={value} value={value}>
                  {exerciseCategoryLabels[value]}
                </option>
              ))}
            </Select>
            <Select
              value={muscle}
              onChange={(event) => setMuscle(event.target.value as typeof muscle)}
              className="sm:w-48"
            >
              <option value="all">Все группы мышц</option>
              {muscleGroups.map((value) => (
                <option key={value} value={value}>
                  {muscleGroupLabels[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {exercises.list.isPending ? <Spinner /> : null}
      {exercises.list.isError ? (
        <ErrorState error={exercises.list.error} onRetry={() => void exercises.list.refetch()} />
      ) : null}

      {exercises.list.data && filtered.length === 0 ? (
        <EmptyState
          title={empty ? 'Упражнений пока нет' : 'Ничего не найдено'}
          description={
            empty
              ? 'Добавьте упражнения — из них собираются шаблоны тренировок.'
              : 'Попробуйте другой запрос или снимите фильтры.'
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

      <div className="flex flex-col gap-4">
        {exerciseCategories.map((group) => {
          const list = grouped.get(group) ?? [];
          if (list.length === 0) return null;

          return (
            <Card key={group} padded={false}>
              <h3 className="px-4 pt-3.5 text-[13px] font-semibold text-muted">
                {exerciseCategoryLabels[group]}
              </h3>
              <ul className="mt-1 divide-y divide-border">
                {list.map((exercise) => (
                  <li key={exercise.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{exercise.name}</p>
                      <p className="text-[12px] text-muted">
                        {muscleGroupLabels[exercise.muscleGroup]}
                        {exercise.equipment ? ` · ${exercise.equipment}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <IconButton label="Изменить" onClick={() => setEditing(exercise)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        label="В архив"
                        onClick={async () => {
                          try {
                            await exercises.remove.mutateAsync(exercise.id);
                          } catch (error) {
                            toast(error instanceof Error ? error.message : 'Ошибка', 'error');
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {editing ? (
        <ExerciseSheet
          exercise={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ExerciseSheet({
  exercise,
  onClose,
}: {
  exercise: Exercise | null;
  onClose: () => void;
}) {
  const exercises = useExercises();
  const toast = useToast();
  const [form, setForm] = useState<ExerciseInput>(() =>
    exercise
      ? {
          name: exercise.name,
          category: exercise.category,
          muscleGroup: exercise.muscleGroup,
          equipment: exercise.equipment,
          notes: exercise.notes,
        }
      : emptyExercise,
  );

  const submit = async () => {
    if (!form.name.trim()) {
      toast('Укажите название', 'error');
      return;
    }
    try {
      if (exercise) {
        await exercises.update.mutateAsync({ id: exercise.id, body: form });
      } else {
        await exercises.create.mutateAsync(form);
      }
      toast('Сохранено');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={exercise ? 'Изменить упражнение' : 'Новое упражнение'}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            loading={exercises.create.isPending || exercises.update.isPending}
            onClick={() => void submit()}
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
          />
        </Field>

        <Field label="Тип">
          <Segmented
            value={form.category}
            options={exerciseCategories.map((value) => ({
              value,
              label: exerciseCategoryLabels[value],
            }))}
            onChange={(category) => setForm({ ...form, category })}
          />
        </Field>

        <Field label="Группа мышц" hint="Нужна для графика объёма по группам">
          <Select
            value={form.muscleGroup}
            onChange={(event) =>
              setForm({ ...form, muscleGroup: event.target.value as ExerciseInput['muscleGroup'] })
            }
          >
            {muscleGroups.map((value) => (
              <option key={value} value={value}>
                {muscleGroupLabels[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Инвентарь">
          <Input
            value={form.equipment}
            onChange={(event) => setForm({ ...form, equipment: event.target.value })}
            placeholder="Резинка, гантели…"
          />
        </Field>

        <Field label="Техника, заметки">
          <Textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
