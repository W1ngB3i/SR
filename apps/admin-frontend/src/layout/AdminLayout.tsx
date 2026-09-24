import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AuditOutlined,
  ClusterOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NotificationOutlined,
  RobotOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { App, Avatar, Tooltip } from 'antd';
import { ROLE_LABELS, type StaffRole } from '@sr/shared';
import { useAuth } from '../auth/AuthContext';
import { canManage, canPlatform, canReview } from '../roles';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  allowed: boolean;
}

export function AdminLayout() {
  const { message } = App.useApp();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = useMemo<NavItem[]>(() => {
    const role = user?.role as StaffRole | undefined;
    return [
      { path: '/pool', label: '工单池', icon: <ClusterOutlined />, allowed: canReview(role) },
      { path: '/keys', label: '接洽码', icon: <KeyOutlined />, allowed: canReview(role) },
      { path: '/stats', label: '仪表盘', icon: <DashboardOutlined />, allowed: canPlatform(role) },
      { path: '/rules', label: '规则配置', icon: <AuditOutlined />, allowed: canManage(role) },
      { path: '/announcements', label: '公告管理', icon: <NotificationOutlined />, allowed: canManage(role) },
      { path: '/appeals', label: '申诉处理', icon: <SolutionOutlined />, allowed: canManage(role) },
      { path: '/robot', label: '机器人管理', icon: <RobotOutlined />, allowed: canManage(role) },
      { path: '/users', label: '人员管理', icon: <TeamOutlined />, allowed: canPlatform(role) },
      { path: '/audit-logs', label: '审计日志', icon: <FileSearchOutlined />, allowed: canPlatform(role) },
      { path: '/config', label: '系统配置', icon: <SettingOutlined />, allowed: canPlatform(role) },
    ];
  }, [user?.role]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="admin-sider sr-glass">
        <div className="admin-sider__brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
          <img src="/logo.png" alt="SR" className="admin-sider__mark-img" />
          {!collapsed && <span className="admin-sider__name">审核工作台</span>}
        </div>

        <nav className="admin-nav">
          {navItems
            .filter((item) => item.allowed)
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `admin-nav__item ${isActive || location.pathname.startsWith(`${item.path}/`) ? 'is-active' : ''}`
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="admin-nav__icon">{item.icon}</span>
                {!collapsed && <span className="admin-nav__label">{item.label}</span>}
              </NavLink>
            ))}
        </nav>

        <button
          type="button"
          className="admin-sider__collapse"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? '展开侧栏' : '收起侧栏'}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
      </aside>

      <div className="admin-body">
        <header className="admin-header">
          <div className="admin-header__breadcrumb">
            {navItems.find((item) => location.pathname.startsWith(item.path))?.label ?? '工作台'}
          </div>
          <div className="admin-header__user">
            <Avatar size={30} className="admin-header__avatar">
              {user?.name?.slice(0, 1) ?? '?'}
            </Avatar>
            <span className="admin-header__name">{user?.name}</span>
            {user && user.role !== 'admin' && (
              <Tooltip title="在 QQ 群内 @审核机器人 并发送该认证 ID，即可完成机器人绑定">
                <button
                  type="button"
                  className="admin-header__auth-id"
                  onClick={() => {
                    // 后台常以 http://<IP>:5174 访问，非安全上下文下 clipboard 不可用，不能谎报成功
                    if (!navigator.clipboard) {
                      message.warning('当前环境不支持自动复制，请手动选中复制');
                      return;
                    }
                    navigator.clipboard.writeText(user.id).then(
                      () => message.success('认证 ID 已复制'),
                      () => message.warning('复制失败，请手动选中复制'),
                    );
                  }}
                >
                  {user.id}
                </button>
              </Tooltip>
            )}
            <Tooltip title={user ? ROLE_LABELS[user.role] : ''}>
              <span className={`admin-role admin-role--${user?.role ?? 'reviewer'}`}>
                {user ? ROLE_LABELS[user.role] : ''}
              </span>
            </Tooltip>
            <button type="button" className="admin-header__logout" onClick={handleLogout}>
              <LogoutOutlined />
              <span>退出</span>
            </button>
          </div>
        </header>

        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
