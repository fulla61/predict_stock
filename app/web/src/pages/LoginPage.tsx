import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError, NetworkError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { LoginResponse } from '../types';

export default function LoginPage() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === 'STAFF' ? '/admin' : '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードの両方をご入力ください。');
      return;
    }

    setBusy(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', {
        email: email.trim(),
        password,
      });
      setUser(res.user);
      navigate(res.user.role === 'STAFF' ? '/admin' : '/', { replace: true });
    } catch (err) {
      if (err instanceof NetworkError) {
        setError(err.message);
      } else if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 400) {
          setError(
            'メールアドレスまたはパスワードが正しくありません。入力内容をもう一度ご確認ください。',
          );
        } else if (err.status === 429) {
          setError('試行回数が多くなっています。少し時間をおいてからお試しください。');
        } else if (err.status >= 500 || err.code === 'UNKNOWN') {
          setError(
            'サーバーで問題が発生しているようです。時間をおいてもう一度お試しください。解決しない場合は担当者までご連絡ください。',
          );
        } else {
          setError(err.message);
        }
      } else {
        setError('予期しないエラーが発生しました。時間をおいてもう一度お試しください。');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="step enter" aria-labelledby="h-login">
      <h1 className="h-main" id="h-login">
        おかえりなさい
      </h1>
      <p className="h-sub">ご登録のメールアドレスとパスワードでログインしてください。</p>

      <form className="card login-card" onSubmit={onSubmit} noValidate>
        <label className="field-label" htmlFor="login-email">
          メールアドレス
        </label>
        <input
          id="login-email"
          type="email"
          className="url-input"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.co.jp"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="field-label" htmlFor="login-password">
          パスワード
        </label>
        <input
          id="login-password"
          type="password"
          className="url-input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        <div className="login-cta">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'ログインしています…' : 'ログイン'}
          </button>
        </div>
        <p className="note">
          パスワードをお忘れの場合は、担当者までご連絡ください。
        </p>
      </form>
    </section>
  );
}
