// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmWhiteboardScan,
  createPurchasingDatabase,
  getScanImage,
  saveDraftScan
} from "../../server/purchasing/database";

const openDatabases: Database.Database[] = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
});

function createDatabase() {
  const database = createPurchasingDatabase(":memory:");
  openDatabases.push(database);
  return database;
}

function saveDraft(database: Database.Database, id = "scan-1") {
  saveDraftScan(database, {
    aiModel: "gpt-test",
    createdAt: "2026-07-10T09:00:00.000Z",
    generalNotes: "Kitchen board",
    id,
    image: Buffer.from([0, 1, 2, 255]),
    originalFilename: "board.heic",
    originalMimeType: "image/heic",
    originalSizeBytes: 1200,
    storedMimeType: "image/webp",
    storedSizeBytes: 4,
    unreadableText: ["lower corner"]
  });
}

describe("createPurchasingDatabase", () => {
  it("creates the purchasing schema idempotently and enables foreign keys", () => {
    const database = createDatabase();

    expect(() => createPurchasingDatabase(database)).not.toThrow();
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'whiteboard_%' ORDER BY name")
        .all()
    ).toEqual([{ name: "whiteboard_scan_items" }, { name: "whiteboard_scans" }]);
  });
});

describe("draft scans", () => {
  it("saves and retrieves the original scan image by ID", () => {
    const database = createDatabase();
    saveDraft(database);

    expect(getScanImage(database, "scan-1")).toEqual({
      buffer: Buffer.from([0, 1, 2, 255]),
      filename: "board.heic",
      mimeType: "image/webp"
    });
    expect(getScanImage(database, "missing")).toBeNull();
  });
});

describe("confirmWhiteboardScan", () => {
  it("stores pending reviewed rows and their historical recommendations", () => {
    const database = createDatabase();
    saveDraft(database);

    confirmWhiteboardScan(database, {
      confirmedAt: "2026-07-10T10:00:00.000Z",
      items: [
        {
          clientId: "row-1",
          confidence: 0.95,
          currentInventoryQuantity: 3,
          department: "Kitchen",
          manualReviewed: false,
          notes: null,
          product_name: "Chicken breast",
          quantity: 2,
          raw_text: "2 chicken breast",
          recommendedLastPrice: 24.5,
          recommendedLastPurchaseDate: "2026-07-01",
          recommendedPackSize: "2x5kg",
          recommendedProductCode: "CHICKEN-1",
          recommendedProductName: "Chicken Breast Fillets",
          recommendedPurchaseCount: 12,
          recommendedSupplierCode: "BRK",
          recommendedSupplierName: "Brakes",
          recommendedSupplierProductId: "BRK-CHICKEN-1",
          unit: "case"
        },
        {
          clientId: "row-2",
          confidence: 0.79,
          currentInventoryQuantity: null,
          department: null,
          manualReviewed: true,
          notes: "check size",
          product_name: "Chunky chips",
          quantity: null,
          raw_text: "chips",
          recommendedLastPrice: null,
          recommendedLastPurchaseDate: null,
          recommendedPackSize: null,
          recommendedProductCode: null,
          recommendedProductName: null,
          recommendedPurchaseCount: null,
          recommendedSupplierCode: null,
          recommendedSupplierName: null,
          recommendedSupplierProductId: null,
          unit: null
        }
      ],
      scanId: "scan-1"
    });

    expect(database.prepare("SELECT status, confirmed_at FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual({
      confirmed_at: "2026-07-10T10:00:00.000Z",
      status: "Pending"
    });
    expect(
      database
        .prepare(
          `SELECT id, row_order, product_name, manual_reviewed, status,
                  recommended_supplier_product_id, recommended_product_code,
                  recommended_last_price, current_inventory_quantity
             FROM whiteboard_scan_items
            WHERE scan_id = ?
            ORDER BY row_order`
        )
        .all("scan-1")
    ).toEqual([
      {
        current_inventory_quantity: 3,
        id: "row-1",
        manual_reviewed: 0,
        product_name: "Chicken breast",
        recommended_last_price: 24.5,
        recommended_product_code: "CHICKEN-1",
        recommended_supplier_product_id: "BRK-CHICKEN-1",
        row_order: 0,
        status: "Pending"
      },
      {
        current_inventory_quantity: null,
        id: "row-2",
        manual_reviewed: 1,
        product_name: "Chunky chips",
        recommended_last_price: null,
        recommended_product_code: null,
        recommended_supplier_product_id: null,
        row_order: 1,
        status: "Pending"
      }
    ]);
  });

  it.each([
    { confidence: 0.79, manualReviewed: false, product_name: "Milk", quantity: 1 },
    { confidence: 1.1, manualReviewed: true, product_name: "Milk", quantity: 1 },
    { confidence: 0.9, manualReviewed: false, product_name: "   ", quantity: 1 },
    { confidence: 0.9, manualReviewed: false, product_name: "Milk", quantity: -1 },
    { confidence: 0.9, manualReviewed: false, product_name: "Milk", quantity: Number.NaN }
  ])("rejects invalid review data without partially confirming the scan", (invalidFields) => {
    const database = createDatabase();
    saveDraft(database);

    expect(() =>
      confirmWhiteboardScan(database, {
        items: [
          {
            clientId: "valid-row",
            confidence: 0.95,
            department: null,
            manualReviewed: false,
            notes: null,
            product_name: "Bread",
            quantity: 2,
            raw_text: "bread 2",
            unit: null
          },
          {
            clientId: "invalid-row",
            department: null,
            notes: null,
            raw_text: "milk",
            unit: null,
            ...invalidFields
          }
        ],
        scanId: "scan-1"
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_REVIEW_DATA" }));

    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scan_items").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT status, confirmed_at FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual({
      confirmed_at: null,
      status: "Draft"
    });
  });
});
