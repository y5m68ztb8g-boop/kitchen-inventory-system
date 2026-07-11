// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  createPurchasingDatabase,
  getBatchDetail,
  getOrCreateDraftBatch,
  getOrderingProfile,
  saveBatchPo,
  saveOrderingProfile
} from "../../server/ordering/database";
import { inventorySnapshotKey, type OrderingInventorySnapshot } from "../../server/ordering/inventory";
import type { SupplierGroup } from "../../server/ordering/types";
import {
  task4BrkReviewItem,
  task4CmpReviewItem,
  task4CmpSingleItem,
  task4InventorySnapshots,
  task4InventorySnapshotsForMutation,
  task4MmReviewItem,
  task4Now,
  task4OrderingProfile,
  task4PoNumber
} from "./fixtures/task-4-ordering-preparation-fixtures";

type DraftRow = {
  to: string;
  subject: string;
  body: string;
};

type SnapshotDecision = "NeedsRecheck" | "RestockOnly";

type PreparationResult =
  | {
      kind: "inventory-review-required";
      items: Array<{
        itemId: string;
        productName: string;
        totalEquivalentQuantity: number;
        locations: OrderingInventorySnapshot["locations"];
        inventoryLink: string;
      }>;
    }
  | {
      kind: "email-draft";
      draft: {
        supplierCode: "CMP" | "MM";
        to: string;
        subject: string;
        body: string;
      };
    }
  | { kind: "brakes-ready"; items: Array<{ itemId: string; productCode: string; quantity: number }> };

type SupplierDraftInput = {
  supplierCode: "CMP" | "MM";
  poNumber: string;
  profile: {
    purchaserName: string;
    hotelName: string;
    campbellsEmail: string;
    markMurphyEmail: string;
  };
  items: Array<{
    productName: string;
    supplierProductCode: string | null;
    supplierProductId: string;
    packSize: string | null;
    orderQuantity: number;
  }>;
};

type PreparationDatabaseModule = {
  prepareSupplierGroup: (database: Database.Database, input: {
    batchId: string;
    supplierCode: "CMP" | "MM" | "BRK";
    inventory: Map<string, OrderingInventorySnapshot>;
    preparedAt?: string;
  }) => PreparationResult;
  acknowledgeRestockOnly: (database: Database.Database, input: {
    batchId: string;
    itemId: string;
    snapshot: OrderingInventorySnapshot;
    confirmedAt?: string;
  }) => void;
  recordInventoryRecheck: (database: Database.Database, input: {
    batchId: string;
    itemId: string;
    snapshot: OrderingInventorySnapshot;
    recordedAt?: string;
  }) => void;
  saveSupplierEmailDraft?: (
    database: Database.Database,
    input: {
      batchId: string;
      supplierCode: "CMP" | "MM";
      draft: DraftRow;
      preparedAt?: string;
    }
  ) => unknown;
};

type EmailDraftModule = {
  buildSupplierEmailDraft: (input: SupplierDraftInput) => {
    supplierCode: "CMP" | "MM";
    to: string;
    subject: string;
    body: string;
  };
};

function expectPreparationKind<K extends PreparationResult["kind"]>(
  result: PreparationResult,
  kind: K
): asserts result is Extract<PreparationResult, { kind: K }> {
  expect(result.kind).toBe(kind);
}

function readInventoryDecision(database: Database.Database, batchId: string, itemId: string) {
  return database
    .prepare(
      `SELECT batch_id AS batchId, item_id AS itemId, decision, snapshot_key AS snapshotKey
         FROM purchase_inventory_checks
        WHERE batch_id = ? AND item_id = ?`
    )
    .get(batchId, itemId) as
    | {
        batchId: string;
        itemId: string;
        decision: SnapshotDecision;
        snapshotKey: string;
      }
    | undefined;
}

const openDatabases: Database.Database[] = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
});

function createTestOrderingDatabase() {
  const database = createPurchasingDatabase(":memory:");
  openDatabases.push(database);
  return database;
}

function insertSupplierRow(database: Database.Database, batchId: string, supplierCode: SupplierGroup, status: "Pending" | "Prepared" | "Ordered" = "Pending") {
  database
    .prepare(
      `INSERT INTO purchase_batch_suppliers (batch_id, supplier_code, status, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(batch_id, supplier_code) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    )
    .run(batchId, supplierCode, status, task4Now);
}

function insertBatchItem(
  database: Database.Database,
  batchId: string,
  rowOrder: number,
  input: {
    id: string;
    productName: string;
    supplierGroup: SupplierGroup;
    supplierProductId: string | null;
    supplierProductCode: string | null;
    supplierName: string | null;
    packSize: string | null;
    orderQuantity: number;
    orderUnit: string;
  }
) {
  database
    .prepare(
      `INSERT INTO purchase_batch_items (
         id, batch_id, row_order, product_name, supplier_group, supplier_product_id,
         supplier_product_code, supplier_name, pack_size, order_quantity, order_unit,
         last_price, purchase_count, latest_purchase_date, brakes_status, brakes_message,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NULL, ?, ?)`
    )
    .run(
      input.id,
      batchId,
      rowOrder,
      input.productName,
      input.supplierGroup,
      input.supplierProductId,
      input.supplierProductCode,
      input.supplierName,
      input.packSize,
      input.orderQuantity,
      input.orderUnit,
      null,
      null,
      null,
      task4Now,
      task4Now
    );
  insertSupplierRow(database, batchId, input.supplierGroup);
}

function saveInventoryDecision(
  database: Database.Database,
  batchId: string,
  itemId: string,
  snapshot: OrderingInventorySnapshot,
  decision: SnapshotDecision,
  confirmedAt: string
) {
  database
    .prepare(
      `INSERT INTO purchase_inventory_checks (
         batch_id, item_id, snapshot_key, equivalent_quantity, locations_json, decision, confirmed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         snapshot_key = excluded.snapshot_key,
         equivalent_quantity = excluded.equivalent_quantity,
         locations_json = excluded.locations_json,
         decision = excluded.decision,
         confirmed_at = excluded.confirmed_at`
    )
    .run(
      batchId,
      itemId,
      inventorySnapshotKey(snapshot),
      snapshot.totalEquivalentQuantity,
      JSON.stringify(snapshot.locations),
      decision,
      confirmedAt
    );
}

async function loadPreparationDatabase(): Promise<PreparationDatabaseModule> {
  return (await import("../../server/ordering/database")) as unknown as PreparationDatabaseModule;
}

async function loadEmailDraftModule(): Promise<EmailDraftModule> {
  return import("../../server/ordering/emailDraft");
}

describe("ordering supplier preparation", () => {
  it("returns all inventory blockers >1 for the chosen supplier", async () => {
    const module = await loadPreparationDatabase();
    const database = createTestOrderingDatabase();
    const batch = getOrCreateDraftBatch(database);

    insertBatchItem(database, batch.id, 0, task4CmpReviewItem);
    insertBatchItem(database, batch.id, 1, task4CmpSingleItem);
    insertBatchItem(database, batch.id, 2, task4MmReviewItem);

    const result = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      inventory: task4InventorySnapshots,
      preparedAt: task4Now
    });

    expectPreparationKind(result, "inventory-review-required");
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: task4CmpReviewItem.id,
          productName: task4CmpReviewItem.productName,
          totalEquivalentQuantity: 2.5
        })
      ])
    );
    expect(result.items.every((entry) => entry.totalEquivalentQuantity > 1)).toBe(true);
    expect(result.items.some((entry) => entry.itemId === task4CmpSingleItem.id)).toBe(false);
  });

  it("does not block items with equivalent quantity exactly 1", async () => {
    const module = await loadPreparationDatabase();
    const database = createTestOrderingDatabase();
    const batch = getOrCreateDraftBatch(database);

    insertBatchItem(database, batch.id, 0, task4CmpSingleItem);
    saveBatchPo(database, batch.id, task4PoNumber);
    saveOrderingProfile(database, task4OrderingProfile);

    const result = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      inventory: task4InventorySnapshots
    });

    expect(result.kind).not.toBe("inventory-review-required");
  });

  it("does not block RestockOnly when snapshot matches, and rechecks snapshot drift", async () => {
    const module = await loadPreparationDatabase();
    const database = createTestOrderingDatabase();
    const batch = getOrCreateDraftBatch(database);
    const firstSnapshot = task4InventorySnapshots.get(task4CmpReviewItem.supplierProductId);
    if (!firstSnapshot) {
      throw new Error("fixture snapshot missing");
    }

    insertBatchItem(database, batch.id, 0, task4CmpReviewItem);
    saveBatchPo(database, batch.id, task4PoNumber);
    saveOrderingProfile(database, task4OrderingProfile);
    module.acknowledgeRestockOnly(database, {
      batchId: batch.id,
      itemId: task4CmpReviewItem.id,
      snapshot: firstSnapshot,
      confirmedAt: task4Now
    });

    const unchanged = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      inventory: task4InventorySnapshots
    });
    expect(unchanged.kind).not.toBe("inventory-review-required");

    const mutated = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      inventory: task4InventorySnapshotsForMutation
    });
    expectPreparationKind(mutated, "inventory-review-required");
    expect(mutated.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: task4CmpReviewItem.id, totalEquivalentQuantity: 4.25 })])
    );
  });

  it("still blocks NeedsRecheck even when snapshot is unchanged", async () => {
    const module = await loadPreparationDatabase();
    const database = createTestOrderingDatabase();
    const batch = getOrCreateDraftBatch(database);
    const firstSnapshot = task4InventorySnapshots.get(task4CmpReviewItem.supplierProductId);
    if (!firstSnapshot) {
      throw new Error("fixture snapshot missing");
    }

    insertBatchItem(database, batch.id, 0, task4CmpReviewItem);
    module.recordInventoryRecheck(database, {
      batchId: batch.id,
      itemId: task4CmpReviewItem.id,
      snapshot: firstSnapshot,
      recordedAt: task4Now
    });

    const recorded = readInventoryDecision(database, batch.id, task4CmpReviewItem.id);
    expect(recorded).toMatchObject({ decision: "NeedsRecheck" });

    const blocked = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      inventory: task4InventorySnapshots
    });
    expectPreparationKind(blocked, "inventory-review-required");
    expect(blocked.items[0]).toMatchObject({ itemId: task4CmpReviewItem.id });
  });

  it("builds shared English PO draft for CMP/MM and validates profile/recipient fields", async () => {
    const emailDraftModule = await loadEmailDraftModule();
    const cmpItems = [
      {
        productName: task4CmpReviewItem.productName,
        supplierProductId: task4CmpReviewItem.supplierProductId,
        supplierProductCode: task4CmpReviewItem.supplierProductCode,
        packSize: task4CmpReviewItem.packSize,
        orderQuantity: 2
      }
    ];
    const mmItems = [
      {
        productName: task4MmReviewItem.productName,
        supplierProductId: task4MmReviewItem.supplierProductId,
        supplierProductCode: task4MmReviewItem.supplierProductCode,
        packSize: task4MmReviewItem.packSize,
        orderQuantity: 1
      }
    ];

    const cmpDraft = emailDraftModule.buildSupplierEmailDraft({
      supplierCode: "CMP",
      poNumber: task4PoNumber,
      profile: task4OrderingProfile,
      items: cmpItems
    });
    const mmDraft = emailDraftModule.buildSupplierEmailDraft({
      supplierCode: "MM",
      poNumber: task4PoNumber,
      profile: task4OrderingProfile,
      items: mmItems
    });

    expect(cmpDraft).toMatchObject({
      supplierCode: "CMP",
      to: task4OrderingProfile.campbellsEmail,
      subject: `Order - ${task4OrderingProfile.hotelName} - PO ${task4PoNumber}`
    });
    expect(mmDraft).toMatchObject({
      supplierCode: "MM",
      to: task4OrderingProfile.markMurphyEmail,
      subject: `Order - ${task4OrderingProfile.hotelName} - PO ${task4PoNumber}`
    });
    expect(cmpDraft.body).toContain("200101 - 2 x 12x1kg Chicken Breast");
    expect(mmDraft.body).toContain("300500 - 1 x 6x1L Orange Juice");
    expect(cmpDraft.body.indexOf("200101")).toBeLessThan(cmpDraft.body.indexOf("Chicken Breast"));
    expect(mmDraft.body.indexOf("300500")).toBeLessThan(mmDraft.body.indexOf("Orange Juice"));
    expect(mmDraft.body).toContain(task4OrderingProfile.purchaserName);
    expect(mmDraft.body).toContain(task4OrderingProfile.hotelName);

    await expect(() =>
      emailDraftModule.buildSupplierEmailDraft({
        supplierCode: "CMP",
        poNumber: "",
        profile: task4OrderingProfile,
        items: cmpItems
      })
    ).toThrow();

    await expect(() =>
      emailDraftModule.buildSupplierEmailDraft({
        supplierCode: "CMP",
        poNumber: task4PoNumber,
        profile: { ...task4OrderingProfile, purchaserName: "" },
        items: cmpItems
      })
    ).toThrow();

    await expect(() =>
      emailDraftModule.buildSupplierEmailDraft({
        supplierCode: "MM",
        poNumber: task4PoNumber,
        profile: { ...task4OrderingProfile, hotelName: "" },
        items: mmItems
      })
    ).toThrow();

    await expect(() =>
      emailDraftModule.buildSupplierEmailDraft({
        supplierCode: "CMP",
        poNumber: task4PoNumber,
        profile: { ...task4OrderingProfile, campbellsEmail: "" },
        items: cmpItems
      })
    ).toThrow();
  });

  it("supports only CMP/MM for supplier draft generation", async () => {
    const emailDraftModule = await loadEmailDraftModule();
    await expect(() =>
      emailDraftModule.buildSupplierEmailDraft({
        // @ts-expect-error for invalid supplier code path coverage
        supplierCode: "BRK",
        poNumber: task4PoNumber,
        profile: task4OrderingProfile,
        items: [
          {
            productName: task4BrkReviewItem.productName,
            supplierProductId: task4BrkReviewItem.supplierProductId,
            supplierProductCode: task4BrkReviewItem.supplierProductCode,
            packSize: task4BrkReviewItem.packSize,
            orderQuantity: 1
          }
        ]
      })
    ).toThrow();
  });

  it("saves an email draft as Prepared and never writes an order timestamp", async () => {
    const emailDraftModule = await loadEmailDraftModule();
    const database = createTestOrderingDatabase();
    const module = await loadPreparationDatabase();
    const batch = getOrCreateDraftBatch(database);
    const draft = emailDraftModule.buildSupplierEmailDraft({
      supplierCode: "CMP",
      poNumber: task4PoNumber,
      profile: task4OrderingProfile,
      items: [
        {
          productName: task4CmpReviewItem.productName,
          supplierProductId: task4CmpReviewItem.supplierProductId,
          supplierProductCode: task4CmpReviewItem.supplierProductCode,
          packSize: task4CmpReviewItem.packSize,
          orderQuantity: 1
        }
      ]
    });

    insertBatchItem(database, batch.id, 0, task4CmpSingleItem);

    if (typeof module.saveSupplierEmailDraft !== "function") {
      expect(module.saveSupplierEmailDraft).toBeTypeOf("function");
      return;
    }

    await module.saveSupplierEmailDraft(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      draft,
      preparedAt: task4Now
    });

    const after = getBatchDetail(database, batch.id);
    const cmpSupplier = after.suppliers.find((entry) => entry.supplierCode === "CMP");
    expect(cmpSupplier?.status).toBe("Prepared");
    expect(cmpSupplier?.orderedAt).toBeNull();
  });

  it("exposes no sendEmail side-effect helper from the preparation module", async () => {
    const module = await import("../../server/ordering/emailDraft");
    expect("sendEmail" in module).toBe(false);
  });

  it("returns the three preparation result unions and BRK prepares brakes queue only", async () => {
    const module = await loadPreparationDatabase();
    const database = createTestOrderingDatabase();
    const batch = getOrCreateDraftBatch(database);

    insertBatchItem(database, batch.id, 0, task4CmpReviewItem);
    insertBatchItem(database, batch.id, 1, task4MmReviewItem);
    insertBatchItem(database, batch.id, 2, task4BrkReviewItem);
    saveBatchPo(database, batch.id, task4PoNumber);
    saveOrderingProfile(database, task4OrderingProfile);

    const cmpResult = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      inventory: task4InventorySnapshots
    });
    expect(cmpResult.kind).toBe("inventory-review-required");

    saveInventoryDecision(database, batch.id, task4CmpReviewItem.id, task4InventorySnapshots.get(task4CmpReviewItem.supplierProductId)!, "NeedsRecheck", task4Now);
    const mmResult = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "MM",
      inventory: task4InventorySnapshots
    });
    expect(mmResult.kind).toBe("inventory-review-required");

    const brkReviewResult = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "BRK",
      inventory: task4InventorySnapshots
    });
    expectPreparationKind(brkReviewResult, "inventory-review-required");

    const brkSnapshot = task4InventorySnapshots.get(task4BrkReviewItem.supplierProductId)!;
    module.acknowledgeRestockOnly(database, {
      batchId: batch.id,
      itemId: task4BrkReviewItem.id,
      snapshot: brkSnapshot
    });

    const brkResult = module.prepareSupplierGroup(database, {
      batchId: batch.id,
      supplierCode: "BRK",
      inventory: task4InventorySnapshots
    });
    expectPreparationKind(brkResult, "brakes-ready");
    expect(brkResult.items).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: task4BrkReviewItem.id })]));
    expect(
      getBatchDetail(database, batch.id).suppliers.find((supplier) => supplier.supplierCode === "BRK")?.emailDraft
    ).toBeNull();
  });

  it("records RestockOnly and NeedsRecheck decisions to server inventory checks table", async () => {
    const module = await loadPreparationDatabase();
    const database = createTestOrderingDatabase();
    const batch = getOrCreateDraftBatch(database);
    const snapshot = task4InventorySnapshots.get(task4CmpReviewItem.supplierProductId);
    if (!snapshot) {
      throw new Error("fixture snapshot missing");
    }

    insertBatchItem(database, batch.id, 0, task4CmpReviewItem);
    module.acknowledgeRestockOnly(database, { batchId: batch.id, itemId: task4CmpReviewItem.id, snapshot });
    expect(readInventoryDecision(database, batch.id, task4CmpReviewItem.id)).toMatchObject({ decision: "RestockOnly" });

    module.recordInventoryRecheck(database, { batchId: batch.id, itemId: task4CmpReviewItem.id, snapshot });
    expect(readInventoryDecision(database, batch.id, task4CmpReviewItem.id)).toMatchObject({ decision: "NeedsRecheck" });
    expect(readInventoryDecision(database, batch.id, task4CmpReviewItem.id)?.snapshotKey).toBe(
      inventorySnapshotKey(snapshot)
    );
  });
});
