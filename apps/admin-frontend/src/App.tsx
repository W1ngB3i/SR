import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { Backdrop } from '@sr/ui';
import type { StaffRole } from '@sr/shared';
import { useAuth } from './auth/AuthContext';
import { canManage, canPlatform, canReview, homePathFor } from './roles';
import { AdminLayout } from './layout/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { PoolPage } from './pages/PoolPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { ContactKeysPage } from './pages/ContactKeysPage';
import { StatsPage } from './pages/StatsPage';
import { RulesAdminPage } from './pages/RulesAdminPage';
import { UsersPage } from './pages/UsersPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { AppealsPage } from './pages/AppealsPage';
import { RobotPage } from './pages/RobotPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ConfigPage } from './pages/ConfigPage';

/** 登录守卫：未登录一律回到登录页，并记住来路 */
function RequireAuth({ children }: { children: ReactElement }) {
  const { auth } = useAuth();
  const location = useLocation();
  if (!auth) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** 角色守卫：无权限时显示 403 区块（不隐藏路由，避免误操作后的困惑） */
function RequireRole({
  allow,
  children,
}: {
  allow: (role: StaffRole | undefined) => boolean;
  children: ReactElement;
}) {
  const { user } = useAuth();
  if (!allow(user?.role)) {
    return (
      <div className="page-hero">
        <h1 className="page-hero__title">权限不足</h1>
        <p className="page-hero__desc">当前角色（{user?.name ?? '未知'}）无权访问该页面。</p>
      </div>
    );
  }
  return children;
}

export function App() {
  const { auth } = useAuth();

  return (
    <>
      <Backdrop />
      <Routes>
        <Route
          path="/login"
          element={auth ? <Navigate to={homePathFor(auth.user.role)} replace /> : <LoginPage />}
        />
        <Route
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Navigate to={homePathFor(auth?.user.role)} replace />} />
          <Route
            path="/pool"
            element={
              <RequireRole allow={canReview}>
                <PoolPage />
              </RequireRole>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <RequireRole allow={canReview}>
                <TicketDetailPage />
              </RequireRole>
            }
          />
          <Route
            path="/keys"
            element={
              <RequireRole allow={canReview}>
                <ContactKeysPage />
              </RequireRole>
            }
          />
          <Route
            path="/stats"
            element={
              <RequireRole allow={canPlatform}>
                <StatsPage />
              </RequireRole>
            }
          />
          <Route
            path="/rules"
            element={
              <RequireRole allow={canManage}>
                <RulesAdminPage />
              </RequireRole>
            }
          />
          <Route
            path="/announcements"
            element={
              <RequireRole allow={canManage}>
                <AnnouncementsPage />
              </RequireRole>
            }
          />
          <Route
            path="/appeals"
            element={
              <RequireRole allow={canManage}>
                <AppealsPage />
              </RequireRole>
            }
          />
          <Route
            path="/robot"
            element={
              <RequireRole allow={canManage}>
                <RobotPage />
              </RequireRole>
            }
          />
          <Route
            path="/users"
            element={
              <RequireRole allow={canPlatform}>
                <UsersPage />
              </RequireRole>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <RequireRole allow={canPlatform}>
                <AuditLogsPage />
              </RequireRole>
            }
          />
          <Route
            path="/config"
            element={
              <RequireRole allow={canPlatform}>
                <ConfigPage />
              </RequireRole>
            }
          />
          <Route
            path="*"
            element={
              <div className="page-hero">
                <h1 className="page-hero__title">页面不存在</h1>
                <p className="page-hero__desc">请从左侧导航返回正确的页面。</p>
              </div>
            }
          />
        </Route>
      </Routes>
    </>
  );
}
