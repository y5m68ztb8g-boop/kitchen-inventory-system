// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createAuthService } from "./database";
import { createAuthGuard, installAuthRoutes } from "./routes";

type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void
) => void | Promise<void>;

type TestServer = { middlewares: { use: (handler: RouteHandler) => void } };

type TestResource = {
  database: Database.Database;
  server: Server;
};

const resources: TestResource[] = [];
const AUTH_COOKIE_NAME = "grow_naturally_session";

afterEach(async () => {
  await Promise.all(
    resources.splice(0).map(
      ({ database, server }) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          database.close();
        })
    )
  );
});

async function startServer(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to discover test server port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

function extractSessionCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return null;
  }
  const sessionPair = setCookieHeader.split(",").find((piece) => piece.includes(`${AUTH_COOKIE_NAME}=`))?.trim();
  if (!sessionPair) {
    return null;
  }
  return {
    attributes: sessionPair,
    pair: sessionPair.split(";")[0]
  };
}

async function requestJson<T = unknown>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as T | null;
  return { response, payload };
}

function createTestServer(database: Database.Database, serviceRequired = false) {
  const service = createAuthService(database, {
    bootstrapUsername: "admin",
    bootstrapPassword: "correct-password",
    required: serviceRequired
  });

  let route: RouteHandler | undefined;
  installAuthRoutes({ middlewares: { use: (next) => (route = next) } } as TestServer, service);

  const guard = createAuthGuard(service);
  const server = createServer((request, response) => {
    if (!route) {
      response.statusCode = 500;
      response.end("Route not installed.");
      return;
    }

    void route(
      request,
      response,
      () =>
        void guard(
          request,
          response,
          () => {
            const pathname = new URL(request.url || "/", "http://localhost").pathname;
            if (pathname === "/api/protected") {
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ allowed: true }));
              return;
            }

            response.statusCode = 204;
            response.end();
          }
        )
    );
  });

  resources.push({ database, server });
  return { service, server };
}

describe("auth routes and middleware", () => {
  it("allows protected endpoints when authentication is disabled", async () => {
    const database = new Database(":memory:");
    const { server } = createTestServer(database, false);
    const baseUrl = await startServer(server);

    const { response, payload } = await requestJson(`${baseUrl}/api/protected`);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ allowed: true });
  });

  it("returns 401 for unauthenticated access when authentication is required", async () => {
    const database = new Database(":memory:");
    const { server } = createTestServer(database, true);
    const baseUrl = await startServer(server);

    const { response, payload } = await requestJson(`${baseUrl}/api/protected`);

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      code: "AUTH_REQUIRED",
      error: "请先登录。"
    });
  });

  it("sets HttpOnly session cookie on successful login and rejects invalid credentials", async () => {
    const database = new Database(":memory:");
    const { server } = createTestServer(database, true);
    const baseUrl = await startServer(server);

    const valid = await requestJson(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({ username: "admin", password: "correct-password" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(valid.response.status).toBe(200);
    expect(valid.payload).toMatchObject({ authenticated: true, user: expect.objectContaining({ username: "admin" }) });

    const sessionCookie = extractSessionCookie(valid.response.headers.get("set-cookie"));
    expect(sessionCookie).not.toBeNull();
    expect(sessionCookie?.attributes).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(sessionCookie?.attributes).toContain("HttpOnly");
    expect(sessionCookie?.attributes).toContain("SameSite=Lax");
    expect(sessionCookie?.attributes).toContain("Path=/");

    const invalid = await requestJson(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({ username: "admin", password: "wrong-password" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(invalid.response.status).toBe(401);
    expect(invalid.payload).toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      error: "账号或密码不正确。"
    });
  });

  it("allows admin session to access protected API", async () => {
    const database = new Database(":memory:");
    const { server } = createTestServer(database, true);
    const baseUrl = await startServer(server);

    const login = await requestJson(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({ username: "admin", password: "correct-password" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const sessionCookie = extractSessionCookie(login.response.headers.get("set-cookie"));
    expect(sessionCookie).not.toBeNull();
    expect(sessionCookie!.pair).toContain(`${AUTH_COOKIE_NAME}=`);

    const protectedResponse = await requestJson(`${baseUrl}/api/protected`, {
      headers: { Cookie: sessionCookie!.pair }
    });

    expect(protectedResponse.response.status).toBe(200);
    expect(protectedResponse.payload).toEqual({ allowed: true });
  });

  it("logs out by clearing auth cookie", async () => {
    const database = new Database(":memory:");
    const { server } = createTestServer(database, true);
    const baseUrl = await startServer(server);

    const login = await requestJson(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({ username: "admin", password: "correct-password" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const sessionCookie = extractSessionCookie(login.response.headers.get("set-cookie"));
    expect(sessionCookie).not.toBeNull();
    expect(sessionCookie!.pair).toContain(`${AUTH_COOKIE_NAME}=`);

    const logout = await requestJson(`${baseUrl}/api/auth/logout`, {
      headers: { Cookie: sessionCookie!.pair },
      method: "POST"
    });

    expect(logout.response.status).toBe(200);
    const clearedCookie = logout.response.headers.get("set-cookie");
    expect(clearedCookie).toContain("Max-Age=0");

    const afterLogout = await requestJson(`${baseUrl}/api/protected`, {
      headers: { Cookie: sessionCookie!.pair }
    });

    expect(afterLogout.response.status).toBe(401);
    expect(afterLogout.payload).toMatchObject({
      code: "AUTH_REQUIRED"
    });
  });

  it("returns 503 when auth is required but no admin is configured", async () => {
    const database = new Database(":memory:");
    const service = createAuthService(database, {
      required: true
    });

    let route: RouteHandler | undefined;
    installAuthRoutes({ middlewares: { use: (next) => (route = next) } } as TestServer, service);

    const server = createServer((request, response) => {
      if (!route) {
        response.statusCode = 500;
        response.end("Route not installed.");
        return;
      }
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      if (pathname === "/api/protected") {
        const guard = createAuthGuard(service);
        guard(request, response, () => {
          response.statusCode = 200;
          response.end();
        });
      } else {
        void route(request, response, () => {
          response.statusCode = 204;
          response.end();
        });
      }
    });

    resources.push({ database, server });
    const baseUrl = await startServer(server);

    const protectedResponse = await requestJson(`${baseUrl}/api/protected`);
    expect(protectedResponse.response.status).toBe(503);
    expect(protectedResponse.payload).toMatchObject({
      code: "AUTH_NOT_CONFIGURED",
      error: "服务器尚未配置管理员账号。"
    });

    const loginResponse = await requestJson(`${baseUrl}/api/auth/login`, {
      body: JSON.stringify({ username: "admin", password: "correct-password" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(loginResponse.response.status).toBe(503);
    expect(loginResponse.payload).toMatchObject({
      code: "AUTH_NOT_CONFIGURED",
      error: "服务器尚未配置管理员账号。"
    });
  });

  it("allows only one bootstrap admin in the database", async () => {
    const database = new Database(":memory:");
    const first = createAuthService(database, {
      bootstrapUsername: "bootstrap-admin",
      bootstrapPassword: "bootstrap-password"
    });
    createAuthService(database, {
      bootstrapUsername: "another-admin",
      bootstrapPassword: "another-password"
    });

    const row = database.prepare("SELECT COUNT(*) AS total FROM auth_users WHERE disabled_at IS NULL").get() as { total: number };
    expect(row.total).toBe(1);

    expect(first.authenticate("bootstrap-admin", "bootstrap-password")).toMatchObject(
      expect.objectContaining({ username: "bootstrap-admin", role: "admin" })
    );
    expect(first.authenticate("another-admin", "another-password")).toBeNull();
    database.close();
  });
});
