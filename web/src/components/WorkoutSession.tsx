import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Timer, Trash2, X } from 'lucide-react';
import type { PlannedExercise, WorkoutLog } from '@shared/index';
import { exerciseFields, workoutStatusLabels } from '@shared/index';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  IconButton,
  Input,
  NumberStepper,
  Segmented,
  Sheet,
  cx,
  useToast,
} from './ui';
import { useAddSet, useDeleteSet, useLastSession, usePatchWorkout } from '../lib/queries';
import { formatDuration, formatSeconds, formatTarget, num } from '../lib/format';

/* ---------------------------------- Timer --------------------------------- */

/** A rest timer between sets, so the pause is not tracked in your head. */
function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (left <= 0) {
      doneRef.current();
      return;
    }
    const id = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  const pct = seconds > 0 ? ((seconds - left) / seconds) * 100 : 100;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-4 lg:bottom-6">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
        <Timer size={18} className="text-accent" />
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium">Отдых</span>
            <span className="text-base font-semibold tabular-nums">{formatDuration(left)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <IconButton label="Пропустить отдых" onClick={() => setLeft(0)}>
          <X size={18} />
        </IconButton>
      </div>
    </div>
  );
}

/* -------------------------------- Set entry ------------------------------- */

function AddSetSheet({
  workoutId,
  planned,
  onClose,
  onAdded,
}: {
  workoutId: number;
  planned: PlannedExercise;
  onClose: () => void;
  onAdded: (restSec: number) => void;
}) {
  const addSet = useAddSet();
  const toast = useToast();
  const last = useLastSession(planned.exerciseId);

  // The exercise decides which fields to show: cardio gets time only.
  const fields = exerciseFields(planned.exerciseCategory);
  const [weight, setWeight] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(planned.targetRepsMax ?? null);
  const [seconds, setSeconds] = useState<number | null>(planned.targetSeconds);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [band, setBand] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [isWarmup, setIsWarmup] = useState(false);

  // Prefill from the last working set: that is almost always the starting point.
  useEffect(() => {
    const sets = last.data?.sets ?? [];
    const best = sets.at(-1);
    if (best && weight === null) {
      setWeight(best.weightKg);
      if (best.reps !== null) setReps(best.reps);
    }
  }, [last.data, weight]);

  const submit = async () => {
    try {
      await addSet.mutateAsync({
        workoutId,
        body: {
          exerciseId: planned.exerciseId,
          reps: fields.reps ? reps : null,
          weightKg: fields.weight ? weight : null,
          seconds: fields.time ? seconds : null,
          distanceKm: fields.distance ? distanceKm : null,
          band: fields.band ? band.trim() : '',
          rpe,
          isWarmup,
          completed: true,
        },
      });
      onClose();
      if (!isWarmup && planned.restSec > 0) onAdded(planned.restSec);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось записать подход', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={planned.exerciseName}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => void submit()} loading={addSet.isPending}>
            Записать подход
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <Badge tone="accent">План: {formatTarget(planned)}</Badge>
          {planned.restSec > 0 ? <Badge>Отдых {planned.restSec} сек</Badge> : null}
          {last.data?.date ? <span>Прошлый раз: {last.data.date}</span> : null}
        </div>

        {planned.notes ? <p className="text-[13px] text-muted">{planned.notes}</p> : null}

        {fields.weight ? (
          <Field label="Вес, кг" hint="Оставьте пустым для упражнений с весом тела">
            <NumberStepper value={weight} onChange={setWeight} step={2.5} max={500} suffix="кг" />
          </Field>
        ) : null}

        {fields.time ? (
          <Field label="Время, мин">
            {/* Seconds in the database, minutes in the field: easier to type. */}
            <NumberStepper
              value={seconds === null ? null : Math.round(seconds / 60)}
              onChange={(value) => setSeconds(value === null ? null : Math.round(value * 60))}
              step={5}
              max={600}
              suffix="мин"
            />
          </Field>
        ) : null}

        {fields.distance ? (
          <Field label="Дистанция, км" hint="Необязательно — нужна для графика кардио">
            <Input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0}
              value={distanceKm ?? ''}
              onChange={(event) =>
                setDistanceKm(event.target.value === '' ? null : Number(event.target.value))
              }
            />
          </Field>
        ) : null}

        {fields.reps ? (
          <Field label="Повторы">
            <NumberStepper value={reps} onChange={setReps} step={1} max={200} />
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {fields.band ? (
            <Field label="Резинка / инвентарь">
              <Input
                value={band}
                onChange={(event) => setBand(event.target.value)}
                placeholder="например, красная"
              />
            </Field>
          ) : null}
          <Field label="RPE" hint="1–10, необязательно">
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={10}
              step={0.5}
              value={rpe ?? ''}
              onChange={(event) =>
                setRpe(event.target.value === '' ? null : Number(event.target.value))
              }
            />
          </Field>
        </div>

        {/* A warm-up set only makes sense where sets exist at all: it merely
            excludes the row from tonnage, and cardio has no tonnage. */}
        {fields.sets ? (
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={isWarmup} onChange={setIsWarmup} label="Разминочный подход" />
            Разминочный подход
            <span className="text-[12px] text-muted">(не идёт в тоннаж)</span>
          </label>
        ) : null}
      </div>
    </Sheet>
  );
}

/* --------------------------------- Session -------------------------------- */

export function WorkoutSession({
  workout,
  editable,
}: {
  workout: WorkoutLog;
  editable: boolean;
}) {
  const patchWorkout = usePatchWorkout();
  const deleteSet = useDeleteSet();
  const toast = useToast();

  const [adding, setAdding] = useState<PlannedExercise | null>(null);
  const [rest, setRest] = useState<{ seconds: number; key: number } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const setsByExercise = useMemo(() => {
    const map = new Map<number, typeof workout.sets>();
    for (const set of workout.sets) {
      const list = map.get(set.exerciseId) ?? [];
      list.push(set);
      map.set(set.exerciseId, list);
    }
    return map;
  }, [workout.sets]);

  /** Exercises added on the fly, outside the template, must show up too. */
  const extraExercises = useMemo(() => {
    const plannedIds = new Set(workout.planned.map((item) => item.exerciseId));
    const seen = new Map<number, { name: string; category: PlannedExercise['exerciseCategory'] }>();
    for (const set of workout.sets) {
      if (!plannedIds.has(set.exerciseId)) {
        seen.set(set.exerciseId, { name: set.exerciseName, category: set.exerciseCategory });
      }
    }
    return [...seen.entries()].map(([exerciseId, { name, category }]) => ({
      exerciseId,
      exerciseName: name,
      exerciseCategory: category,
      position: 999,
      targetSets: 0,
      targetRepsMin: null,
      targetRepsMax: null,
      targetSeconds: null,
      restSec: 90,
      notes: '',
    })) satisfies PlannedExercise[];
  }, [workout.planned, workout.sets]);

  const allExercises = [...workout.planned, ...extraExercises];

  /**
   * Cardio totals, the same figure that reaches the chart: a sum over recorded
   * sets, or the total stored on the session when there are none.
   */
  const cardio = useMemo(() => {
    const cardioIds = new Set(
      allExercises.filter((item) => item.exerciseCategory === 'cardio').map((i) => i.exerciseId),
    );
    let seconds = 0;
    let km = 0;
    for (const set of workout.sets) {
      if (!set.completed || !cardioIds.has(set.exerciseId)) continue;
      seconds += set.seconds ?? 0;
      km += set.distanceKm ?? 0;
    }
    if (seconds === 0 && km === 0) {
      const whole = { min: workout.durationMin ?? 0, km: workout.distanceKm ?? 0 };
      return whole.min === 0 && whole.km === 0 ? null : whole;
    }
    return { min: Math.round(seconds / 60), km };
    // allExercises is rebuilt from these same two lists.
  }, [workout.planned, workout.sets, workout.durationMin, workout.distanceKm]);

  const tonnage = workout.sets.reduce(
    (sum, set) =>
      set.completed && !set.isWarmup ? sum + (set.weightKg ?? 0) * (set.reps ?? 0) : sum,
    0,
  );

  const setStatus = async (status: WorkoutLog['status']) => {
    try {
      await patchWorkout.mutateAsync({ id: workout.id, patch: { status } });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось изменить статус', 'error');
    }
  };

  return (
    <Card>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">
              {workout.name}
            </h2>
            <Badge
              tone={
                workout.status === 'done'
                  ? 'success'
                  : workout.status === 'skipped'
                    ? 'danger'
                    : 'neutral'
              }
            >
              {workoutStatusLabels[workout.status]}
            </Badge>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">
            {workout.sets.length > 0
              ? `Подходов: ${workout.sets.length}${tonnage > 0 ? ` · тоннаж ${num(tonnage, 0)} кг` : ''}`
              : 'Подходы ещё не записаны'}
            {cardio
              ? ` · кардио ${cardio.min} мин${cardio.km > 0 ? ` · ${num(cardio.km)} км` : ''}`
              : ''}
          </p>
        </div>

        {editable ? (
          <Segmented
            value={workout.status}
            options={[
              { value: 'planned', label: 'План' },
              { value: 'done', label: 'Сделал' },
              { value: 'skipped', label: 'Пропустил' },
            ]}
            onChange={(value) => void setStatus(value)}
          />
        ) : null}
      </header>

      {workout.warmup || workout.cooldown || workout.notes ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="text-[13px] font-medium text-accent"
          >
            {showDetails ? 'Скрыть разминку и заметки' : 'Разминка, заминка, заметки'}
          </button>
          {showDetails ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px]">
              {workout.warmup ? (
                <p>
                  <span className="font-medium">Разминка. </span>
                  {workout.warmup}
                </p>
              ) : null}
              {workout.notes ? (
                <p>
                  <span className="font-medium">Заметки. </span>
                  {workout.notes}
                </p>
              ) : null}
              {workout.cooldown ? (
                <p>
                  <span className="font-medium">Заминка. </span>
                  {workout.cooldown}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {allExercises.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">
          В шаблоне нет упражнений — это день отдыха.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {allExercises.map((planned) => {
            const sets = setsByExercise.get(planned.exerciseId) ?? [];
            const workingSets = sets.filter((set) => !set.isWarmup).length;
            const complete = planned.targetSets > 0 && workingSets >= planned.targetSets;

            return (
              <li
                key={planned.exerciseId}
                className="rounded-xl border border-border bg-surface-2/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{planned.exerciseName}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {planned.targetSets > 0 ? formatTarget(planned) : 'Вне плана'}
                      {planned.targetSets > 0 ? ` · сделано ${workingSets}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {complete ? (
                      <span className="text-success">
                        <Check size={18} strokeWidth={2.5} />
                      </span>
                    ) : null}
                    {editable ? (
                      <Button size="sm" onClick={() => setAdding(planned)}>
                        <Plus size={15} />
                        Подход
                      </Button>
                    ) : null}
                  </div>
                </div>

                {sets.length > 0 ? (
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {sets.map((set, index) => (
                      <li key={set.id}>
                        <div
                          className={cx(
                            'group flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] tabular-nums',
                            set.isWarmup
                              ? 'bg-surface text-muted ring-1 ring-border ring-inset'
                              : 'bg-accent-soft text-accent',
                          )}
                        >
                          <span className="font-semibold">{index + 1}.</span>
                          <span>
                            {set.weightKg !== null ? `${num(set.weightKg)} кг` : ''}
                            {set.weightKg !== null && (set.reps !== null || set.seconds !== null)
                              ? ' × '
                              : ''}
                            {set.reps !== null ? set.reps : ''}
                            {set.seconds !== null ? formatSeconds(set.seconds) : ''}
                            {set.distanceKm !== null
                              ? `${set.seconds !== null ? ' · ' : ''}${num(set.distanceKm)} км`
                              : ''}
                          </span>
                          {set.rpe !== null ? (
                            <span className="opacity-70">RPE {num(set.rpe)}</span>
                          ) : null}
                          {editable ? (
                            <button
                              type="button"
                              aria-label="Удалить подход"
                              onClick={() => void deleteSet.mutateAsync(set.id)}
                              className="ml-0.5 opacity-40 transition-opacity hover:opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <AddSetSheet
          workoutId={workout.id}
          planned={adding}
          onClose={() => setAdding(null)}
          onAdded={(seconds) => setRest({ seconds, key: Date.now() })}
        />
      ) : null}

      {rest ? (
        <RestTimer key={rest.key} seconds={rest.seconds} onDone={() => setRest(null)} />
      ) : null}
    </Card>
  );
}

