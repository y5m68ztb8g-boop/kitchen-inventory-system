// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";

import {
  createPurchasingDatabase,
  getOrCreateDraftBatch,
  getBatchDetail,
  type OrderingProfile
} from "../../server/ordering/database";
import { orderingTask3Candidates, orderingTask3InventorySnapshot } from "./fixtures/task-3-ordering-api-fixtures";

type RouteHandler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void | Promise<void>;

type OrderingMiddlewareServer = { middlewares: { use: (handler: RouteHandler) => void } };

type OrderingRouteOptions = {
  database: Database.Database;
  historicalCandidates?: () => Promise<unknown> | unknown;
  orderingInventory?: () => Promise<Map<string, unknown>> | Map<string, unknown>;
};

type InstallOrderingRoutes = (server: OrderingMiddlewareServer, options: OrderingRouteOptions) => void;

type RouteEnvironment = {
  database: Database.Database;
  install: InstallOrderingRoutes;
};

const resources: Array<{ database: Database.Database; server: Server }> = [];

async function loadOrderingRoutes(): Promise<InstallOrderingRoutes> {
  const module = await import("../../server/ordering/routes");
  return module.installOrderingRoutes as InstallOrderingRoutes;
}

async function createTestServer(options: OrderingRouteOptions) {
  const install = await loadOrderingRoutes();
  let handler: RouteHandler | undefined;

  install({ middlewares: { use: (next) => (handler = next) } }, options);
  if (!handler) {
    throw new Error("Failed to install ordering routes.");
  }

  const server = createServer((request, response) => {
    void handler?.(request, response, () => {
      response.statusCode = 204;
      response.end();
    });
  });

  resources.push({ database: options.database, server });
  return server;
}

async function startServer(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address.");
  }
  return `http://127.0.0.1:${address.port}`;
}

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

function createReadyIntake(database: Database.Database) {
  database.prepare(
    `
    INSERT INTO purchase_intakes (
      id, status, source_type, original_filename, original_mime_type, stored_mime_type,
      original_size_bytes, stored_size_bytes, source_blob, ai_model, unreadable_text_json,
      general_notes, created_at, updated_at, handed_off_at
    ) VALUES (
      'intake-1', 'ReadyForPurchase', 'pdf', 'order-sheet.pdf', 'application/pdf',
      'application/pdf', 10, 10, X'010203', null, '[]', 'from kitchen',
      '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z'
    )
    `
  ).run();

  database.prepare(
    `
    INSERT INTO purchase_intake_items (
      id, intake_id, row_order, department, raw_text, product_name, quantity, unit, notes,
      confidence, manual_reviewed, supplier_product_id, supplier_name, supplier_code, supplier_product_code,
      supplier_product_name, supplier_pack_size, supplier_last_price, supplier_purchase_count,
      supplier_last_purchase_date, current_inventory_quantity, created_at, updated_at
    ) VALUES (
      'intake-1:item-1', 'intake-1', 0, 'Kitchen', '4 roll', 'Bread roll', 4, 'tray', null,
      0.99, 1, 'BRK-100243', 'Brakes', 'BRK', '100243',
      'Bread Roll', '8x6', 12.5, 5, '2026-06-30', 1.5, '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z'
    )
    `
  ).run();
}

async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string };
    batch?: Record<string, unknown>;
    readyIntakes?: unknown[];
    intakeStatus?: string;
  } | null;

  return { response, payload };
}

describe("ordering routes", () => {
  it("GET /api/ordering/current returns current draft batch and ready intakes", async () => {
    const database = createPurchasingDatabase(":memory:");
    createReadyIntake(database);

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const { response, payload } = await requestJson(`${baseUrl}/api/ordering/current`);
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      batch: expect.objectContaining({ status: "Draft", id: expect.any(String) }),
      readyIntakes: expect.arrayContaining([
        expect.objectContaining({ id: "intake-1", originalFilename: "order-sheet.pdf", handedOffAt: "2026-07-11T10:00:00.000Z", itemCount: 1 })
      ])
    });
  });

  it("POST /api/ordering/current/intakes/:id imports one intake once and marks it AddedToOrder", async () => {
    const database = createPurchasingDatabase(":memory:");
    createReadyIntake(database);

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);
    const { response, payload } = await requestJson(`${baseUrl}/api/ordering/current/intakes/intake-1`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      intakeStatus: "AddedToOrder",
      batch: expect.objectContaining({ status: "Draft", items: expect.arrayContaining([expect.objectContaining({ supplierProductId: "BRK-100243" })]) })
    });

    const secondImport = await requestJson(`${baseUrl}/api/ordering/current/intakes/intake-1`, { method: "POST" });
    expect(secondImport.response.status).toBe(400);
    expect(secondImport.payload).toMatchObject({ error: { code: "INTAKE_ALREADY_ADDED" } });
  });

  it("rejects client-supplied supplier snapshot fields and rehydrates by catalogue id", async () => {
    const database = createPurchasingDatabase(":memory:");
    const draftBatch = getOrCreateDraftBatch(database).id;
    const responsePayload = await getBatchDetail(database, draftBatch);
    if (responsePayload.suppliers.length === 0) {
      // keep explicit for TypeScript/linters; not a functional branch.
      expect(responsePayload.suppliers).toHaveLength(0);
    }

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const forgedInput = await requestJson(`${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items`, {
      body: JSON.stringify({ supplierProductId: "made-up", orderQuantity: 2 }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(forgedInput.response.status).toBe(400);
    expect(forgedInput.payload).toMatchObject({ error: { code: "SUPPLIER_PRODUCT_NOT_FOUND" } });

    const trustedInput = await requestJson(`${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items`, {
      body: JSON.stringify({ supplierProductId: "BRK-100243", orderQuantity: 2 }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(trustedInput.response.status).toBe(200);
    expect(trustedInput.payload).toMatchObject({
      batch: expect.objectContaining({
        items: [
          expect.objectContaining({
            supplierProductId: "BRK-100243",
            productName: "Bread Roll",
            supplierName: "Brakes",
            supplierProductCode: "100243",
            packSize: "8x6",
            lastPrice: 12.5,
            purchaseCount: 5,
            latestPurchaseDate: "2026-06-30"
          })
        ]
      })
    });
  });

  it("PO endpoint and batch CRUD round-trips matched + unmatched items", async () => {
    const database = createPurchasingDatabase(":memory:");
    const draftBatch = getOrCreateDraftBatch(database).id;

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const { response: putPoResponse, payload: putPoPayload } = await requestJson(
      `${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/po`,
      {
        body: JSON.stringify({ poNumber: "PO-001" }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      }
  );
    expect(putPoResponse.status).toBe(200);
    expect(putPoPayload).toMatchObject({ poNumber: "PO-001" });

    const addUnmatchedResponse = await requestJson(`${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items`, {
      body: JSON.stringify({
        productName: "Manual Carrot",
        orderQuantity: 3,
        orderUnit: "kg",
        supplierGroup: "CMP",
        supplierProductCode: "CMP-888"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(addUnmatchedResponse.response.status).toBe(200);
    const itemId = addUnmatchedResponse.payload?.batch?.items?.[0]?.id as string | undefined;
    expect(itemId).toBeTypeOf("string");

    const current = await requestJson(`${baseUrl}/api/ordering/current`);
    expect(current.response.status).toBe(200);
    expect(current.payload).toMatchObject({
      batch: expect.objectContaining({
        items: [
          expect.objectContaining({ supplierGroup: "CMP", productName: "Manual Carrot", orderQuantity: 3, orderUnit: "kg" })
        ]
      })
    });

    const update = await requestJson(
      `${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items/${encodeURIComponent(String(itemId))}`,
      {
        body: JSON.stringify({ orderQuantity: 4, supplierProductCode: "CMP-889" }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      }
    );
    expect(update.response.status).toBe(200);
    expect(update.payload).toMatchObject({ batch: expect.objectContaining({ items: [expect.objectContaining({ orderQuantity: 4 })] }) });

    const currentAfterUpdate = await requestJson(`${baseUrl}/api/ordering/current`);
    const currentAfterUpdateItem = (currentAfterUpdate.payload?.batch?.items as Array<Record<string, unknown>> | undefined)?.find(
      (item) => item.id === itemId
    );
    expect(currentAfterUpdateItem).toMatchObject({ supplierProductCode: "CMP-889" });

    const del = await requestJson(
      `${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items/${encodeURIComponent(String(itemId))}`,
      { method: "DELETE" }
    );
    expect(del.response.status).toBe(200);
    const deletedItems = Array.isArray(del.payload?.batch?.items) ? del.payload?.batch?.items : [];
    expect(deletedItems).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: itemId })]));

    const insufficient = await requestJson(`${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items`, {
      body: JSON.stringify({ productName: "Bad Number", orderQuantity: 0, orderUnit: "kg", supplierGroup: "MM" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(insufficient.response.status).toBe(400);
    expect(insufficient.payload).toMatchObject({ error: { code: "INVALID_ORDER_QUANTITY" } });
  });

  it("profile endpoints round-trip name/email config", async () => {
    const database = createPurchasingDatabase(":memory:");

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const firstProfile = await requestJson(`${baseUrl}/api/ordering/profile`);
    expect(firstProfile.response.status).toBe(200);
    expect(firstProfile.payload).toMatchObject({ purchaserName: "", hotelName: "", campbellsEmail: "", markMurphyEmail: "" });

    const updatedProfile = {
      purchaserName: "Ada",
      hotelName: "Blue Bay Hotel",
      campbellsEmail: "buy@campbells.example",
      markMurphyEmail: "buy@murphy.example"
    } satisfies OrderingProfile;

    const secondProfile = await requestJson(`${baseUrl}/api/ordering/profile`, {
      body: JSON.stringify(updatedProfile),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });
    expect(secondProfile.response.status).toBe(200);
    expect(secondProfile.payload).toMatchObject(updatedProfile);
  });

  it("GET current batch includes server-enriched inventory snapshot fields on matched items", async () => {
    const database = createPurchasingDatabase(":memory:");
    const draftBatch = getOrCreateDraftBatch(database).id;

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const addMatch = await requestJson(`${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items`, {
      body: JSON.stringify({ supplierProductId: "BRK-100243", orderQuantity: 2 }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(addMatch.response.status).toBe(200);

    const current = await requestJson(`${baseUrl}/api/ordering/current`);
    expect(current.response.status).toBe(200);
    const batchItem = (current.payload?.batch?.items as Array<Record<string, unknown>> | undefined)?.[0];
    expect(batchItem).toMatchObject({
      supplierProductId: "BRK-100243",
      totalEquivalentQuantity: 3.5
    });
    expect(batchItem?.["locations"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ warehouse: "freezer", equivalentQuantity: 1.5 }),
        expect.objectContaining({ warehouse: "dry-store", equivalentQuantity: 2 })
      ])
    );
  });
});
