import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Plus, Trash2 } from 'lucide-react';
import type { MeasurementInput } from '@shared/index';
import { measurementFieldLabels, measurementFields } from '@shared/index';
import { PageHeader } from '../components/Layout';
import {
  Button,
  Card,
  CardTitle,
  ErrorState,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Sheet,
  Spinner,
  Stat,
  Textarea,
  useToast,
} from '../components/ui';
import {
  ChartCard,
  ChartLegend,
  ChartTooltip,
  axisProps,
  chartColors,
  gridProps,
  tickDate,
  useSeriesToggle,
} from '../components/charts';
import {
  useExerciseProgress,
  useMeasurements,
  useMetricExercises,
  useMetrics,
} from '../lib/queries';
import { addDays, formatDate, num, signed, today } from '../lib/format';

type RangeKey = '30' | '90' | '365';

export default function ProgressPage() {
  const [range, setRange] = useState<RangeKey>('90');
  const to = today();
  const from = addDays(to, -(Number(range) - 1));

  const metrics = useMetrics(from, to);
  const [addingMeasure, setAddingMeasure] = useState(false);

  // Each chart remembers its own hidden series, toggled from the legend.
  const weightSeries = useSeriesToggle();
  const bodySeries = useSeriesToggle();
  const kcalSeries = useSeriesToggle();
  const proteinSeries = useSeriesToggle();
  const cardioSeries = useSeriesToggle();

  /** Average planned protein over the last week, the baseline for the actuals. */
  const plannedProtein = useMemo(() => {
    const last7 = (metrics.data?.nutrition ?? []).slice(-7).filter((p) => p.plannedProteinG > 0);
    if (last7.length === 0) return null;
    return last7.reduce((sum, p) => sum + p.plannedProteinG, 0) / last7.length;
  }, [metrics.data]);

  return (
    <>
      <PageHeader
        title="Прогресс"
        subtitle="Замеры, питание и тренировочный объём"
        action={
          <Segmented
            value={range}
            options={[
              { value: '30', label: '30 дн' },
              { value: '90', label: '90 дн' },
              { value: '365', label: 'год' },
            ]}
            onChange={setRange}
          />
        }
      />

      {metrics.isPending ? <Spinner /> : null}
      {metrics.isError ? (
        <ErrorState error={metrics.error} onRetry={() => void metrics.refetch()} />
      ) : null}

      {metrics.data ? (
        <div className="flex flex-col gap-4">
          {/* Headline figures: the first thing worth seeing. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              label="Вес сейчас"
              value={metrics.data.kpi.currentWeightKg === null ? '—' : `${num(metrics.data.kpi.currentWeightKg)} кг`}
              hint={
                metrics.data.kpi.weightDelta30 === null
                  ? 'нет данных за месяц'
                  : `${signed(metrics.data.kpi.weightDelta30)} кг за 30 дней`
              }
              tone={
                metrics.data.kpi.weightDelta30 === null
                  ? 'neutral'
                  : metrics.data.kpi.weightDelta30 < 0
                    ? 'success'
                    : metrics.data.kpi.weightDelta30 > 0
                      ? 'warn'
                      : 'neutral'
              }
            />
            <Stat
              label="Белок, 7 дней"
              value={metrics.data.kpi.avgProtein7 === null ? '—' : num(metrics.data.kpi.avgProtein7, 0)}
              hint={plannedProtein === null ? 'плана нет' : `по плану ${num(plannedProtein, 0)} г`}
              tone={
                metrics.data.kpi.avgProtein7 !== null &&
                plannedProtein !== null &&
                metrics.data.kpi.avgProtein7 >= plannedProtein * 0.9
                  ? 'success'
                  : 'warn'
              }
            />
            <Stat
              label="Тренировок"
              value={metrics.data.kpi.workoutsLast28}
              hint="за последние 28 дней"
            />
            <Stat
              label="Серия"
              value={metrics.data.kpi.streakDays}
              hint="дней подряд ≥80% плана"
              tone={metrics.data.kpi.streakDays > 0 ? 'success' : 'neutral'}
            />
          </div>

          {/* 1. Weight and waist: the primary chart. */}
          <ChartCard
            title="Вес и талия"
            hint="Пунктир — скользящее среднее веса за 7 дней: дневные скачки ±1,5 кг скрывают тренд. Клик по легенде убирает линию"
            isEmpty={metrics.data.measurements.length === 0}
            emptyText="Внесите первый замер — график появится сразу."
            height={260}
            action={
              <Button size="sm" onClick={() => setAddingMeasure(true)}>
                <Plus size={15} />
                Замер
              </Button>
            }
          >
            <LineChart data={metrics.data.measurements} margin={{ left: -18, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={tickDate} {...axisProps} />
              <YAxis yAxisId="kg" domain={['auto', 'auto']} {...axisProps} />
              <YAxis
                yAxisId="cm"
                orientation="right"
                domain={['auto', 'auto']}
                hide={weightSeries.isHidden('waistCm')}
                {...axisProps}
              />
              <Tooltip
                content={<ChartTooltip units={{ weightKg: 'кг', weightMa7: 'кг', waistCm: 'см' }} />}
              />
              <Legend content={<ChartLegend toggle={weightSeries} />} />
              <Line
                yAxisId="kg"
                dataKey="weightKg"
                hide={weightSeries.isHidden('weightKg')}
                name="Вес"
                stroke={chartColors.accent}
                strokeWidth={1.5}
                dot={{ r: 2 }}
                connectNulls
              />
              <Line
                yAxisId="kg"
                dataKey="weightMa7"
                hide={weightSeries.isHidden('weightMa7')}
                name="Вес, среднее 7 дн"
                stroke={chartColors.accent}
                strokeWidth={2.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls
              />
              <Line
                yAxisId="cm"
                dataKey="waistCm"
                hide={weightSeries.isHidden('waistCm')}
                name="Талия"
                stroke={chartColors.warn}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ChartCard>

          {/* 2. Body composition */}
          <ChartCard
            title="Состав тела"
            isEmpty={metrics.data.measurements.every(
              (point) => point.fatPct === null && point.muscleKg === null && point.visceral === null,
            )}
            emptyText="Заполните % жира, мышечную массу или висцеральный жир в замере."
          >
            <LineChart data={metrics.data.measurements} margin={{ left: -18, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={tickDate} {...axisProps} />
              <YAxis domain={['auto', 'auto']} {...axisProps} />
              <Tooltip
                content={<ChartTooltip units={{ fatPct: '%', muscleKg: 'кг', visceral: 'ур.' }} />}
              />
              <Legend content={<ChartLegend toggle={bodySeries} />} />
              <Line
                dataKey="fatPct"
                hide={bodySeries.isHidden('fatPct')}
                name="% жира"
                stroke={chartColors.warn}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
              <Line
                dataKey="muscleKg"
                hide={bodySeries.isHidden('muscleKg')}
                name="Мышцы, кг"
                stroke={chartColors.success}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
              <Line
                dataKey="visceral"
                hide={bodySeries.isHidden('visceral')}
                name="Висцеральный"
                stroke={chartColors.muted}
                strokeWidth={1.5}
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ChartCard>

          {/* 3. Calories and protein by day */}
          <ChartCard
            title="Калории по дням"
            hint="Линия — план на этот день: он и есть цель"
            isEmpty={metrics.data.nutrition.length === 0}
            emptyText="Отмечайте приёмы пищи — здесь появятся столбцы по дням."
          >
            <ComposedChart data={metrics.data.nutrition} margin={{ left: -18, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={tickDate} {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--c-surface-2)' }}
                content={<ChartTooltip units={{ kcal: 'ккал', plannedKcal: 'ккал' }} />}
              />
              <Legend content={<ChartLegend toggle={kcalSeries} />} />
              <Bar
                dataKey="kcal"
                hide={kcalSeries.isHidden('kcal')}
                name="Получено"
                radius={[4, 4, 0, 0]}
              >
                {metrics.data.nutrition.map((point) => (
                  <Cell
                    key={point.date}
                    // Overshooting is coloured differently: under and over are different problems.
                    fill={
                      point.plannedKcal > 0 && point.kcal > point.plannedKcal * 1.08
                        ? chartColors.warn
                        : chartColors.accent
                    }
                  />
                ))}
              </Bar>
              <Line
                type="stepAfter"
                dataKey="plannedKcal"
                hide={kcalSeries.isHidden('plannedKcal')}
                name="План"
                stroke={chartColors.muted}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ChartCard>

          <ChartCard
            title="Белок по дням"
            isEmpty={metrics.data.nutrition.length === 0}
            emptyText="Отмечайте приёмы пищи — здесь появятся столбцы по дням."
          >
            <ComposedChart data={metrics.data.nutrition} margin={{ left: -18, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tickFormatter={tickDate} {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--c-surface-2)' }}
                content={<ChartTooltip units={{ proteinG: 'г', plannedProteinG: 'г' }} />}
              />
              <Legend content={<ChartLegend toggle={proteinSeries} />} />
              <Bar
                dataKey="proteinG"
                hide={proteinSeries.isHidden('proteinG')}
                name="Получено"
                fill={chartColors.success}
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="stepAfter"
                dataKey="plannedProteinG"
                hide={proteinSeries.isHidden('plannedProteinG')}
                name="План"
                stroke={chartColors.muted}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ChartCard>

          {/* 4. Plan adherence by week */}
          <ChartCard
            title="Соблюдение плана по неделям"
            isEmpty={metrics.data.weeks.length === 0}
            emptyText="Появится, как только наберётся хотя бы одна неделя данных."
          >
            <BarChart data={metrics.data.weeks} margin={{ left: -18, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis domain={[0, 100]} unit="%" {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--c-surface-2)' }}
                content={<ChartTooltip units={{ adherencePct: '%' }} />}
              />
              <Bar dataKey="adherencePct" name="Выполнено" radius={[4, 4, 0, 0]}>
                {metrics.data.weeks.map((week) => (
                  <Cell
                    key={week.weekStart}
                    fill={week.adherencePct >= 80 ? chartColors.success : chartColors.warn}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>

          {/* 5. Training volume */}
          <ChartCard
            title="Тренировочный объём по неделям"
            hint="Тоннаж = сумма вес × повторы по рабочим подходам"
            isEmpty={metrics.data.weeks.every((week) => week.tonnageKg === 0)}
            emptyText="Записывайте подходы с весом — тоннаж посчитается сам."
          >
            <BarChart data={metrics.data.weeks} margin={{ left: -8, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--c-surface-2)' }}
                content={<ChartTooltip units={{ tonnageKg: 'кг' }} />}
              />
              <Bar
                dataKey="tonnageKg"
                name="Тоннаж"
                fill={chartColors.accent}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartCard>

          {/* 6. Volume by muscle group */}
          <ChartCard
            title="Объём по группам мышц"
            isEmpty={metrics.data.muscleVolume.length === 0}
            emptyText="Проставьте группы мышц у упражнений и запишите подходы."
            height={Math.max(180, metrics.data.muscleVolume.length * 38 + 40)}
          >
            <BarChart
              data={metrics.data.muscleVolume}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 4 }}
            >
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="label" width={92} {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--c-surface-2)' }}
                content={<ChartTooltip units={{ tonnageKg: 'кг' }} />}
              />
              <Bar
                dataKey="tonnageKg"
                name="Тоннаж"
                fill={chartColors.accent}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartCard>

          {/* 7. Cardio */}
          <ChartCard
            title="Кардио по неделям"
            isEmpty={metrics.data.weeks.every((week) => week.cardioKm === 0 && week.cardioMin === 0)}
            emptyText="Запишите подходы кардио или впишите дистанцию и длительность в тренировке."
          >
            <BarChart data={metrics.data.weeks} margin={{ left: -18, right: 8, top: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis yAxisId="km" hide={cardioSeries.isHidden('cardioKm')} {...axisProps} />
              <YAxis
                yAxisId="min"
                orientation="right"
                hide={cardioSeries.isHidden('cardioMin')}
                {...axisProps}
              />
              <Tooltip
                cursor={{ fill: 'var(--c-surface-2)' }}
                content={<ChartTooltip units={{ cardioKm: 'км', cardioMin: 'мин' }} />}
              />
              <Legend content={<ChartLegend toggle={cardioSeries} />} />
              <Bar
                yAxisId="km"
                dataKey="cardioKm"
                hide={cardioSeries.isHidden('cardioKm')}
                name="Дистанция"
                fill={chartColors.accent}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="min"
                dataKey="cardioMin"
                hide={cardioSeries.isHidden('cardioMin')}
                name="Минуты"
                fill={chartColors.muted}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartCard>

          {/* 8. Progress for one exercise */}
          <ExerciseProgressCard from={from} to={to} />

          {/* Measurements as a list */}
          <MeasurementHistory />
        </div>
      ) : null}

      {addingMeasure ? <MeasurementSheet onClose={() => setAddingMeasure(false)} /> : null}
    </>
  );
}

/* ------------------------ Progress for one exercise ------------------------ */

function ExerciseProgressCard({ from, to }: { from: string; to: string }) {
  const list = useMetricExercises();
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const series = useSeriesToggle();

  const effectiveId = exerciseId ?? list.data?.[0]?.id ?? null;
  const progress = useExerciseProgress(effectiveId, from, to);

  return (
    <ChartCard
      title="Прогрессия по упражнению"
      hint="1ПМ — оценка по формуле Эпли: вес × (1 + повторы / 30)"
      isEmpty={(list.data?.length ?? 0) === 0 || (progress.data?.points.length ?? 0) === 0}
      emptyText="Запишите подходы с весом хотя бы в одной тренировке."
      action={
        (list.data?.length ?? 0) > 0 ? (
          <Select
            value={effectiveId ?? ''}
            onChange={(event) => setExerciseId(Number(event.target.value))}
            className="w-auto text-[13px]"
          >
            {(list.data ?? []).map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    >
      <LineChart data={progress.data?.points ?? []} margin={{ left: -18, right: 8, top: 4 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" tickFormatter={tickDate} {...axisProps} />
        <YAxis domain={['auto', 'auto']} {...axisProps} />
        <Tooltip
          content={<ChartTooltip units={{ estimated1rm: 'кг', topWeightKg: 'кг' }} />}
        />
        <Legend content={<ChartLegend toggle={series} />} />
        <Line
          dataKey="estimated1rm"
          hide={series.isHidden('estimated1rm')}
          name="Оценка 1ПМ"
          stroke={chartColors.accent}
          strokeWidth={2.5}
          dot={{ r: 2.5 }}
          connectNulls
        />
        <Line
          dataKey="topWeightKg"
          hide={series.isHidden('topWeightKg')}
          name="Рабочий вес"
          stroke={chartColors.success}
          strokeWidth={1.5}
          dot={{ r: 2 }}
          connectNulls
        />
      </LineChart>
    </ChartCard>
  );
}

/* ---------------------------- Measurement history ------------------------- */

function MeasurementHistory() {
  const measurements = useMeasurements();
  const toast = useToast();
  const rows = useMemo(
    () => [...(measurements.list.data ?? [])].reverse().slice(0, 20),
    [measurements.list.data],
  );

  if (rows.length === 0) return null;

  return (
    <Card padded={false}>
      <div className="px-4 pt-4 sm:px-5">
        <CardTitle>Последние замеры</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="border-y border-border text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-semibold sm:px-5">Дата</th>
              {(['weightKg', 'waistCm', 'fatPct', 'muscleKg'] as const).map((field) => (
                <th key={field} className="px-3 py-2 text-right font-semibold">
                  {measurementFieldLabels[field].label}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-2 sm:px-5">{formatDate(row.date)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(row.weightKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(row.waistCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(row.fatPct)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(row.muscleKg)}</td>
                <td className="px-2 py-1 text-right">
                  <IconButton
                    label="Удалить замер"
                    onClick={async () => {
                      try {
                        await measurements.remove.mutateAsync(row.id);
                        toast('Замер удалён');
                      } catch (error) {
                        toast(error instanceof Error ? error.message : 'Ошибка', 'error');
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ----------------------------- Measurement entry -------------------------- */

function MeasurementSheet({ onClose }: { onClose: () => void }) {
  const measurements = useMeasurements();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const submit = async () => {
    const payload: MeasurementInput = {
      date,
      weightKg: null,
      waistCm: null,
      chestCm: null,
      hipCm: null,
      bicepCm: null,
      fatPct: null,
      visceral: null,
      muscleKg: null,
      bmrKcal: null,
      notes,
    };

    let filled = 0;
    for (const field of measurementFields) {
      const raw = values[field];
      if (raw !== undefined && raw !== '') {
        payload[field] = Number(raw);
        filled += 1;
      }
    }

    if (filled === 0) {
      toast('Заполните хотя бы один показатель', 'error');
      return;
    }

    try {
      await measurements.save.mutateAsync(payload);
      toast('Замер сохранён');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось сохранить', 'error');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title="Новый замер"
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={measurements.save.isPending} onClick={() => void submit()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Дата" hint="Повторное сохранение за ту же дату обновит запись">
          <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} />
        </Field>

        <p className="text-[12px] text-muted">
          Заполните то, что мерили — пустые поля не сохраняются. Взвешиваться каждый день,
          а талию мерить раз в неделю — нормально.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {measurementFields.map((field) => (
            <Field
              key={field}
              label={`${measurementFieldLabels[field].label}, ${measurementFieldLabels[field].unit}`}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={values[field] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }
              />
            </Field>
          ))}
        </div>

        <Field label="Заметка">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20" />
        </Field>
      </div>
    </Sheet>
  );
}
