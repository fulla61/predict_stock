import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Layout() {
  const { user, aiMode, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="site">
        <div className="wrap head-row">
          <div className="brand">
            Crossimage<small>ものづくり相談キャンバス</small>
          </div>
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
        </div>
      </header>

      <main className="wrap" id="main">
        <Outlet />
      </main>

      <footer className="site">
        実際の提案は担当者確認のうえお送りします
        <br />
        Crossimage Product OS Build Increment 1
      </footer>
    </>
  );
}
