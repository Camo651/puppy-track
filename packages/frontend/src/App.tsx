import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { Layout } from "@/components/Layout";
import { HomePage } from "@/pages/HomePage";
import { HistoryPage } from "@/pages/HistoryPage";
import { TrendsPage } from "@/pages/TrendsPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { ModelLabPage } from "@/pages/ModelLabPage";
import { AccountPage } from "@/pages/AccountPage";
import { LoginPage } from "@/pages/LoginPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/models" element={<ModelLabPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/profile" element={<Navigate to="/account" replace />} />
        <Route path="/settings" element={<Navigate to="/account" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
