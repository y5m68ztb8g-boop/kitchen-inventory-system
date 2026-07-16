import { useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { login, type AuthUser } from "./auth/api";

type LoginPageProps = {
  onAuthenticated: (user: AuthUser) => void;
  setupRequired?: boolean;
};

export function LoginPage({ onAuthenticated, setupRequired = false }: LoginPageProps) {
  const [username, setUsername] = useState("alex");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(username, password);
      onAuthenticated(user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-login-shell">
      <section aria-labelledby="auth-login-title" className="auth-login-panel">
        <div className="auth-login-icon" aria-hidden="true"><ShieldCheck size={28} /></div>
        <p className="auth-login-eyebrow">Tinto Hotel</p>
        <h1 id="auth-login-title">管理员登录</h1>
        {setupRequired ? (
          <p className="auth-login-message" role="status">服务器还没有配置管理员账号，请先完成服务器设置。</p>
        ) : (
          <p className="auth-login-message">请输入管理员账号后进入系统。</p>
        )}
        <form onSubmit={handleSubmit}>
          <label>
            管理员账号
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            密码
            <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="auth-login-error" role="alert">{error}</p> : null}
          <button className="auth-login-submit" disabled={submitting || !username.trim() || !password} type="submit">
            <LogIn size={17} />
            {submitting ? "正在登录…" : "进入系统"}
          </button>
        </form>
      </section>
    </main>
  );
}

