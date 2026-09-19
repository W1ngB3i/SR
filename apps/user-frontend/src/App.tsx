import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Backdrop } from '@sr/ui';
import { SubmitPage } from './pages/SubmitPage';
import { QueryPage } from './pages/QueryPage';
import { PublishedPage } from './pages/PublishedPage';
import { RulesPage } from './pages/RulesPage';

export function App() {
  return (
    <>
      <Backdrop />
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header__inner">
            <Link to="/" className="app-logo">
              <img src="/logo.png" alt="SR" className="app-logo__mark-img" />
              <span className="app-logo__text">公会审核工单</span>
            </Link>
            <nav className="app-nav">
              <NavLink to="/" end>
                提交申请
              </NavLink>
              <NavLink to="/query">进度查询</NavLink>
              <NavLink to="/published">结果公示</NavLink>
              <NavLink to="/rules">审核规则</NavLink>
            </nav>
          </div>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<SubmitPage />} />
            <Route path="/query" element={<QueryPage />} />
            <Route path="/published" element={<PublishedPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route
              path="*"
              element={
                <div className="page-hero">
                  <h1 className="page-hero__title">页面不存在</h1>
                  <p className="page-hero__desc">请从顶部导航返回正确的页面。</p>
                </div>
              }
            />
          </Routes>
        </main>

        <footer className="app-footer">
          SR 公会审核工单系统 · 如遇问题请联系审核总管或副总管（见「审核规则」页反馈渠道）
        </footer>
      </div>
    </>
  );
}
