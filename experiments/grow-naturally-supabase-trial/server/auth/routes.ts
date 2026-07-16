import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthService, type AuthUser } from "./database";

type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void
) => void | Promise<void>;

type AuthMiddlewareServer = {
  middlewares: {
    use: (handler: RouteHandler) => void;
  };
};

const SESSION_COOKIE = "grow_naturally_session";

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function readCookie(request: IncomingMessage, name: string) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  const prefix = `${name}=`;
  const value = cookies.find((cookie) => cookie.trim().startsWith(prefix))?.trim().slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

function sessionCookie(token: string, service: AuthService) {
  const secure = service.cookieSecure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${service.sessionTtlSeconds}${secure}`;
}

function expiredSessionCookie(service: AuthService) {
  const secure = service.cookieSecure ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function readJsonBody(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (body.length > 256 * 1024) {
      throw new Error("AUTH_REQUEST_TOO_LARGE");
    }
  }
  return JSON.parse(body || "{}");
}

function currentUser(service: AuthService, request: IncomingMessage) {
  return service.getUserForSession(readCookie(request, SESSION_COOKIE));
}

export function installAuthRoutes(server: AuthMiddlewareServer, service: AuthService) {
  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/api/auth" && !url.pathname.startsWith("/api/auth/")) {
      next();
      return;
    }

    try {
      if (url.pathname === "/api/auth/status" && request.method === "GET") {
        const user = currentUser(service, request);
        sendJson(response, 200, { ...service.getStatus(), authenticated: Boolean(user), user });
        return;
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        const user = currentUser(service, request);
        if (!user && service.required) {
          sendJson(response, service.hasAdmin() ? 401 : 503, {
            code: service.hasAdmin() ? "AUTH_REQUIRED" : "AUTH_NOT_CONFIGURED",
            error: service.hasAdmin() ? "请先登录。" : "服务器尚未配置管理员账号。"
          });
          return;
        }
        sendJson(response, 200, { authenticated: Boolean(user), required: service.required, user });
        return;
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        if (!service.hasAdmin()) {
          sendJson(response, 503, { code: "AUTH_NOT_CONFIGURED", error: "服务器尚未配置管理员账号。" });
          return;
        }
        const body = (await readJsonBody(request)) as { password?: unknown; username?: unknown };
        const username = typeof body.username === "string" ? body.username : "";
        const password = typeof body.password === "string" ? body.password : "";
        const user = service.authenticate(username, password);
        if (!user) {
          sendJson(response, 401, { code: "AUTH_INVALID_CREDENTIALS", error: "账号或密码不正确。" });
          return;
        }
        const session = service.createSession(user);
        response.setHeader("Set-Cookie", sessionCookie(session.token, service));
        sendJson(response, 200, { authenticated: true, user });
        return;
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        service.revokeSession(readCookie(request, SESSION_COOKIE));
        response.setHeader("Set-Cookie", expiredSessionCookie(service));
        sendJson(response, 200, { authenticated: false });
        return;
      }

      if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
        sendJson(response, 404, { code: "AUTH_ROUTE_NOT_FOUND", error: "认证接口不存在。" });
        return;
      }
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && error.message === "AUTH_REQUEST_TOO_LARGE")) {
        sendJson(response, 400, { code: "AUTH_INVALID_REQUEST", error: "登录请求无效。" });
        return;
      }
      sendJson(response, 500, { code: "AUTH_SERVER_ERROR", error: "认证服务暂时不可用。" });
    }
  });
}

export function createAuthGuard(service: AuthService): RouteHandler {
  return (request, response, next) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (!pathname.startsWith("/api/") || pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
      next();
      return;
    }
    if (!service.required) {
      next();
      return;
    }

    const user = currentUser(service, request);
    if (!service.hasAdmin()) {
      sendJson(response, 503, { code: "AUTH_NOT_CONFIGURED", error: "服务器尚未配置管理员账号。" });
      return;
    }
    if (!user || user.role !== "admin") {
      sendJson(response, 401, { code: "AUTH_REQUIRED", error: "请先登录。" });
      return;
    }
    next();
  };
}

export function getAuthenticatedUser(service: AuthService, request: IncomingMessage): AuthUser | null {
  return currentUser(service, request);
}

