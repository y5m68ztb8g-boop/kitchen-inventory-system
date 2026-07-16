import { useEffect, useState, type ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";

import "./App.css";
import { getAuthState, logout, type AuthState, type AuthUser } from "./auth/api";
import { CloudSyncPage } from "./CloudSyncPage";
import { DryStorePage } from "./DryStorePage";
import { FreezerPage } from "./FreezerPage";
import { Home } from "./Home";
import { OrderingPage } from "./OrderingPage";
import { PurchasingPage } from "./PurchasingPage";
import { SearchPage } from "./SearchPage";
import { StorageAreaPage } from "./StorageAreaPage";
import { ValuationPage } from "./ValuationPage";
import { WineCellarPage } from "./WineCellarPage";
import { LoginPage } from "./LoginPage";

const CLIENT_AUTH_REQUIRED = import.meta.env.VITE_AUTH_REQUIRED === "true";

function getRoute() {
  const [name, query = ""] = window.location.hash.replace("#", "").split("?", 2);
  return { name, searchParams: new URLSearchParams(query) };
}

export function App() {
  const [route, setRoute] = useState(getRoute);
  const [authState, setAuthState] = useState<AuthState | null>(CLIENT_AUTH_REQUIRED ? null : {
    authenticated: false,
    required: false,
    setupRequired: false,
    user: null
  });
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());

    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  useEffect(() => {
    if (!CLIENT_AUTH_REQUIRED) {
      return;
    }
    getAuthState()
      .then(setAuthState)
      .catch((error: unknown) => setAuthError(error instanceof Error ? error.message : "无法读取登录状态。"));
  }, []);

  if (CLIENT_AUTH_REQUIRED && authError) {
    return <main className="auth-login-shell"><section className="auth-login-panel"><h1>无法连接登录服务</h1><p className="auth-login-error" role="alert">{authError}</p><button className="auth-login-submit" onClick={() => window.location.reload()} type="button">重新连接</button></section></main>;
  }

  if (CLIENT_AUTH_REQUIRED && !authState) {
    return <main className="auth-login-shell"><section className="auth-login-panel"><p className="auth-login-message">正在检查登录状态…</p></section></main>;
  }

  if (CLIENT_AUTH_REQUIRED && authState && !authState.authenticated) {
    return <LoginPage setupRequired={authState.setupRequired} onAuthenticated={(user) => setAuthState({ authenticated: true, required: true, setupRequired: false, user })} />;
  }

  const content = <AppRoute route={route} />;
  if (!CLIENT_AUTH_REQUIRED || !authState?.user) {
    return content;
  }

  return <AuthenticatedShell user={authState.user} onLogout={async () => { await logout(); setAuthState({ authenticated: false, required: true, setupRequired: false, user: null }); }}>
    {content}
  </AuthenticatedShell>;
}

function AuthenticatedShell({ children, onLogout, user }: { children: ReactNode; onLogout: () => Promise<void>; user: AuthUser }) {
  return <>
    <div className="auth-session-bar">
      <span><UserRound size={15} />{user.displayName}</span>
      <button onClick={() => void onLogout()} type="button"><LogOut size={15} />退出登录</button>
    </div>
    {children}
  </>;
}

function AppRoute({ route }: { route: ReturnType<typeof getRoute> }) {

  if (route.name === "search") {
    return <SearchPage />;
  }

  if (route.name === "purchasing") {
    return <PurchasingPage />;
  }

  if (route.name === "ordering") {
    return <OrderingPage />;
  }

  if (route.name === "freezer") {
    return <FreezerPage initialLocation={route.searchParams.get("location")} supplierProductId={route.searchParams.get("supplierProductId")} />;
  }

  if (route.name === "chiller") {
    return <StorageAreaPage title="冷藏库" subtitle="Chiller" />;
  }

  if (route.name === "dry-store") {
    return <DryStorePage initialLocation={route.searchParams.get("location")} supplierProductId={route.searchParams.get("supplierProductId")} />;
  }

  if (route.name === "drinks") {
    return <WineCellarPage />;
  }

  if (route.name === "valuation") {
    return <ValuationPage />;
  }

  if (route.name === "valuation-freezer") {
    return <ValuationPage scope="freezer" />;
  }

  if (route.name === "valuation-chiller") {
    return <ValuationPage scope="chiller" />;
  }

  if (route.name === "valuation-dry-store") {
    return <ValuationPage scope="dry-store" />;
  }

  if (route.name === "valuation-drinks") {
    return <ValuationPage scope="drinks" />;
  }

  if (route.name === "cloud-sync") {
    return <CloudSyncPage />;
  }

  return <Home />;
}
