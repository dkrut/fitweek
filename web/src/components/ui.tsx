import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Search, X } from 'lucide-react';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/* ----------------------------------- Card --------------------------------- */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cx(
        'rounded-card border border-border bg-surface',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {action}
    </header>
  );
}

/* --------------------------------- Buttons -------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-text hover:bg-border',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
};

const buttonSizes: Record<ButtonSize, string> = {
  // At least 44px tall for md/lg: the size a finger actually hits.
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled ?? loading}
      className={cx(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors',
        'hover:bg-surface-2 hover:text-text focus-visible:focus-ring disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------- Fields -------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const controlClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none ' +
  'transition-colors placeholder:text-muted/70 focus:border-accent focus-visible:focus-ring';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlClass, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlClass, 'min-h-24 resize-y', className)} />;
}

/** A search field with an icon, identical across every catalogue. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(controlClass, 'appearance-none pr-8', className)}>
      {children}
    </select>
  );
}

/** A large stepper: in a gym tapping +/- beats typing digits. */
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  suffix,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const change = (delta: number) => {
    const next = Number(((value ?? 0) + delta).toFixed(2));
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <div className="flex items-stretch gap-1">
      <button
        type="button"
        aria-label="Уменьшить"
        onClick={() => change(-step)}
        className="size-11 shrink-0 rounded-xl bg-surface-2 text-lg font-medium transition-colors hover:bg-border focus-visible:focus-ring"
      >
        −
      </button>
      <div className="relative flex-1">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          step={step}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
          className={cx(controlClass, 'h-11 py-0 text-center text-base font-medium tabular-nums')}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Увеличить"
        onClick={() => change(step)}
        className="size-11 shrink-0 rounded-xl bg-surface-2 text-lg font-medium transition-colors hover:bg-border focus-visible:focus-ring"
      >
        +
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-lg border transition-all',
        'focus-visible:focus-ring disabled:opacity-40',
        checked
          ? 'border-success bg-success text-white'
          : 'border-border bg-surface hover:border-muted',
      )}
    >
      {checked ? <Check size={15} strokeWidth={3} /> : null}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx('inline-flex gap-0.5 rounded-xl bg-surface-2 p-1', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:focus-ring',
            value === option.value
              ? 'bg-surface text-text shadow-sm'
              : 'text-muted hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Progress ------------------------------- */

/** A progress ring: the calorie and protein target reads faster than numbers. */
export function Ring({
  value,
  target,
  label,
  unit,
  size = 96,
  tone = 'accent',
}: {
  value: number;
  target: number;
  label: string;
  unit: string;
  size?: number;
  tone?: 'accent' | 'success';
}) {
  const pct = target > 0 ? Math.min(1.35, value / target) : 0;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const over = pct > 1.08;
  const color = over ? 'var(--c-warn)' : tone === 'success' ? 'var(--c-success)' : 'var(--c-accent)';

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--c-surface-2)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.min(1, pct))}
            style={{ transition: 'stroke-dashoffset 0.45s ease, stroke 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums leading-none">
            {Math.round(value)}
          </span>
          <span className="mt-0.5 text-[11px] text-muted tabular-nums">из {target}</span>
        </div>
      </div>
      <span className="text-[12px] font-medium text-muted">
        {label}
        {unit ? `, ${unit}` : ''}
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  tone = 'success',
  className,
}: {
  value: number;
  tone?: 'success' | 'accent';
  className?: string;
}) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-surface-2', className)}>
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-500',
          tone === 'success' ? 'bg-success' : 'bg-accent',
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'success' | 'warn' | 'danger';
}) {
  const toneClass = {
    neutral: 'text-text',
    success: 'text-success',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone];

  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className={cx('mt-1 text-xl font-semibold tabular-nums tracking-tight', toneClass)}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger';
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------- Sheet -------------------------------- */

/**
 * Slides up from the bottom on a phone, centres as a dialog on desktop.
 * One component instead of two sets of markup.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface',
          'rounded-t-3xl sm:rounded-3xl sm:border sm:border-border',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------- Toasts -------------------------------- */

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

const ToastContext = createContext<(message: string, tone?: 'info' | 'error') => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, tone === 'error' ? 6000 : 3000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cx(
              'pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm shadow-lg',
              toast.tone === 'error'
                ? 'bg-danger text-white'
                : 'bg-text text-bg',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------------------------- States -------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-center py-12 text-muted', className)}>
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Что-то пошло не так';
  return (
    <EmptyState
      title="Не удалось загрузить"
      description={message}
      action={onRetry ? <Button onClick={onRetry}>Повторить</Button> : undefined}
    />
  );
}
