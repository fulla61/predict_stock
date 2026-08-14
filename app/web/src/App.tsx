import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import LoginPage from './pages/LoginPage';
import ConsultPage from './pages/ConsultPage';
import AdminPage from './pages/AdminPage';

/** 認証ガード: 未認証 → /login。roles 指定時は Role 不一致でリダイレクト。 */
function RequireAuth({ children, staffOnly }: { children: ReactNode; staffOnly?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <section className="step" aria-live="polite">
        <p className="page-note" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="spinner" aria-hidden="true" />
          読み込んでいます…
        </p>
      </section>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (staffOnly && user.role !== 'STAFF') {
    // CLIENT が /admin に来たら顧客フローへ（CONTRACT §6）
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  // STAFF のホームは承認キュー
  if (user?.role === 'STAFF') return <Navigate to="/admin" replace />;
  return <ConsultPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth staffOnly>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
