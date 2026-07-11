// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";

import {
  createPurchasingDatabase,
  getOrCreateDraftBatch,
  getBatchDetail,
  addBatchItem,
  saveBrakesQuickAddResults,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
  type OrderingProfile
} from "../../server/ordering/database";
import { orderingTask3Candidates, orderingTask3InventorySnapshot } from "./fixtures/task-3-ordering-api-fixtures";

type RouteHandler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void | Promise<void>;

type OrderingMiddlewareServer = { middlewares: { use: (handler: RouteHandler) => void } };

type OrderingRouteOptions = {
  database: Database.Database;
  historicalCandidates?: () => Promise<unknown> | unknown;
  orderingInventory?: () => Promise<Map<string, unknown>> | Map<string, unknown>;
  brakesQuickAddRunner?: {
    fill: (items: Array<{ itemId: string; productCode: string; quantity: number }>) => Promise<
      Array<{
        itemId: string;
        status: "Added" | "AwaitingConfirmation" | "InvalidCode" | "Failed";
        message: string | null;
      }>
    >;
  };
};

type InstallOrderingRoutes = (server: OrderingMiddlewareServer, options: OrderingRouteOptions) => void;

type RouteEnvironment = {
  database: Database.Database;
  install: InstallOrderingRoutes;
};

const intakeStatusQuery = "SELECT status FROM purchase_intakes WHERE id = ?";

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

function createReadyIntake(
  database: Database.Database,
  options: {
    intakeId?: string;
    supplierProductId?: string;
    supplierName?: string;
    supplierCode?: string;
    supplierProductCode?: string;
    productName?: string;
    packSize?: string;
    lastPrice?: number;
    purchaseCount?: number;
    latestPurchaseDate?: string;
  } = {}
) {
  const intakeId = options.intakeId ?? "intake-1";
  const supplierProductId = options.supplierProductId ?? "BRK-100243";
  const supplierName = options.supplierName ?? "Brakes";
  const supplierCode = options.supplierCode ?? "BRK";
  const supplierProductCode = options.supplierProductCode ?? "100243";
  const productName = options.productName ?? "Bread roll";
  const packSize = options.packSize ?? "8x6";
  const lastPrice = options.lastPrice ?? 12.5;
  const purchaseCount = options.purchaseCount ?? 5;
  const latestPurchaseDate = options.latestPurchaseDate ?? "2026-06-30";

  database.prepare(
    `
    INSERT INTO purchase_intakes (
      id, status, source_type, original_filename, original_mime_type, stored_mime_type,
      original_size_bytes, stored_size_bytes, source_blob, ai_model, unreadable_text_json,
      general_notes, created_at, updated_at, handed_off_at
    ) VALUES (
      ?, 'ReadyForPurchase', 'pdf', 'order-sheet.pdf', 'application/pdf',
      'application/pdf', 10, 10, X'010203', null, '[]', 'from kitchen',
      '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z'
    )
    `
  ).run(intakeId);

  const itemId = `${intakeId}:item-1`;
  database
    .prepare(
      `
      INSERT INTO purchase_intake_items (
        id, intake_id, row_order, department, raw_text, product_name, quantity, unit, notes,
        confidence, manual_reviewed, supplier_product_id, supplier_name, supplier_code, supplier_product_code,
        supplier_product_name, supplier_pack_size, supplier_last_price, supplier_purchase_count,
        supplier_last_purchase_date, current_inventory_quantity, created_at, updated_at
      ) VALUES (
        ?, ?, 0, 'Kitchen', '4 roll', ?, 4, 'tray', null,
        0.99, 1, ?, ?, ?, ?,
        'Bread Roll', ?, ?, ?, ?, 1.5, '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z'
      )
      `
    )
    .run(
      itemId,
      intakeId,
      productName,
      supplierProductId,
      supplierName,
      supplierCode,
      supplierProductCode,
      packSize,
      lastPrice,
      purchaseCount,
      latestPurchaseDate
    );

  return intakeId;
}

async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string };
    batch?: Record<string, unknown> & { items?: Array<Record<string, unknown>> };
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

  it("keeps intake and batch unchanged when matched rehydrate fails during intake import", async () => {
    const database = createPurchasingDatabase(":memory:");
    createReadyIntake(database, { supplierName: "Brakes" });
    const batch = getOrCreateDraftBatch(database, "2026-07-11T10:00:00.000Z");

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS force_rehydrate_failure
      BEFORE UPDATE OF supplier_name ON purchase_batch_items
      WHEN NEW.supplier_name = 'Canonical Brakes'
      BEGIN
        SELECT RAISE(ABORT, 'forced rehydrate failure');
      END
    `);

    const brokenCandidates = [
      {
        id: "BRK-100243",
        latestPrice: 12.5,
        latestPurchaseDate: "2026-06-30",
        packSize: "8x6",
        productName: "Bread Roll",
        purchaseCount: 5,
        supplierCode: "BRK",
        supplierName: "Canonical Brakes",
        supplierProductCode: "100243"
      }
    ];

    const server = await createTestServer({
      database,
      historicalCandidates: () => brokenCandidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const failedImport = await requestJson(`${baseUrl}/api/ordering/current/intakes/intake-1`, { method: "POST" });
    expect(failedImport.response.status).toBe(500);
    const intakeStatus = database.prepare(intakeStatusQuery).pluck().get("intake-1");
    expect(intakeStatus).toBe("ReadyForPurchase");
    expect(getBatchDetail(database, batch.id).items).toHaveLength(0);
  });

  it("transitions matched item to unmatched in one update payload and rejects null-only product conversion", async () => {
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
    const itemId = addMatch.payload?.batch?.items?.[0]?.id as string | undefined;
    expect(itemId).toBeTypeOf("string");

    const convertToUnmatched = await requestJson(
      `${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items/${encodeURIComponent(String(itemId))}`,
      {
        body: JSON.stringify({
          supplierProductId: null,
          productName: "Manual Bread",
          orderQuantity: 4,
          orderUnit: "crate",
          supplierGroup: "UNMATCHED",
          supplierProductCode: null
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      }
    );
    expect(convertToUnmatched.response.status).toBe(200);
    const item = (
      convertToUnmatched.payload?.batch?.items as Array<Record<string, unknown>> | undefined
    )?.find((entry) => entry.id === itemId);
    expect(item).toMatchObject({
      supplierProductId: null,
      supplierGroup: "UNMATCHED",
      productName: "Manual Bread",
      orderQuantity: 4,
      orderUnit: "crate",
      supplierProductCode: null,
      supplierName: null,
      packSize: null,
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    });

    const nullOnly = await requestJson(
      `${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items/${encodeURIComponent(String(itemId))}`,
      {
        body: JSON.stringify({ supplierProductId: null }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      }
    );
    expect(nullOnly.response.status).toBe(400);
    expect(nullOnly.payload).toMatchObject({ error: { code: "INVALID_ORDERING_DATA" } });
  });

  it("returns INTAKE_ALREADY_ADDED when re-posting same intake even if candidates become empty", async () => {
    const database = createPurchasingDatabase(":memory:");
    createReadyIntake(database);

    const candidateSource = { entries: orderingTask3Candidates };
    const server = await createTestServer({
      database,
      historicalCandidates: () => candidateSource.entries,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const firstImport = await requestJson(`${baseUrl}/api/ordering/current/intakes/intake-1`, { method: "POST" });
    expect(firstImport.response.status).toBe(200);
    candidateSource.entries = [];

    const secondImport = await requestJson(`${baseUrl}/api/ordering/current/intakes/intake-1`, { method: "POST" });
    expect(secondImport.response.status).toBe(400);
    expect(secondImport.payload).toMatchObject({ error: { code: "INTAKE_ALREADY_ADDED" } });
  });

  it("rejects extra unknown fields in strict body schemas", async () => {
    const database = createPurchasingDatabase(":memory:");
    const draftBatch = getOrCreateDraftBatch(database).id;

    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const extraFieldResponse = await requestJson(`${baseUrl}/api/ordering/batches/${encodeURIComponent(draftBatch)}/items`, {
      body: JSON.stringify({
        supplierProductId: "BRK-100243",
        orderQuantity: 2,
        unexpectedField: "not-allowed"
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(extraFieldResponse.response.status).toBe(400);
    expect(extraFieldResponse.payload).toMatchObject({ error: { code: "INVALID_ORDERING_DATA" } });
  });

  it("uses fresh orderingInventory snapshots on each current GET", async () => {
    const database = createPurchasingDatabase(":memory:");
    const draftBatch = getOrCreateDraftBatch(database).id;
    const snapshots = [
      new Map([
        [
          "BRK-100243",
          {
            supplierProductId: "BRK-100243",
            totalEquivalentQuantity: 3.5,
            locations: [
              {
                warehouse: "freezer",
                warehouseLabel: "冷冻库",
                locationCode: "A1",
                displayQuantity: "1.5",
                equivalentQuantity: 1.5
              }
            ]
          }
        ]
      ]),
      new Map([
        [
          "BRK-100243",
          {
            supplierProductId: "BRK-100243",
            totalEquivalentQuantity: 11.75,
            locations: [
              {
                warehouse: "dry-store",
                warehouseLabel: "干货库",
                locationCode: "C0",
                displayQuantity: "11.75",
                equivalentQuantity: 11.75
              }
            ]
          }
        ]
      ])
    ];

    let inventoryCallCount = 0;
    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => {
        const snapshot = snapshots[inventoryCallCount % snapshots.length];
        inventoryCallCount += 1;
        return snapshot;
      }
    });
    const baseUrl = await startServer(server);

    addBatchItem(database, {
      batchId: draftBatch,
      productName: "Bread Roll",
      supplierGroup: "BRK",
      supplierProductId: "BRK-100243",
      supplierProductCode: "100243",
      supplierName: "Brakes",
      packSize: "8x6",
      orderQuantity: 2,
      orderUnit: "tray",
      lastPrice: 12.5,
      purchaseCount: 5,
      latestPurchaseDate: "2026-06-30"
    });

    const firstCurrent = await requestJson(`${baseUrl}/api/ordering/current`);
    expect(firstCurrent.response.status).toBe(200);
    const firstSnapshotItem = firstCurrent.payload?.batch?.items?.[0] as Record<string, unknown> | undefined;
    expect(firstSnapshotItem).toMatchObject({ totalEquivalentQuantity: 3.5 });
    expect(firstSnapshotItem?.locations).toEqual(expect.arrayContaining([expect.objectContaining({ warehouse: "freezer" })]));

    const secondCurrent = await requestJson(`${baseUrl}/api/ordering/current`);
    expect(secondCurrent.response.status).toBe(200);
    const secondSnapshotItem = secondCurrent.payload?.batch?.items?.[0] as Record<string, unknown> | undefined;
    expect(secondSnapshotItem).toMatchObject({ totalEquivalentQuantity: 11.75 });
    expect(secondSnapshotItem?.locations).toEqual(
      expect.arrayContaining([expect.objectContaining({ warehouse: "dry-store", equivalentQuantity: 11.75 })])
    );
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

  it("returns PO_REQUIRED instead of 500 when CMP preparation has no PO", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    addBatchItem(database, {
      batchId,
      productName: "CMP low-stock item",
      supplierGroup: "CMP",
      supplierProductId: "CMP-LOW-STOCK",
      supplierProductCode: "CMP-100",
      supplierName: "Campbells",
      packSize: "case",
      orderQuantity: 1,
      orderUnit: "case",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    });
    saveOrderingProfile(database, {
      purchaserName: "Ada Buyer",
      hotelName: "Natural Growth Hotel",
      campbellsEmail: "orders@campbells.example",
      markMurphyEmail: "orders@markmurphy.example"
    });
    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => new Map([
        ["CMP-LOW-STOCK", { supplierProductId: "CMP-LOW-STOCK", totalEquivalentQuantity: 1, locations: [] }]
      ])
    });
    const baseUrl = await startServer(server);

    const result = await requestJson(`${baseUrl}/api/ordering/batches/${batchId}/suppliers/CMP/prepare`, { method: "POST" });

    expect(result.response.status).toBe(400);
    expect(result.payload).toMatchObject({ error: { code: "PO_REQUIRED" } });
  });

  it("returns ORDERING_PROFILE_REQUIRED for each missing CMP ordering profile field instead of 500", async () => {
    const completeProfile = {
      purchaserName: "Ada Buyer",
      hotelName: "Natural Growth Hotel",
      campbellsEmail: "orders@campbells.example",
      markMurphyEmail: "orders@markmurphy.example"
    } satisfies OrderingProfile;

    for (const missing of ["purchaserName", "hotelName", "campbellsEmail"] as const) {
      const database = createPurchasingDatabase(":memory:");
      const batchId = getOrCreateDraftBatch(database).id;
      saveBatchPo(database, batchId, `PO-MISSING-${missing}`);
      saveOrderingProfile(database, { ...completeProfile, [missing]: "" });
      addBatchItem(database, {
        batchId,
        productName: `CMP missing ${missing}`,
        supplierGroup: "CMP",
        supplierProductId: `CMP-${missing}`,
        supplierProductCode: `CMP-${missing}`,
        supplierName: "Campbells",
        packSize: "case",
        orderQuantity: 1,
        orderUnit: "case",
        lastPrice: null,
        purchaseCount: null,
        latestPurchaseDate: null
      });
      const server = await createTestServer({
        database,
        historicalCandidates: () => orderingTask3Candidates,
        orderingInventory: () => new Map([
          [`CMP-${missing}`, { supplierProductId: `CMP-${missing}`, totalEquivalentQuantity: 1, locations: [] }]
        ])
      });
      const baseUrl = await startServer(server);

      const result = await requestJson(`${baseUrl}/api/ordering/batches/${batchId}/suppliers/CMP/prepare`, { method: "POST" });

      expect(result.response.status).toBeGreaterThanOrEqual(400);
      expect(result.response.status).toBeLessThan(500);
      expect(result.payload).toMatchObject({ error: { code: "ORDERING_PROFILE_REQUIRED" } });
    }
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

  it("runs Brakes Quick Add only after an explicit POST, saves every result, and never marks the supplier ordered", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    saveBatchPo(database, batchId, "PO-TASK-6");
    const first = addBatchItem(database, {
      batchId,
      productName: "Bread Roll",
      supplierGroup: "BRK",
      supplierProductId: "BRK-100243",
      supplierProductCode: "100243",
      supplierName: "Brakes",
      packSize: "8x6",
      orderQuantity: 2,
      orderUnit: "8x6",
      lastPrice: 12.5,
      purchaseCount: 5,
      latestPurchaseDate: "2026-06-30"
    });
    const itemId = first.items[0].id;
    const fill = vi.fn().mockResolvedValue([
      { itemId, status: "Added", message: null }
    ]);
    const server = await createTestServer({
      database,
      brakesQuickAddRunner: { fill },
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => new Map([
        ["BRK-100243", { supplierProductId: "BRK-100243", totalEquivalentQuantity: 1, locations: [] }]
      ])
    });
    const baseUrl = await startServer(server);
    const route = `${baseUrl}/api/ordering/batches/${batchId}/suppliers/BRK/quick-add`;

    expect(fill).not.toHaveBeenCalled();
    const getResponse = await requestJson(route);
    expect(getResponse.response.status).toBe(405);
    expect(fill).not.toHaveBeenCalled();

    const quickAdd = await requestJson(route, { method: "POST" });
    expect(quickAdd.response.status).toBe(200);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(fill).toHaveBeenCalledWith([{ itemId, productCode: "100243", quantity: 2 }]);
    const saved = getBatchDetail(database, batchId);
    expect(saved.items[0]).toMatchObject({ id: itemId, brakesStatus: "Added" });
    expect(saved.suppliers.find((supplier) => supplier.supplierCode === "BRK")).toMatchObject({
      status: "Prepared",
      orderedAt: null
    });
    expect(saved.status).toBe("Draft");
  });

  it("excludes already Added Brakes items from Quick Add retries and preserves their status", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    saveBatchPo(database, batchId, "PO-RETRY-ADDED");
    addBatchItem(database, {
      batchId,
      productName: "Already added Brakes item",
      supplierGroup: "BRK",
      supplierProductId: "BRK-ADDED",
      supplierProductCode: "ADDED-100",
      supplierName: "Brakes",
      packSize: "case",
      orderQuantity: 2,
      orderUnit: "case",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    });
    const batch = addBatchItem(database, {
      batchId,
      productName: "Failed Brakes item",
      supplierGroup: "BRK",
      supplierProductId: "BRK-FAILED",
      supplierProductCode: "FAILED-200",
      supplierName: "Brakes",
      packSize: "case",
      orderQuantity: 3,
      orderUnit: "case",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    });
    const addedItem = batch.items.find((item) => item.supplierProductId === "BRK-ADDED")!;
    const failedItem = batch.items.find((item) => item.supplierProductId === "BRK-FAILED")!;
    saveBrakesQuickAddResults(database, {
      batchId,
      results: [
        { itemId: addedItem.id, status: "Added", message: null },
        { itemId: failedItem.id, status: "Failed", message: "temporary failure" }
      ]
    });

    const fill = vi.fn().mockResolvedValue([
      { itemId: failedItem.id, status: "Added", message: null }
    ]);
    const server = await createTestServer({
      database,
      brakesQuickAddRunner: { fill },
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => new Map([
        ["BRK-ADDED", { supplierProductId: "BRK-ADDED", totalEquivalentQuantity: 1, locations: [] }],
        ["BRK-FAILED", { supplierProductId: "BRK-FAILED", totalEquivalentQuantity: 1, locations: [] }]
      ])
    });
    const baseUrl = await startServer(server);

    const response = await requestJson(`${baseUrl}/api/ordering/batches/${batchId}/suppliers/BRK/quick-add`, { method: "POST" });

    expect(response.response.status).toBe(200);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(fill).toHaveBeenCalledWith([
      { itemId: failedItem.id, productCode: "FAILED-200", quantity: 3 }
    ]);
    expect(fill.mock.calls[0][0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: addedItem.id })])
    );
    expect(getBatchDetail(database, batchId).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: addedItem.id, brakesStatus: "Added" }),
      expect.objectContaining({ id: failedItem.id, brakesStatus: "Added" })
    ]));
  });

  it("blocks Quick Add on high stock before invoking the fake runner", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    saveBatchPo(database, batchId, "PO-TASK-6");
    addBatchItem(database, {
      batchId,
      productName: "Bread Roll",
      supplierGroup: "BRK",
      supplierProductId: "BRK-100243",
      supplierProductCode: "100243",
      supplierName: "Brakes",
      packSize: "8x6",
      orderQuantity: 2,
      orderUnit: "8x6",
      lastPrice: 12.5,
      purchaseCount: 5,
      latestPurchaseDate: "2026-06-30"
    });
    const fill = vi.fn();
    const server = await createTestServer({
      database,
      brakesQuickAddRunner: { fill },
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => orderingTask3InventorySnapshot
    });
    const baseUrl = await startServer(server);

    const result = await requestJson(`${baseUrl}/api/ordering/batches/${batchId}/suppliers/BRK/quick-add`, { method: "POST" });

    expect(result.response.status).toBe(409);
    expect(result.payload).toMatchObject({
      kind: "inventory-review-required",
      items: expect.arrayContaining([expect.objectContaining({ itemId: expect.any(String) })])
    });
    expect(fill).not.toHaveBeenCalled();
  });

  it("rejects Quick Add without PO, product code, or positive quantity and never invokes the runner", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    const added = addBatchItem(database, {
      batchId,
      productName: "Manual Brakes item",
      supplierGroup: "BRK",
      supplierProductId: null,
      supplierProductCode: null,
      supplierName: "Brakes",
      packSize: null,
      orderQuantity: 1,
      orderUnit: "case",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    });
    const itemId = added.items[0].id;
    const fill = vi.fn();
    const server = await createTestServer({
      database,
      brakesQuickAddRunner: { fill },
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => new Map()
    });
    const baseUrl = await startServer(server);
    const route = `${baseUrl}/api/ordering/batches/${batchId}/suppliers/BRK/quick-add`;

    const missingPo = await requestJson(route, { method: "POST" });
    expect(missingPo.response.status).toBe(400);
    expect(missingPo.payload).toMatchObject({ error: { code: "PO_REQUIRED" } });

    saveBatchPo(database, batchId, "PO-TASK-6");
    const missingCode = await requestJson(route, { method: "POST" });
    expect(missingCode.response.status).toBe(400);
    expect(missingCode.payload).toMatchObject({ error: { code: "INVALID_ORDERING_DATA" } });

    database.pragma("ignore_check_constraints = ON");
    try {
      database.prepare("UPDATE purchase_batch_items SET supplier_product_code = 'VALID', order_quantity = 0 WHERE id = ?").run(itemId);
    } finally {
      database.pragma("ignore_check_constraints = OFF");
    }
    const invalidQuantity = await requestJson(route, { method: "POST" });
    expect(invalidQuantity.response.status).toBe(400);
    expect(invalidQuantity.payload).toMatchObject({ error: { code: "INVALID_ORDER_QUANTITY" } });
    expect(fill).not.toHaveBeenCalled();
  });

  it("allows only Prepared CMP, MM, and BRK groups to be marked ordered and keeps groups independent", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    const common = {
      batchId,
      supplierProductId: null,
      packSize: "case",
      orderQuantity: 1,
      orderUnit: "case",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    };
    addBatchItem(database, { ...common, productName: "CMP item", supplierGroup: "CMP", supplierProductCode: "CMP-1", supplierName: "Campbells" });
    addBatchItem(database, { ...common, productName: "MM item", supplierGroup: "MM", supplierProductCode: "MM-1", supplierName: "Mark Murphy" });
    const brakes = addBatchItem(database, { ...common, productName: "BRK item", supplierGroup: "BRK", supplierProductCode: "BRK-1", supplierName: "Brakes" });
    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => new Map()
    });
    const baseUrl = await startServer(server);
    const markUrl = (supplier: "CMP" | "MM" | "BRK") => `${baseUrl}/api/ordering/batches/${batchId}/suppliers/${supplier}/mark-ordered`;

    const pending = await requestJson(markUrl("CMP"), { method: "POST" });
    expect(pending.response.status).toBe(409);
    expect(pending.payload).toMatchObject({ error: { code: "SUPPLIER_NOT_PREPARED" } });

    saveSupplierEmailDraft(database, { batchId, supplierCode: "CMP", draft: { to: "cmp@example.com", subject: "PO", body: "CMP order" } });
    saveSupplierEmailDraft(database, { batchId, supplierCode: "MM", draft: { to: "mm@example.com", subject: "PO", body: "MM order" } });
    saveBrakesQuickAddResults(database, { batchId, results: [{ itemId: brakes.items.find((item) => item.supplierGroup === "BRK")!.id, status: "Added", message: null }] });

    const cmp = await requestJson(markUrl("CMP"), { method: "POST" });
    expect(cmp.response.status).toBe(200);
    expect(cmp.payload?.batch).toMatchObject({ status: "PartiallyOrdered" });
    expect(getBatchDetail(database, batchId).suppliers).toEqual(expect.arrayContaining([
      expect.objectContaining({ supplierCode: "CMP", status: "Ordered" }),
      expect.objectContaining({ supplierCode: "MM", status: "Prepared", orderedAt: null }),
      expect.objectContaining({ supplierCode: "BRK", status: "Prepared", orderedAt: null })
    ]));

    expect((await requestJson(markUrl("MM"), { method: "POST" })).response.status).toBe(200);
    expect((await requestJson(markUrl("BRK"), { method: "POST" })).response.status).toBe(200);
    expect(getBatchDetail(database, batchId)).toMatchObject({ status: "Ordered" });
  });

  it("mark ordered does not change the ordering inventory snapshot", async () => {
    const database = createPurchasingDatabase(":memory:");
    const batchId = getOrCreateDraftBatch(database).id;
    addBatchItem(database, {
      batchId,
      productName: "CMP stock item",
      supplierGroup: "CMP",
      supplierProductId: "CMP-STOCK-1",
      supplierProductCode: "CMP-STOCK-1",
      supplierName: "Campbells",
      packSize: "case",
      orderQuantity: 1,
      orderUnit: "case",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    });
    saveSupplierEmailDraft(database, { batchId, supplierCode: "CMP", draft: { to: "cmp@example.com", subject: "PO", body: "CMP order" } });
    const inventory = new Map([
      ["CMP-STOCK-1", { supplierProductId: "CMP-STOCK-1", totalEquivalentQuantity: 7.5, locations: [{ warehouse: "dry-store", locationCode: "A1", equivalentQuantity: 7.5 }] }]
    ]);
    const before = structuredClone([...inventory.entries()]);
    const server = await createTestServer({
      database,
      historicalCandidates: () => orderingTask3Candidates,
      orderingInventory: () => inventory
    });
    const baseUrl = await startServer(server);

    const result = await requestJson(`${baseUrl}/api/ordering/batches/${batchId}/suppliers/CMP/mark-ordered`, { method: "POST" });

    expect(result.response.status).toBe(200);
    expect([...inventory.entries()]).toEqual(before);
    expect(getBatchDetail(database, batchId).items[0]).toMatchObject({ productName: "CMP stock item", orderQuantity: 1 });
  });
});
