import { useEffect, useState, type ReactNode } from "react";
import {
  Camera,
  Cloud,
  Home as HomeIcon,
  LogOut,
  MapPinned,
  Package,
  PoundSterling,
  Search,
  ShoppingCart,
  Snowflake,
  Thermometer,
  UserRound,
  Wine
} from "lucide-react";

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

type WorkspaceNavItem = {
  href: string;
  label: string;
  Icon: typeof HomeIcon;
  matches: string[];
};

const workspacePrimaryNav: WorkspaceNavItem[] = [
  { href: "#", label: "首页", Icon: HomeIcon, matches: [""] },
  { href: "#search", label: "搜索", Icon: Search, matches: ["search"] },
  { href: "#purchasing", label: "AI录入", Icon: Camera, matches: ["purchasing"] },
  { href: "#ordering", label: "下单", Icon: ShoppingCart, matches: ["ordering"] },
  { href: "#valuation", label: "库存金额", Icon: PoundSterling, matches: ["valuation", "valuation-freezer", "valuation-chiller", "valuation-dry-store", "valuation-drinks"] }
];

const workspaceStorageNav: WorkspaceNavItem[] = [
  { href: "#freezer", label: "冷冻库", Icon: Snowflake, matches: ["freezer"] },
  { href: "#chiller", label: "冷藏库", Icon: Thermometer, matches: ["chiller"] },
  { href: "#dry-store", label: "干货库", Icon: Package, matches: ["dry-store"] },
  { href: "#drinks", label: "酒水库", Icon: Wine, matches: ["drinks"] }
];

const workspaceRouteLabels: Record<string, string> = {
  chiller: "冷藏库",
  "cloud-sync": "云同步",
  drinks: "酒水库",
  "dry-store": "干货库",
  freezer: "冷冻库",
  ordering: "下单",
  purchasing: "AI录入",
  search: "搜索",
  valuation: "库存金额",
  "valuation-chiller": "冷藏库金额",
  "valuation-drinks": "酒水库金额",
  "valuation-dry-store": "干货库金额",
  "valuation-freezer": "冷冻库金额"
};

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

function WorkspaceNav({ items, routeName }: { items: WorkspaceNavItem[]; routeName: string }) {
  return (
    <nav aria-label="系统导航" className="app-sidebar-nav">
      {items.map(({ href, label, Icon, matches }) => {
        const active = matches.includes(routeName);

        return (
          <a aria-current={active ? "page" : undefined} className={active ? "app-sidebar-link app-sidebar-link-active" : "app-sidebar-link"} href={href} key={label}>
            <Icon aria-hidden="true" size={17} strokeWidth={2} />
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function AppWorkspace({ children, routeName }: { children: ReactNode; routeName: string }) {
  const title = workspaceRouteLabels[routeName] || "工作区";

  return (
    <div className="app-workspace">
      <aside className="app-sidebar" aria-label="Tinto Stock 工作台">
        <a className="app-brand" href="#" aria-label="返回 Tinto Stock 首页">
          <span className="app-brand-mark" aria-hidden="true">TS</span>
          <span className="app-brand-copy">
            <strong>Tinto Stock</strong>
            <small>Hotel workspace</small>
          </span>
        </a>

        <div className="app-sidebar-section-label">工作台</div>
        <WorkspaceNav items={workspacePrimaryNav} routeName={routeName} />

        <div className="app-sidebar-section-label app-sidebar-section-label-storage">库房</div>
        <WorkspaceNav items={workspaceStorageNav} routeName={routeName} />

        <a aria-current={routeName === "cloud-sync" ? "page" : undefined} className={routeName === "cloud-sync" ? "app-sidebar-link app-sidebar-link-active app-sidebar-link-secondary" : "app-sidebar-link app-sidebar-link-secondary"} href="#cloud-sync">
          <Cloud aria-hidden="true" size={17} strokeWidth={2} />
          <span>云同步</span>
        </a>

        <div className="app-sidebar-footer">
          <span className="app-sidebar-status-dot" aria-hidden="true" />
          <span>工作区在线</span>
        </div>
      </aside>

      <div className="app-workspace-main">
        <header className="app-workspace-topbar">
          <div className="app-breadcrumb" aria-label="页面路径">
            <span>Tinto Stock</span>
            <span aria-hidden="true">/</span>
            <strong>{title}</strong>
          </div>
          <a aria-label="返回首页" className="app-topbar-home" href="#">首页</a>
        </header>
        <div className="app-workspace-content">{children}</div>
      </div>
    </div>
  );
}

function AppRoute({ route }: { route: ReturnType<typeof getRoute> }) {

  const wrapWorkspace = (content: ReactNode) => <AppWorkspace routeName={route.name}>{content}</AppWorkspace>;

  if (route.name === "search") {
    return wrapWorkspace(<SearchPage />);
  }

  if (route.name === "purchasing") {
    return wrapWorkspace(<PurchasingPage />);
  }

  if (route.name === "ordering") {
    return wrapWorkspace(<OrderingPage />);
  }

  if (route.name === "freezer") {
    return wrapWorkspace(<FreezerPage initialLocation={route.searchParams.get("location")} supplierProductId={route.searchParams.get("supplierProductId")} />);
  }

  if (route.name === "chiller") {
    return wrapWorkspace(<StorageAreaPage title="冷藏库" subtitle="Chiller" />);
  }

  if (route.name === "dry-store") {
    return wrapWorkspace(<DryStorePage initialLocation={route.searchParams.get("location")} supplierProductId={route.searchParams.get("supplierProductId")} />);
  }

  if (route.name === "drinks") {
    return wrapWorkspace(<WineCellarPage />);
  }

  if (route.name === "valuation") {
    return wrapWorkspace(<ValuationPage />);
  }

  if (route.name === "valuation-freezer") {
    return wrapWorkspace(<ValuationPage scope="freezer" />);
  }

  if (route.name === "valuation-chiller") {
    return wrapWorkspace(<ValuationPage scope="chiller" />);
  }

  if (route.name === "valuation-dry-store") {
    return wrapWorkspace(<ValuationPage scope="dry-store" />);
  }

  if (route.name === "valuation-drinks") {
    return wrapWorkspace(<ValuationPage scope="drinks" />);
  }

  if (route.name === "cloud-sync") {
    return wrapWorkspace(<CloudSyncPage />);
  }

  return <Home />;
}
