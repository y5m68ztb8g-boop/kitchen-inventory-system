// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createWineCellarDatabase } from "../../../server/wine-cellar/database";
import { installWineCellarRoutes } from "../../../server/wine-cellar/routes";

type RouteHandler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void | Promise<void>;
type TestServer = { middlewares: { use: (handler: RouteHandler) => void } };

type ActiveResource = { database: ReturnType<typeof createWineCellarDatabase>; server: Server };

const resources: ActiveResource[] = [];

async function loadWineCellarRoutes(database: ReturnType<typeof createWineCellarDatabase>) {
  let handler: RouteHandler | undefined;
  installWineCellarRoutes({ middlewares: { use: (next) => (handler = next) } } as TestServer, database);
  if (!handler) throw new Error("Wine cellar route handler failed to register.");

  const server = createServer((request, response) => {
    void handler?.(request, response, () => {
      response.statusCode = 204;
      response.end();
    });
  });

  resources.push({ database, server });
  return server;
}

async function startServer(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");
  return `http://127.0.0.1:${address.port}`;
}

async function requestJson<T = unknown>(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  const payload = (await response.json().catch(() => null)) as T | null;
  return { response, payload };
}

const scope = { hotelId: "tintohotel", areaId: "drinks" };

const updatedSnapshot = {
  racks: [
    {
      id: "rack-a",
      ...scope,
      name: "A架",
      displayOrder: 0,
      active: true,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    }
  ],
  positions: [
    {
      id: "pos-a1",
      rackId: "rack-a",
      ...scope,
      code: "A1",
      width: 4,
      depth: 5,
      capacity: 20,
      currentQuantity: 4,
      stockUnit: "bottle",
      fillDirection: "front-to-back",
      lowStockMode: "percentage",
      lowStockThreshold: 20,
      active: true,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    }
  ],
  assignments: [
    {
      id: "assign-1",
      ...scope,
      positionId: "pos-a1",
      productId: "prod-1",
      productName: "House Red",
      matchStatus: "matched",
      supplierName: "Vineyard Co",
      supplierProductCode: "VR-001",
      invoiceReference: null,
      unitCost: 18.5,
      currency: "GBP",
      assignedAt: "2026-07-12T00:00:00.000Z",
      assignedById: "user-1",
      assignedByName: "Alice",
      active: true
    }
  ],
  countSessions: [
    {
      id: "session-1",
      ...scope,
      status: "completed",
      notes: null,
      startedAt: "2026-07-12T00:00:00.000Z",
      completedAt: "2026-07-12T00:00:00.000Z",
      actorId: "user-1",
      actorName: "Alice"
    }
  ],
  countEntries: [
    {
      id: "entry-1",
      ...scope,
      sessionId: "session-1",
      positionId: "pos-a1",
      beforeQuantity: 4,
      afterQuantity: 3,
      capacity: 20,
      emptySlotIds: ["0:0", "1:0"],
      abnormalPattern: false,
      actorId: "user-1",
      actorName: "Alice",
      createdAt: "2026-07-12T00:00:00.000Z"
    }
  ],
  receipts: [
    {
      id: "receipt-1",
      ...scope,
      positionId: "pos-a1",
      quantity: 2,
      beforeQuantity: 4,
      afterQuantity: 6,
      invoiceReference: "INV-1",
      unitCost: 5.5,
      actorId: "user-1",
      actorName: "Alice",
      createdAt: "2026-07-12T00:00:00.000Z"
    }
  ],
  adjustments: [
    {
      id: "adjust-1",
      ...scope,
      positionId: "pos-a1",
      delta: 1,
      reason: "restock",
      beforeQuantity: 6,
      afterQuantity: 7,
      actorId: "user-1",
      actorName: "Alice",
      createdAt: "2026-07-12T00:00:00.000Z"
    }
  ],
  auditEvents: [
    {
      id: "audit-1",
      ...scope,
      type: "rack-created",
      entityId: "rack-a",
      changes: { name: "A架" },
      actorId: "user-1",
      actorName: "Alice",
      createdAt: "2026-07-12T00:00:00.000Z"
    }
  ]
};

afterEach(async () => {
  await Promise.all(
    resources.splice(0).map(({ database, server }) =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        database.close();
      })
    )
  );
});

describe("wine cellar snapshot routes", () => {
  it("GET /api/wine-cellar/snapshot by scope returns the current SQLite snapshot", async () => {
    const database = createWineCellarDatabase(":memory:");
    const server = await loadWineCellarRoutes(database);
    const baseUrl = await startServer(server);

    const { response, payload } = await requestJson<{ snapshot: typeof updatedSnapshot }>(
      `${baseUrl}/api/wine-cellar/snapshot?hotelId=${encodeURIComponent(scope.hotelId)}&areaId=${encodeURIComponent(scope.areaId)}`
    );

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      snapshot: {
        racks: [],
        positions: [],
        assignments: [],
        countSessions: [],
        countEntries: [],
        receipts: [],
        adjustments: [],
        auditEvents: []
      }
    });
  });

  it("PUT replaces a complete snapshot and makes it visible by GET", async () => {
    const database = createWineCellarDatabase(":memory:");
    const server = await loadWineCellarRoutes(database);
    const baseUrl = await startServer(server);

    const putResponse = await requestJson(`${baseUrl}/api/wine-cellar/snapshot`, {
      body: JSON.stringify({ scope, snapshot: updatedSnapshot }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });

    expect(putResponse.response.status).toBe(200);
    expect(putResponse.payload).toMatchObject({ snapshot: expect.objectContaining({ racks: expect.arrayContaining([expect.objectContaining({ id: "rack-a" })]) }) });

    const { response, payload } = await requestJson<{ snapshot: typeof updatedSnapshot }>(
      `${baseUrl}/api/wine-cellar/snapshot?hotelId=${encodeURIComponent(scope.hotelId)}&areaId=${encodeURIComponent(scope.areaId)}`
    );
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      snapshot: {
        racks: [{ id: "rack-a", name: "A架" }],
        positions: [{ id: "pos-a1", code: "A1" }],
        assignments: [{ id: "assign-1", productName: "House Red" }]
      }
    });
  });

  it("returns 400 when scope is invalid", async () => {
    const database = createWineCellarDatabase(":memory:");
    const server = await loadWineCellarRoutes(database);
    const baseUrl = await startServer(server);

    const { response } = await requestJson(`${baseUrl}/api/wine-cellar/snapshot?hotelId=${encodeURIComponent(scope.hotelId)}`);
    expect(response.status).toBe(400);
  });

  it("returns 400 when scope or snapshot is invalid on PUT", async () => {
    const database = createWineCellarDatabase(":memory:");
    const server = await loadWineCellarRoutes(database);
    const baseUrl = await startServer(server);

    const missingScope = await requestJson(`${baseUrl}/api/wine-cellar/snapshot`, {
      body: JSON.stringify({ snapshot: updatedSnapshot }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });
    expect(missingScope.response.status).toBe(400);

    const invalidSnapshot = await requestJson(`${baseUrl}/api/wine-cellar/snapshot`, {
      body: JSON.stringify({ scope, snapshot: { racks: [] } }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });
    expect(invalidSnapshot.response.status).toBe(400);
  });
});
