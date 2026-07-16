export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin";
};

export type AuthState = {
  authenticated: boolean;
  required: boolean;
  setupRequired: boolean;
  user: AuthUser | null;
};

async function readPayload(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getAuthState(): Promise<AuthState> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  const payload = await readPayload(response);
  if (response.status === 503) {
    return {
      authenticated: false,
      required: true,
      setupRequired: true,
      user: null
    };
  }
  if (response.status === 401) {
    return {
      authenticated: false,
      required: true,
      setupRequired: false,
      user: null
    };
  }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "无法读取登录状态。");
  }

  return {
    authenticated: payload.authenticated === true,
    required: payload.required === true,
    setupRequired: false,
    user: (payload.user as AuthUser | null) ?? null
  };
}

export async function login(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    body: JSON.stringify({ password, username }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "登录失败，请稍后重试。");
  }
  return payload.user as AuthUser;
}

export async function logout() {
  await fetch("/api/auth/logout", { credentials: "include", method: "POST" });
}

