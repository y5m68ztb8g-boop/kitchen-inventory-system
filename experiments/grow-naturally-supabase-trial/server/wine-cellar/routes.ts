import type { IncomingMessage, ServerResponse } from "node:http";

import type { WineCellarScope, WineCellarSnapshot } from "../../src/modules/wine-cellar/types";

type WineCellarDatabase = {
  getSnapshot(scope: WineCellarScope): WineCellarSnapshot;
  replaceSnapshot(scope: WineCellarScope, snapshot: WineCellarSnapshot): WineCellarSnapshot;
};

type MiddlewareServer = {
  middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void | Promise<void>) => void };
};

const collectionNames: Array<keyof WineCellarSnapshot> = [
  "racks", "positions", "assignments", "countSessions", "countEntries", "receipts", "adjustments", "auditEvents"
];

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 5 * 1024 * 1024) throw new Error("Request body too large");
  }
  return JSON.parse(body) as unknown;
}

function parseScope(value: unknown): WineCellarScope | null {
  if (!value || typeof value !== "object") return null;
  const scope = value as { hotelId?: unknown; areaId?: unknown };
  if (typeof scope.hotelId !== "string" || !scope.hotelId.trim() || typeof scope.areaId !== "string" || !scope.areaId.trim()) return null;
  return { hotelId: scope.hotelId.trim(), areaId: scope.areaId.trim() };
}

function parseSnapshot(value: unknown): WineCellarSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<WineCellarSnapshot>;
  return collectionNames.every((name) => Array.isArray(snapshot[name])) ? snapshot as WineCellarSnapshot : null;
}

export function installWineCellarRoutes(server: MiddlewareServer, database: WineCellarDatabase) {
  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/api/wine-cellar/snapshot") {
      next();
      return;
    }

    if (request.method === "GET") {
      const scope = parseScope({ hotelId: url.searchParams.get("hotelId"), areaId: url.searchParams.get("areaId") });
      if (!scope) return sendJson(response, 400, { error: "酒水库范围无效。" });
      return sendJson(response, 200, { snapshot: database.getSnapshot(scope) });
    }

    if (request.method === "PUT") {
      try {
        const body = await readJson(request) as { scope?: unknown; snapshot?: unknown };
        const scope = parseScope(body.scope);
        const snapshot = parseSnapshot(body.snapshot);
        if (!scope || !snapshot) return sendJson(response, 400, { error: "酒水库数据无效。" });
        return sendJson(response, 200, { snapshot: database.replaceSnapshot(scope, snapshot) });
      } catch (error) {
        return sendJson(response, 400, { error: error instanceof Error ? error.message : "酒水库保存失败。" });
      }
    }

    sendJson(response, 405, { error: "Method not allowed" });
  });
}
