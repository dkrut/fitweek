import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  CalendarRange,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Library,
  Pill,
  Settings as SettingsIcon,
  Sun,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react';
import { cx } from './ui';

interface NavLeaf {
  to: string;
  label: string;
  /** Short label for the bottom bar, where a tab gets about 60px. */
  short?: string;
  icon: typeof Sun;
  end?: boolean;
}

interface NavGroup extends NavLeaf {
  children: NavLeaf[];
}

type NavItem = NavLeaf | NavGroup;

const hasChildren = (item: NavItem): item is NavGroup => 'children' in item;

const NAV: NavItem[] = [
  { to: '/', label: 'Сегодня', icon: Sun, end: true },
  { to: '/week', label: 'Неделя', icon: CalendarRange },
  { to: '/plan', label: 'План недели', short: 'План', icon: ClipboardList },
  { to: '/progress', label: 'Прогресс', icon: TrendingUp },
  {
    to: '/reference',
    // No short label on purpose: the bottom bar truncates with an ellipsis,
    // and the clipped full word reads better than an abbreviation.
    label: 'Справочники',
    icon: Library,
    children: [
      { to: '/reference/nutrition', label: 'Питание', icon: UtensilsCrossed },
      { to: '/reference/workouts', label: 'Тренировки', icon: Dumbbell },
      { to: '/reference/supplements', label: 'Добавки', icon: Pill },
    ],
  },
  { to: '/settings', label: 'Настройки', icon: SettingsIcon },
];

const topLinkClass = (isActive: boolean) =>
  cx(
    // No flex-1: in a vertical panel it would stretch the item to full height.
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text',
  );

/** A collapsible group: child items appear when the parent is clicked. */
function SidebarGroup({ item }: { item: NavGroup }) {
  const location = useLocation();
  const insideGroup = location.pathname.startsWith(item.to);
  const [open, setOpen] = useState(insideGroup);
  const expanded = open || insideGroup;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        className={cx(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          insideGroup ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-text',
        )}
      >
        <item.icon size={18} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRight
          size={15}
          className={cx('transition-transform', expanded && 'rotate-90')}
        />
      </button>

      {expanded ? (
        // A vertical rule makes the nesting visible instead of mere indentation.
        <ul className="ml-[1.6rem] flex flex-col gap-0.5 border-l border-border pl-2">
          {item.children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                    isActive
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'text-muted hover:bg-surface-2 hover:text-text',
                  )
                }
              >
                <child.icon size={15} />
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const REPO_URL = 'https://github.com/dkrut/fitweek';

/**
 * The GitHub mark is drawn here: lucide carries no brand icons, and pulling in
 * another package for a single svg path is not worth it.
 */
function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/**
 * One navigation set for every width: a sidebar on desktop, a bottom tab bar on
 * a phone. There is no duplicate markup per breakpoint.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      {/*
        The panel is pinned to the viewport height: otherwise it stretches with
        the page and the link at its bottom ends up below the fold.
      */}
      <aside className="hidden shrink-0 border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-56 lg:flex-col">
        <div className="px-5 py-6">
          <p className="text-[15px] font-semibold tracking-tight">План</p>
          <p className="mt-0.5 text-[12px] text-muted">Тренировки и питание</p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-6">
          {NAV.map((item) =>
            hasChildren(item) ? (
              <SidebarGroup key={item.to} item={item} />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) => topLinkClass(isActive)}
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 border-t border-border px-5 py-3.5 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <GithubMark />
          dkrut/fitweek
        </a>
      </aside>

      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7 lg:max-w-4xl">
          {children}
        </div>
      </main>

      <nav
        className={cx(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="grid grid-cols-6">
          {NAV.map((item) => (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cx(
                    'flex h-[4.25rem] flex-col items-center justify-center gap-1 px-0.5 transition-colors',
                    isActive ? 'text-accent' : 'text-muted',
                  )
                }
              >
                <item.icon size={20} />
                <span className="w-full truncate text-center text-[10px] font-medium leading-none">
                  {item.short ?? item.label}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
