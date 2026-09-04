import { NavLink, Outlet } from 'react-router-dom';
import { cx } from '../components/ui';

const TABS = [
  { to: '/reference/nutrition', label: 'Питание' },
  { to: '/reference/workouts', label: 'Тренировки' },
  { to: '/reference/supplements', label: 'Добавки' },
];

/**
 * The shared wrapper for the catalogues. The section switcher is there for the
 * phone, where the sidebar is hidden and nested items are invisible.
 */
export default function ReferenceLayout() {
  return (
    <>
      <nav className="mb-5 inline-flex gap-0.5 rounded-xl bg-surface-2 p-1 lg:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cx(
                'rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                isActive ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </>
  );
}
