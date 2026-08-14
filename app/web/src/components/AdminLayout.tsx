import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * /admin 配下の左ナビ型コンソールレイアウト（prototype/admin.html のIAを継承）。
 * ナビ: ホーム / お客様 / インサイト（プレースホルダー）
 */
export function AdminLayout() {
  const { user, aiMode, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="admin-app">
      <nav className="sidenav" aria-label="メイン">
        <div className="brand">
          Crossimage<small>管理コンソール</small>
        </div>
        <div className="nav-sep" />
        <NavLink to="/admin" end className="nav-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
          ホーム
        </NavLink>
        <NavLink to="/admin/clients" className="nav-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
            <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6" />
            <path d="M18.5 14.8c1.6.9 2.7 2.7 3 5.2" />
          </svg>
          お客様
        </NavLink>
        <NavLink to="/admin/insights" className="nav-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20V10" />
            <path d="M10 20V4" />
            <path d="M16 20v-7" />
            <path d="M22 20H2" />
          </svg>
          インサイト
        </NavLink>
        <div className="nav-foot">
          INTERNAL — 社内のみ
          <br />
          Build Increment 3
        </div>
      </nav>

      <div className="admin-main">
        <header className="topbar">
          <h1>Crossimage 管理コンソール</h1>
          <span className="privacy-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            この画面の原価・粗利・工場情報はお客様には一切表示されません
          </span>
          {user && (
            <div className="user-row">
              {aiMode === 'mock' && <span className="badge-demo-ai">デモAI</span>}
              <span className="user-name">{user.name}</span>
              <span aria-hidden="true" style={{ color: 'var(--border)' }}>
                |
              </span>
              <button type="button" className="btn-logout" onClick={onLogout}>
                ログアウト
              </button>
            </div>
          )}
        </header>

        <main className="admin-content" id="admin-main">
          <Outlet />
        </main>

        <footer className="admin-foot">
          社内向け管理コンソール — 実データはお客様・工場に共有されません
        </footer>
      </div>
    </div>
  );
}
