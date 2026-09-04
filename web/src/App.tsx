import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { Layout } from './components/Layout';
import { useAuth } from './lib/queries';
import { setServerToday } from './lib/format';
import AuthPage from './pages/Auth';
import TodayPage from './pages/Today';
import WeekPage from './pages/Week';
import PlanPage from './pages/Plan';
import ReferenceLayout from './pages/Reference';
import WorkoutsPage from './pages/Workouts';
import NutritionPage from './pages/Nutrition';
import SupplementsPage from './pages/Supplements';
import SettingsPage from './pages/Settings';

// The charts pull in recharts, the largest dependency. It is loaded only once
// the Progress page is actually opened.
const ProgressPage = lazy(() => import('./pages/Progress'));

export default function App() {
  const auth = useAuth();

  if (auth.isPending) return <Spinner className="min-h-dvh" />;

  // The calendar day comes from the server before any page renders; with
  // differing time zones the neighbouring date would open otherwise.
  if (auth.data) setServerToday(auth.data.serverDate);

  if (!auth.data?.authenticated) {
    return <AuthPage needsSetup={auth.data?.needsSetup ?? false} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/day/:date" element={<TodayPage />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route
          path="/progress"
          element={
            <Suspense fallback={<Spinner />}>
              <ProgressPage />
            </Suspense>
          }
        />

        <Route path="/reference" element={<ReferenceLayout />}>
          <Route index element={<Navigate to="/reference/nutrition" replace />} />
          <Route path="nutrition" element={<NutritionPage />} />
          <Route path="workouts" element={<WorkoutsPage />} />
          <Route path="supplements" element={<SupplementsPage />} />
        </Route>

        {/* Older section URLs, kept so saved links do not break. */}
        <Route path="/nutrition" element={<Navigate to="/reference/nutrition" replace />} />
        <Route path="/workouts" element={<Navigate to="/reference/workouts" replace />} />

        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
