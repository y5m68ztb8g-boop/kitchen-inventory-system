// @vitest-environment node

import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  confirmWhiteboardScan,
  createPurchasingDatabase,
  getIntakeSource,
  getScanImage,
  handOffIntakeToPurchasing,
  saveDraftIntake,
  savePendingIntake,
  saveDraftScan
} from "../../server/purchasing/database";
import type { PurchaseIntakeItem, SaveIntakeInput } from "../../server/purchasing/intakeSchema";
import { normaliseProductName } from "../../server/purchasing/matching";

const openDatabases: Database.Database[] = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createDatabase() {
  const database = createPurchasingDatabase(":memory:");
  openDatabases.push(database);
  return database;
}

type StoredMatchFeedback = {
  confirmationCount: number;
  lastConfirmedAt: string;
  supplierProductId: string;
};

function readMatchFeedback(
  database: Database.Database,
  productName: string,
  supplierProductId: string
): StoredMatchFeedback | undefined {
  return database
    .prepare(
      `SELECT confirmation_count AS confirmationCount,
              last_confirmed_at AS lastConfirmedAt,
              supplier_product_id AS supplierProductId
         FROM purchase_match_feedback
        WHERE normalised_name = ?
          AND supplier_product_id = ?`
    )
    .get(normaliseProductName(productName), supplierProductId) as StoredMatchFeedback | undefined;
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

function reviewedItem(overrides: Partial<PurchaseIntakeItem> = {}): PurchaseIntakeItem {
  return {
    clientId: "intake-row-1",
    confidence: 0.91,
    department: "Kitchen",
    manualReviewed: false,
    notes: null,
    product_name: "Bread rolls",
    quantity: 4,
    raw_text: "4 bread rolls",
    unit: "tray",
    ...overrides
  };
}

function intakeWith(overrides: Partial<SaveIntakeInput> = {}): SaveIntakeInput {
  return {
    aiModel: null,
    createdAt: "2026-07-10T09:00:00.000Z",
    generalNotes: "Friday event",
    id: "intake-1",
    items: [reviewedItem()],
    originalFilename: "event-purchases.pdf",
    originalMimeType: "application/pdf",
    originalSizeBytes: 12,
    sourceBlob: Buffer.from("original-pdf"),
    sourceType: "pdf",
    storedMimeType: "application/pdf",
    storedSizeBytes: 12,
    unreadableText: ["handwritten note"],
    ...overrides
  };
}

describe("createPurchasingDatabase", () => {
  it("creates missing parent directories for a nested database path", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "purchasing-database-"));
    const databasePath = join(temporaryDirectory, "initially", "absent", "purchasing.sqlite");
    temporaryDirectories.push(temporaryDirectory);

    const database = createPurchasingDatabase(databasePath);
    openDatabases.push(database);

    expect(existsSync(databasePath)).toBe(true);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'whiteboard_scans'").get()).toEqual({
      name: "whiteboard_scans"
    });
  });

  it("creates the purchasing schema idempotently and enables foreign keys", () => {
    const database = createDatabase();

    expect(() => createPurchasingDatabase(database)).not.toThrow();
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'whiteboard_%' ORDER BY name")
        .all()
    ).toEqual([{ name: "whiteboard_scan_items" }, { name: "whiteboard_scans" }]);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'purchase_intake%' ORDER BY name")
        .all()
    ).toEqual([{ name: "purchase_intake_items" }, { name: "purchase_intakes" }]);
  });

  it("rejects invalid scan statuses at the SQL boundary", () => {
    const database = createDatabase();
    saveDraft(database);

    expect(() =>
      database.prepare("UPDATE whiteboard_scans SET status = 'Ordered' WHERE id = ?").run("scan-1")
    ).toThrowError(/CHECK constraint failed/);
    expect(database.prepare("SELECT status FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual({
      status: "Draft"
    });
  });

  it.each([
    { confidence: -0.01, manualReviewed: 0, name: "confidence below zero" },
    { confidence: 1.01, manualReviewed: 0, name: "confidence above one" },
    { confidence: 0.9, manualReviewed: 2, name: "manual_reviewed outside zero or one" }
  ])("enforces item constraints for $name", ({ confidence, manualReviewed }) => {
    const database = createDatabase();
    saveDraft(database);

    expect(() =>
      database
        .prepare(
          `INSERT INTO whiteboard_scan_items (
             id, scan_id, row_order, raw_text, product_name, confidence,
             manual_reviewed, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
        )
        .run("invalid-row", "scan-1", 0, "invalid", "Invalid", confidence, manualReviewed, "2026-07-10")
    ).toThrowError(/CHECK constraint failed/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scan_items").get()).toEqual({ count: 0 });
  });

  it("cascades item deletion when a scan is deleted", () => {
    const database = createDatabase();
    saveDraft(database);
    confirmWhiteboardScan(database, {
      items: [
        {
          clientId: "cascade-row",
          confidence: 0.95,
          department: null,
          manualReviewed: false,
          notes: null,
          product_name: "Bread",
          quantity: 1,
          raw_text: "bread",
          unit: null
        }
      ],
      scanId: "scan-1"
    });

    database.prepare("DELETE FROM whiteboard_scans WHERE id = ?").run("scan-1");

    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scans").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scan_items").get()).toEqual({ count: 0 });
  });
});

describe("generic purchase intakes", () => {
  it("stores a pending intake with its original PDF and matched invoice product", () => {
    const database = createDatabase();

    savePendingIntake(
      database,
      intakeWith({
        items: [
          reviewedItem({
            supplierLastPrice: 18.25,
            supplierProductCode: "135177",
            supplierProductId: "BRK-135177",
            supplierProductName: "Sourdough Bread Rolls"
          })
        ]
      })
    );

    expect(database.prepare("SELECT status, source_type, original_mime_type FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      original_mime_type: "application/pdf",
      source_type: "pdf",
      status: "Pending"
    });
    expect(
      database
        .prepare(
          "SELECT product_name, supplier_product_id, supplier_product_code, supplier_product_name, supplier_last_price FROM purchase_intake_items WHERE intake_id = ?"
        )
        .get("intake-1")
    ).toEqual({
      product_name: "Bread rolls",
      supplier_last_price: 18.25,
      supplier_product_code: "135177",
      supplier_product_id: "BRK-135177",
      supplier_product_name: "Sourdough Bread Rolls"
    });
    expect(getIntakeSource(database, "intake-1")).toEqual({
      buffer: Buffer.from("original-pdf"),
      filename: "event-purchases.pdf",
      mimeType: "application/pdf"
    });
  });

  it("tracks supplier-product feedback from repeated pending saves and changed selections", () => {
    const database = createDatabase();

    savePendingIntake(
      database,
      intakeWith({
        items: [
          reviewedItem({
            clientId: "row-1",
            product_name: "Haddock",
            supplierProductId: "CMP-28HADFZIQF",
            supplierProductCode: "CMP-28HADFZIQF"
          })
        ]
      })
    );
    savePendingIntake(
      database,
      intakeWith({
        items: [
          reviewedItem({
            clientId: "row-1",
            product_name: "Haddock",
            supplierProductId: "CMP-28HADFZIQF",
            supplierProductCode: "CMP-28HADFZIQF"
          })
        ]
      })
    );

    expect(readMatchFeedback(database, "haddock", "CMP-28HADFZIQF")?.confirmationCount).toBe(1);

    savePendingIntake(
      database,
      intakeWith({
        items: [
          reviewedItem({
            clientId: "row-1",
            product_name: "Haddock",
            supplierProductId: "CMP-OTHER",
            supplierProductCode: "CMP-OTHER"
          })
        ]
      })
    );
    expect(readMatchFeedback(database, "haddock", "CMP-OTHER")?.confirmationCount).toBe(1);

    savePendingIntake(
      database,
      intakeWith({
        items: [reviewedItem({ clientId: "row-1", product_name: "Haddock", supplierProductId: null })]
      })
    );
    expect(readMatchFeedback(database, "haddock", "CMP-28HADFZIQF")?.confirmationCount).toBe(1);

    savePendingIntake(
      database,
      intakeWith({
        items: [
          reviewedItem({
            clientId: "row-1",
            product_name: "Haddock",
            supplierProductId: "CMP-28HADFZIQF",
            supplierProductCode: "CMP-28HADFZIQF"
          })
        ]
      })
    );
    expect(readMatchFeedback(database, "haddock", "CMP-28HADFZIQF")?.confirmationCount).toBe(2);
  });

  it("records handoff feedback and does not double count when post-handoff save is rejected", () => {
    const database = createDatabase();
    saveDraftIntake(database, intakeWith());

    handOffIntakeToPurchasing(database, {
      handedOffAt: "2026-07-10T10:00:00.000Z",
      intakeId: "intake-1",
      items: [
        reviewedItem({
          clientId: "row-1",
          product_name: "Haddock",
          supplierProductId: "CMP-28HADFZIQF",
          supplierProductCode: "CMP-28HADFZIQF"
        })
      ]
    });

    expect(readMatchFeedback(database, "haddock", "CMP-28HADFZIQF")?.confirmationCount).toBe(1);

    expect(() =>
      savePendingIntake(
        database,
        intakeWith({
          items: [
            reviewedItem({
              clientId: "row-1",
              supplierProductId: "CMP-28HADFZIQF",
              supplierProductCode: "CMP-28HADFZIQF"
            })
          ]
        })
      )
    ).toThrowError(expect.objectContaining({ code: "INVALID_REVIEW_DATA" }));
    expect(readMatchFeedback(database, "haddock", "CMP-28HADFZIQF")?.confirmationCount).toBe(1);
  });

  it("keeps draft intakes in SQLite without marking them ready for purchase", () => {
    const database = createDatabase();

    saveDraftIntake(database, intakeWith({ sourceType: "spreadsheet" }));

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: null,
      status: "Draft"
    });
  });

  it("moves a reviewed intake into the future purchasing queue without creating an order", () => {
    const database = createDatabase();
    savePendingIntake(database, intakeWith());

    handOffIntakeToPurchasing(database, {
      handedOffAt: "2026-07-10T10:00:00.000Z",
      intakeId: "intake-1",
      items: [reviewedItem()]
    });

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: "2026-07-10T10:00:00.000Z",
      status: "ReadyForPurchase"
    });
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_orders'").get()).toBeUndefined();
  });

  it("persists the current handoff payload and replaces any prior draft intake rows", () => {
    const database = createDatabase();
    saveDraftIntake(
      database,
      intakeWith({
        sourceType: "pdf",
        items: [
          reviewedItem({
            clientId: "legacy-row",
            product_name: "   ",
            quantity: -2,
            manualReviewed: false
          })
        ]
      })
    );

    expect(database.prepare("SELECT product_name, quantity FROM purchase_intake_items WHERE intake_id = ?").get("intake-1")).toEqual({
      product_name: "",
      quantity: -2
    });

    handOffIntakeToPurchasing(database, {
      handedOffAt: "2026-07-10T10:00:00.000Z",
      intakeId: "intake-1",
      items: [reviewedItem({ clientId: "fresh-row", product_name: "Fresh rolls" })]
    });

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: "2026-07-10T10:00:00.000Z",
      status: "ReadyForPurchase"
    });
    expect(database.prepare("SELECT product_name, quantity FROM purchase_intake_items WHERE intake_id = ?").get("intake-1")).toEqual({
      product_name: "Fresh rolls",
      quantity: 4
    });
    expect(
      (
        database
          .prepare("SELECT count(*) AS count FROM purchase_intake_items WHERE intake_id = ?")
          .get("intake-1") as { count: number }
      ).count
    ).toBe(1);
  });

  it.each([
    { items: [], name: "no retained items" },
    { items: [reviewedItem({ clientId: "duplicate" }), reviewedItem({ clientId: "duplicate" })], name: "duplicate client IDs" },
    { items: [reviewedItem({ product_name: "   " })], name: "empty product name" },
    { items: [reviewedItem({ quantity: -1 })], name: "negative quantity" },
    { items: [reviewedItem({ quantity: Number.NaN })], name: "non-finite quantity" },
    { items: [reviewedItem({ confidence: 0.79, manualReviewed: false })], name: "unreviewed low confidence item" }
  ])("rejects $name without changing the existing intake", ({ items }) => {
    const database = createDatabase();
    saveDraftIntake(database, intakeWith());

    expect(() => savePendingIntake(database, intakeWith({ items }))).toThrowError(
      expect.objectContaining({ code: "INVALID_REVIEW_DATA" })
    );
    expect(database.prepare("SELECT status FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({ status: "Draft" });
  });

  it.each([
    { name: "Draft", saveIntake: saveDraftIntake },
    { name: "Pending", saveIntake: savePendingIntake }
  ])("rejects a stale $name intake save after handoff without mutating the handoff payload", ({ name: saveName, saveIntake }) => {
    const database = createDatabase();
    const handoffAt = "2026-07-10T10:00:00.000Z";

    savePendingIntake(
      database,
      intakeWith({
        items: [reviewedItem({ clientId: "pending-row", product_name: "Pending loaf" })]
      })
    );

    handOffIntakeToPurchasing(database, {
      handedOffAt: handoffAt,
      intakeId: "intake-1",
      items: [reviewedItem({ clientId: "handoff-row", product_name: "Rolled oats" })]
    });

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: handoffAt,
      status: "ReadyForPurchase"
    });
    expect(database.prepare("SELECT id, product_name FROM purchase_intake_items WHERE intake_id = ? ORDER BY row_order").all("intake-1")).toEqual(
      [{ id: "intake-1:handoff-row", product_name: "Rolled oats" }]
    );

    expect(() =>
      saveIntake(
        database,
        intakeWith({
          createdAt: "2026-07-10T09:00:00.000Z",
          generalNotes: `stale ${saveName} intake`,
          id: "intake-1",
          items: [reviewedItem({ clientId: "stale-row", product_name: "Stale oats" })]
        })
      )
    ).toThrowError(expect.objectContaining({ code: "INVALID_REVIEW_DATA" }));

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: handoffAt,
      status: "ReadyForPurchase"
    });
    expect(database.prepare("SELECT id, product_name FROM purchase_intake_items WHERE intake_id = ? ORDER BY row_order").all("intake-1")).toEqual(
      [{ id: "intake-1:handoff-row", product_name: "Rolled oats" }]
    );
  });

  it("does not change status or rows when handoff validation fails", () => {
    const database = createDatabase();
    saveDraftIntake(database, intakeWith({ sourceType: "image" }));

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: null,
      status: "Draft"
    });
    expect(database.prepare("SELECT product_name FROM purchase_intake_items WHERE intake_id = ?").all("intake-1")).toEqual([
      { product_name: "Bread rolls" }
    ]);

    expect(() =>
      handOffIntakeToPurchasing(database, {
        intakeId: "intake-1",
        items: [reviewedItem({ confidence: 0.79, manualReviewed: false })]
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_REVIEW_DATA" }));

    expect(database.prepare("SELECT status, handed_off_at FROM purchase_intakes WHERE id = ?").get("intake-1")).toEqual({
      handed_off_at: null,
      status: "Draft"
    });
    expect(database.prepare("SELECT product_name FROM purchase_intake_items WHERE intake_id = ?").all("intake-1")).toEqual([
      { product_name: "Bread rolls" }
    ]);
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
        id: "scan-1:row-1",
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
        id: "scan-1:row-2",
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

  it("replaces prior rows when a confirmed scan is confirmed again", () => {
    const database = createDatabase();
    saveDraft(database);
    confirmWhiteboardScan(database, {
      confirmedAt: "2026-07-10T10:00:00.000Z",
      items: [
        {
          clientId: "old-row-1",
          confidence: 0.95,
          department: null,
          manualReviewed: false,
          notes: null,
          product_name: "Old bread",
          quantity: 1,
          raw_text: "old bread",
          unit: null
        },
        {
          clientId: "old-row-2",
          confidence: 0.95,
          department: null,
          manualReviewed: false,
          notes: null,
          product_name: "Old milk",
          quantity: 1,
          raw_text: "old milk",
          unit: null
        }
      ],
      scanId: "scan-1"
    });

    confirmWhiteboardScan(database, {
      confirmedAt: "2026-07-10T11:00:00.000Z",
      items: [
        {
          clientId: "new-row-1",
          confidence: 0.9,
          department: "Bar",
          manualReviewed: false,
          notes: null,
          product_name: "Orange juice",
          quantity: 3,
          raw_text: "orange juice 3",
          recommendedProductCode: "JUICE-NEW",
          recommendedSupplierProductId: "BRK-JUICE-NEW",
          unit: "case"
        },
        {
          clientId: "new-row-2",
          confidence: 0.82,
          department: "Kitchen",
          manualReviewed: false,
          notes: null,
          product_name: "Garden peas",
          quantity: 4,
          raw_text: "garden peas 4",
          recommendedProductCode: "PEAS-NEW",
          recommendedSupplierProductId: "BRK-PEAS-NEW",
          unit: "bag"
        }
      ],
      scanId: "scan-1"
    });

    expect(
      database
        .prepare(
          `SELECT id, row_order, status, recommended_supplier_product_id, recommended_product_code
             FROM whiteboard_scan_items
            WHERE scan_id = ?
            ORDER BY row_order`
        )
        .all("scan-1")
    ).toEqual([
      {
        id: "scan-1:new-row-1",
        recommended_product_code: "JUICE-NEW",
        recommended_supplier_product_id: "BRK-JUICE-NEW",
        row_order: 0,
        status: "Pending"
      },
      {
        id: "scan-1:new-row-2",
        recommended_product_code: "PEAS-NEW",
        recommended_supplier_product_id: "BRK-PEAS-NEW",
        row_order: 1,
        status: "Pending"
      }
    ]);
    expect(database.prepare("SELECT status, confirmed_at FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual({
      confirmed_at: "2026-07-10T11:00:00.000Z",
      status: "Pending"
    });
  });

  it("scopes persisted IDs by scan so fallback client IDs can recur across scans", () => {
    const database = createDatabase();
    saveDraft(database, "scan-1");
    saveDraft(database, "scan-2");
    const item = {
      clientId: "purchase-row-1",
      confidence: 0.95,
      department: null,
      manualReviewed: false,
      notes: null,
      product_name: "Bread",
      quantity: 1,
      raw_text: "bread",
      unit: null
    };

    confirmWhiteboardScan(database, { items: [item], scanId: "scan-1" });
    confirmWhiteboardScan(database, { items: [item], scanId: "scan-2" });

    expect(database.prepare("SELECT id, scan_id FROM whiteboard_scan_items ORDER BY scan_id").all()).toEqual([
      { id: "scan-1:purchase-row-1", scan_id: "scan-1" },
      { id: "scan-2:purchase-row-1", scan_id: "scan-2" }
    ]);
  });

  it("rejects duplicate client IDs within one confirmation", () => {
    const database = createDatabase();
    saveDraft(database);

    expect(() =>
      confirmWhiteboardScan(database, {
        items: [
          {
            clientId: "purchase-row-1",
            confidence: 0.95,
            department: null,
            manualReviewed: false,
            notes: null,
            product_name: "Bread",
            quantity: 1,
            raw_text: "bread",
            unit: null
          },
          {
            clientId: "purchase-row-1",
            confidence: 0.95,
            department: null,
            manualReviewed: false,
            notes: null,
            product_name: "Milk",
            quantity: 1,
            raw_text: "milk",
            unit: null
          }
        ],
        scanId: "scan-1"
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_REVIEW_DATA" }));

    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scan_items").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT status FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual({
      status: "Draft"
    });
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

  it("rejects confirmation with no retained items and keeps the scan as Draft", () => {
    const database = createDatabase();
    saveDraft(database);

    expect(() => confirmWhiteboardScan(database, { items: [], scanId: "scan-1" })).toThrowError(
      expect.objectContaining({ code: "INVALID_REVIEW_DATA" })
    );
    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scan_items").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT status, confirmed_at FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual({
      confirmed_at: null,
      status: "Draft"
    });
  });

  it("rolls back deletion and replacement rows when the second insert aborts", () => {
    const database = createDatabase();
    saveDraft(database);
    confirmWhiteboardScan(database, {
      confirmedAt: "2026-07-10T10:00:00.000Z",
      items: [
        {
          clientId: "original-row",
          confidence: 0.95,
          department: "Kitchen",
          manualReviewed: false,
          notes: null,
          product_name: "Original bread",
          quantity: 2,
          raw_text: "original bread 2",
          recommendedProductCode: "ORIGINAL-1",
          unit: "case"
        }
      ],
      scanId: "scan-1"
    });
    const originalItems = database
      .prepare(
        `SELECT id, row_order, product_name, status, recommended_product_code
           FROM whiteboard_scan_items
          WHERE scan_id = ?
          ORDER BY row_order`
      )
      .all("scan-1");
    const originalScan = database
      .prepare("SELECT status, confirmed_at FROM whiteboard_scans WHERE id = ?")
      .get("scan-1");

    database.exec(`
      CREATE TEMP TRIGGER abort_second_replacement_insert
      BEFORE INSERT ON whiteboard_scan_items
      WHEN (SELECT COUNT(*) FROM whiteboard_scan_items WHERE scan_id = NEW.scan_id) = 1
      BEGIN
        SELECT RAISE(ABORT, 'forced second insert failure');
      END;
    `);

    expect(() =>
      confirmWhiteboardScan(database, {
        confirmedAt: "2026-07-10T11:00:00.000Z",
        items: [
          {
            clientId: "replacement-row-1",
            confidence: 0.95,
            department: null,
            manualReviewed: false,
            notes: null,
            product_name: "Replacement milk",
            quantity: 1,
            raw_text: "replacement milk",
            unit: null
          },
          {
            clientId: "replacement-row-2",
            confidence: 0.95,
            department: null,
            manualReviewed: false,
            notes: null,
            product_name: "Replacement eggs",
            quantity: 2,
            raw_text: "replacement eggs",
            unit: null
          }
        ],
        scanId: "scan-1"
      })
    ).toThrowError("forced second insert failure");

    expect(
      database
        .prepare(
          `SELECT id, row_order, product_name, status, recommended_product_code
             FROM whiteboard_scan_items
            WHERE scan_id = ?
            ORDER BY row_order`
        )
        .all("scan-1")
    ).toEqual(originalItems);
    expect(database.prepare("SELECT status, confirmed_at FROM whiteboard_scans WHERE id = ?").get("scan-1")).toEqual(
      originalScan
    );
  });
});
