import { useCallback, useState, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Card, CardTitle, EmptyState, cx } from './ui';
import { formatDateShort, num } from '../lib/format';

/** The chart palette comes from the same theme tokens as the rest of the UI. */
export const chartColors = {
  accent: 'var(--c-accent)',
  success: 'var(--c-success)',
  warn: 'var(--c-warn)',
  danger: 'var(--c-danger)',
  muted: 'var(--c-muted)',
  grid: 'var(--c-border)',
  surface: 'var(--c-surface)',
} as const;

export const axisProps = {
  stroke: 'var(--c-muted)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: 'var(--c-border)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

/** A wrapper: title, fixed height and an honest empty state. */
export function ChartCard({
  title,
  hint,
  action,
  height = 240,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  height?: number;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardTitle action={action}>{title}</CardTitle>
      {hint ? <p className="-mt-1 mb-3 text-[12px] text-muted">{hint}</p> : null}
      {isEmpty ? (
        <EmptyState title="Данных пока нет" description={emptyText} />
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as never}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

interface TooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

/** A custom tooltip: the stock one follows neither the theme nor our units. */
export function ChartTooltip({
  active,
  payload,
  label,
  units = {},
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  units?: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const visible = payload.filter(
    (item) => item.value !== null && item.value !== undefined && item.value !== '',
  );
  if (visible.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-medium">
        {typeof label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(label)
          ? formatDateShort(label)
          : label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: item.color ?? 'var(--c-muted)' }}
            />
            <span className="text-muted">{item.name}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {typeof item.value === 'number' ? num(item.value) : item.value}
              {units[String(item.dataKey)] ? ` ${units[String(item.dataKey)]}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function tickDate(value: string): string {
  return formatDateShort(value);
}

/* ------------------------------ Series toggling --------------------------- */

/**
 * Tracks which chart series are hidden, so the legend works as a switch: on the
 * weight-and-waist chart one often wants weight alone.
 */
export function useSeriesToggle(initialHidden: string[] = []) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(initialHidden));

  const toggle = useCallback((key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return {
    hidden,
    toggle,
    isHidden: (key: string) => hidden.has(key),
  };
}

export type SeriesToggle = ReturnType<typeof useSeriesToggle>;

interface LegendPayloadItem {
  dataKey?: string | number;
  value?: string;
  color?: string;
}

/**
 * A legend that toggles series. Recharts supplies the payload itself when the
 * component is passed to <Legend content={...} />.
 */
export function ChartLegend({
  payload,
  toggle,
}: {
  payload?: LegendPayloadItem[];
  toggle: SeriesToggle;
}) {
  if (!payload || payload.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3">
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value);
        const off = toggle.isHidden(key);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => toggle.toggle(key)}
              aria-pressed={!off}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[12px] transition-colors',
                'hover:bg-surface-2 focus-visible:focus-ring',
                off ? 'text-muted' : 'text-text',
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full transition-colors"
                style={{ background: off ? 'var(--c-border)' : (item.color ?? 'var(--c-muted)') }}
              />
              <span className={off ? 'line-through decoration-1' : ''}>{item.value}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
