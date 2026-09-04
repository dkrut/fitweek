import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { workoutKindLabels } from '@shared/index';
import { PageHeader } from '../components/Layout';
import { Badge, Card, ErrorState, IconButton, ProgressBar, Spinner, cx } from '../components/ui';
import { useDays } from '../lib/queries';
import {
  addDays,
  formatDateShort,
  num,
  startOfWeek,
  today,
  weekdayShort,
} from '../lib/format';

export default function WeekPage() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today()));
  const weekEnd = addDays(weekStart, 6);

  const days = useDays(weekStart, weekEnd);

  const isCurrentWeek = weekStart === startOfWeek(today());

  return (
    <>
      <PageHeader
        title="Неделя"
        subtitle={`${formatDateShort(weekStart)} — ${formatDateShort(weekEnd)}`}
        action={
          <div className="flex items-center gap-1">
            <IconButton
              label="Предыдущая неделя"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
            >
              <ChevronLeft size={20} />
            </IconButton>
            {!isCurrentWeek ? (
              <button
                type="button"
                onClick={() => setWeekStart(startOfWeek(today()))}
                className="px-1 text-[13px] font-medium text-accent"
              >
                текущая
              </button>
            ) : null}
            <IconButton
              label="Следующая неделя"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
            >
              <ChevronRight size={20} />
            </IconButton>
          </div>
        }
      />

      {days.isPending ? <Spinner /> : null}
      {days.isError ? <ErrorState error={days.error} onRetry={() => void days.refetch()} /> : null}

      {days.data ? (
        <>
          <ul className="flex flex-col gap-2">
            {days.data.map((day) => {
              const isToday = day.date === today();
              const target = day.plannedKcal;

              return (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => navigate(`/day/${day.date}`)}
                    className={cx(
                      'w-full rounded-card border bg-surface p-3.5 text-left transition-colors',
                      'hover:border-muted/50 focus-visible:focus-ring',
                      isToday ? 'border-accent' : 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cx(
                          'flex size-11 shrink-0 flex-col items-center justify-center rounded-xl',
                          isToday ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted',
                        )}
                      >
                        <span className="text-[10px] font-semibold uppercase leading-none">
                          {weekdayShort(day.date)}
                        </span>
                        <span className="mt-0.5 text-[13px] font-semibold leading-none tabular-nums">
                          {formatDateShort(day.date).slice(0, 2)}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {day.workoutName ?? 'Без тренировки'}
                          </span>
                          {day.workoutKind ? (
                            <Badge
                              tone={
                                day.workoutStatus === 'done'
                                  ? 'success'
                                  : day.workoutKind === 'rest'
                                    ? 'neutral'
                                    : 'accent'
                              }
                            >
                              {workoutKindLabels[day.workoutKind]}
                            </Badge>
                          ) : null}
                          {!day.materialized ? <Badge>план</Badge> : null}
                        </div>

                        <div className="mt-1.5 flex items-center gap-3">
                          <ProgressBar value={day.completionPct} className="flex-1" />
                          <span className="shrink-0 text-[12px] tabular-nums text-muted">
                            {day.itemsDone}/{day.itemsTotal}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {num(day.kcal, 0)}
                          {target > 0 ? (
                            <span className="text-[11px] font-normal text-muted">/{target}</span>
                          ) : null}
                        </div>
                        <div className="text-[12px] tabular-nums text-success">
                          {num(day.proteinG, 0)} г
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <Card className="mt-4">
            <WeekSummary days={days.data} />
          </Card>
        </>
      ) : null}
    </>
  );
}

function WeekSummary({
  days,
}: {
  days: Array<{ kcal: number; proteinG: number; materialized: boolean; itemsDone: number; itemsTotal: number }>;
}) {
  // The average covers lived days only: future zeros would drag it down.
  const lived = days.filter((day) => day.materialized);
  const itemsTotal = lived.reduce((sum, day) => sum + day.itemsTotal, 0);
  const itemsDone = lived.reduce((sum, day) => sum + day.itemsDone, 0);
  const avgKcal = lived.length === 0 ? 0 : lived.reduce((s, d) => s + d.kcal, 0) / lived.length;
  const avgProtein =
    lived.length === 0 ? 0 : lived.reduce((s, d) => s + d.proteinG, 0) / lived.length;

  return (
    <dl className="grid grid-cols-3 gap-3 text-center">
      <div>
        <dt className="text-[12px] text-muted">Соблюдение</dt>
        <dd className="text-lg font-semibold tabular-nums">
          {itemsTotal === 0 ? '—' : `${Math.round((itemsDone / itemsTotal) * 100)}%`}
        </dd>
      </div>
      <div>
        <dt className="text-[12px] text-muted">Ккал в среднем</dt>
        <dd className="text-lg font-semibold tabular-nums">{num(avgKcal, 0)}</dd>
      </div>
      <div>
        <dt className="text-[12px] text-muted">Белок в среднем</dt>
        <dd className="text-lg font-semibold tabular-nums text-success">{num(avgProtein, 0)}</dd>
      </div>
    </dl>
  );
}
