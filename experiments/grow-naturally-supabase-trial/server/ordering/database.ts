import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createPurchasingDatabase } from "../purchasing/database";
import type {
  BrakesItemStatus,
  OrderingProfile,
  PurchaseBatch,
  PurchaseBatchItem,
  PurchaseBatchStatus,
  PurchaseBatchSupplier,
  SupplierGroup,
  SupplierOrderStatus
} from "./types";

export { createPurchasingDatabase };
export type * from "./types";

type SupplierCode = Exclude<SupplierGroup, "UNMATCHED">;

type AddReadyIntakeToBatchInput = {
  batchId: string;
  intakeId: string;
  transferredAt?: string;
};

export type AddBatchItemInput = {
  batchId: string;
  id?: string;
  productName: string;
  supplierGroup: SupplierGroup;
  supplierProductId?: string | null;
  supplierProductCode?: string | null;
  supplierName?: string | null;
  packSize?: string | null;
  orderQuantity: number;
  orderUnit: string;
  lastPrice?: number | null;
  purchaseCount?: number | null;
  latestPurchaseDate?: string | null;
};

export type UpdateBatchItemInput = Omit<Partial<AddBatchItemInput>, "batchId" | "id"> & {
  batchId: string;
  itemId: string;
};

export type MarkSupplierOrderedInput = {
  batchId: string;
  supplierCode: SupplierCode;
  orderedAt?: string;
};

type OrderingDatabaseErrorCode =
  | "ORDER_BATCH_NOT_FOUND"
  | "ORDER_BATCH_ITEM_NOT_FOUND"
  | "INVALID_ORDER_QUANTITY"
  | "INTAKE_NOT_READY_FOR_ORDER"
  | "INTAKE_ALREADY_ADDED"
  | "SUPPLIER_NOT_IN_BATCH";

class OrderingDatabaseError extends Error {
  readonly code: OrderingDatabaseErrorCode;

  constructor(code: OrderingDatabaseErrorCode) {
    super(code);
    this.name = "OrderingDatabaseError";
    this.code = code;
  }
}

export function tableNames(database: Database.Database): string[] {
  return (
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all() as string[]
  );
}

export function getOrCreateDraftBatch(database: Database.Database, createdAt = new Date().toISOString()): PurchaseBatch {
  const batch = database.transaction(() => {
    const existing = database
      .prepare("SELECT id FROM purchase_batches WHERE status = 'Draft' ORDER BY created_at ASC, id ASC LIMIT 1")
      .get() as { id: string } | undefined;
    if (existing) {
      return existing.id;
    }

    const id = randomUUID();
    database
      .prepare(
        "INSERT INTO purchase_batches (id, po_number, status, created_at, updated_at) VALUES (?, '', 'Draft', ?, ?)"
      )
      .run(id, createdAt, createdAt);
    return id;
  })();

  return getBatchDetail(database, batch);
}

export function getBatchDetail(database: Database.Database, batchId: string): PurchaseBatch {
  const batch = database
    .prepare(
      `SELECT id, po_number AS poNumber, status
         FROM purchase_batches
        WHERE id = ?`
    )
    .get(batchId) as { id: string; poNumber: string; status: PurchaseBatchStatus } | undefined;
  if (!batch) {
    throw new OrderingDatabaseError("ORDER_BATCH_NOT_FOUND");
  }

  const items = database
    .prepare(
      `SELECT id,
              batch_id AS batchId,
              product_name AS productName,
              supplier_group AS supplierGroup,
              supplier_product_id AS supplierProductId,
              supplier_product_code AS supplierProductCode,
              supplier_name AS supplierName,
              pack_size AS packSize,
              order_quantity AS orderQuantity,
              order_unit AS orderUnit,
              last_price AS lastPrice,
              purchase_count AS purchaseCount,
              latest_purchase_date AS latestPurchaseDate,
              brakes_status AS brakesStatus
         FROM purchase_batch_items
        WHERE batch_id = ?
        ORDER BY row_order ASC, id ASC`
    )
    .all(batchId) as PurchaseBatchItem[];

  const supplierRows = database
    .prepare(
      `SELECT supplier_code AS supplierCode,
              status,
              prepared_at AS preparedAt,
              ordered_at AS orderedAt,
              email_to AS emailTo,
              email_subject AS emailSubject,
              email_body AS emailBody
         FROM purchase_batch_suppliers
        WHERE batch_id = ?
        ORDER BY supplier_code ASC`
    )
    .all(batchId) as Array<{
    supplierCode: SupplierCode;
    status: SupplierOrderStatus;
    preparedAt: string | null;
    orderedAt: string | null;
    emailTo: string | null;
    emailSubject: string | null;
    emailBody: string | null;
  }>;
  const suppliers: PurchaseBatchSupplier[] = supplierRows.map((supplier) => ({
    supplierCode: supplier.supplierCode,
    status: supplier.status,
    preparedAt: supplier.preparedAt,
    orderedAt: supplier.orderedAt,
    emailDraft:
      supplier.emailTo === null && supplier.emailSubject === null && supplier.emailBody === null
        ? null
        : {
            to: supplier.emailTo ?? "",
            subject: supplier.emailSubject ?? "",
            body: supplier.emailBody ?? ""
          }
  }));

  return { ...batch, items, suppliers };
}

export function addReadyIntakeToBatch(database: Database.Database, input: AddReadyIntakeToBatchInput): PurchaseBatch {
  const transferredAt = input.transferredAt ?? new Date().toISOString();
  database.transaction(() => {
    requireBatch(database, input.batchId);
    const intake = database
      .prepare("SELECT status FROM purchase_intakes WHERE id = ?")
      .get(input.intakeId) as { status: string } | undefined;
    if (intake?.status === "AddedToOrder") {
      throw new OrderingDatabaseError("INTAKE_ALREADY_ADDED");
    }
    if (intake?.status !== "ReadyForPurchase") {
      throw new OrderingDatabaseError("INTAKE_NOT_READY_FOR_ORDER");
    }

    const rows = database
      .prepare(
        `SELECT id,
                row_order AS rowOrder,
                product_name AS productName,
                quantity,
                unit,
                supplier_code AS supplierCode,
                supplier_product_id AS supplierProductId,
                supplier_product_code AS supplierProductCode,
                supplier_name AS supplierName,
                supplier_pack_size AS packSize,
                supplier_last_price AS lastPrice,
                supplier_purchase_count AS purchaseCount,
                supplier_last_purchase_date AS latestPurchaseDate
           FROM purchase_intake_items
          WHERE intake_id = ?
          ORDER BY row_order ASC, id ASC`
      )
      .all(input.intakeId) as Array<{
      id: string;
      rowOrder: number;
      productName: string;
      quantity: number | null;
      unit: string | null;
      supplierCode: string | null;
      supplierProductId: string | null;
      supplierProductCode: string | null;
      supplierName: string | null;
      packSize: string | null;
      lastPrice: number | null;
      purchaseCount: number | null;
      latestPurchaseDate: string | null;
    }>;

    const insertItem = database.prepare(
      `INSERT INTO purchase_batch_items (
         id, batch_id, row_order, product_name, supplier_group, supplier_product_id,
         supplier_product_code, supplier_name, pack_size, order_quantity, order_unit,
         last_price, purchase_count, latest_purchase_date, brakes_status, brakes_message,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', NULL, ?, ?)`
    );
    const addSupplier = database.prepare(
      `INSERT INTO purchase_batch_suppliers (batch_id, supplier_code, status, updated_at)
       VALUES (?, ?, 'Pending', ?)
       ON CONFLICT(batch_id, supplier_code) DO NOTHING`
    );

    for (const row of rows) {
      if (!Number.isFinite(row.quantity) || row.quantity === null || row.quantity <= 0) {
        throw new OrderingDatabaseError("INVALID_ORDER_QUANTITY");
      }
      const supplierGroup = supplierGroupFor(row.supplierCode);
      insertItem.run(
        `${input.intakeId}:${row.id}`,
        input.batchId,
        row.rowOrder,
        row.productName,
        supplierGroup,
        row.supplierProductId,
        row.supplierProductCode,
        row.supplierName,
        row.packSize,
        row.quantity,
        orderUnitFor(row.unit, row.packSize),
        row.lastPrice,
        row.purchaseCount,
        row.latestPurchaseDate,
        transferredAt,
        transferredAt
      );
      if (supplierGroup !== "UNMATCHED") {
        addSupplier.run(input.batchId, supplierGroup, transferredAt);
      }
    }

    database
      .prepare("UPDATE purchase_intakes SET status = 'AddedToOrder', updated_at = ? WHERE id = ?")
      .run(transferredAt, input.intakeId);
    touchBatch(database, input.batchId, transferredAt);
  })();

  return getBatchDetail(database, input.batchId);
}

export function addBatchItem(database: Database.Database, input: AddBatchItemInput): PurchaseBatch {
  const savedAt = new Date().toISOString();
  validateOrderItem(input);
  database.transaction(() => {
    requireBatch(database, input.batchId);
    const rowOrder = database
      .prepare("SELECT COALESCE(MAX(row_order), -1) + 1 AS rowOrder FROM purchase_batch_items WHERE batch_id = ?")
      .pluck()
      .get(input.batchId) as number;
    const itemId = input.id ?? randomUUID();
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
        itemId,
        input.batchId,
        rowOrder,
        input.productName.trim(),
        input.supplierGroup,
        input.supplierProductId ?? null,
        input.supplierProductCode ?? null,
        input.supplierName ?? null,
        input.packSize ?? null,
        input.orderQuantity,
        input.orderUnit.trim(),
        input.lastPrice ?? null,
        input.purchaseCount ?? null,
        input.latestPurchaseDate ?? null,
        savedAt,
        savedAt
      );
    if (input.supplierGroup !== "UNMATCHED") {
      ensureSupplierRow(database, input.batchId, input.supplierGroup, savedAt);
    }
    touchBatch(database, input.batchId, savedAt);
  })();

  return getBatchDetail(database, input.batchId);
}

export function updateBatchItem(database: Database.Database, input: UpdateBatchItemInput): PurchaseBatch {
  const savedAt = new Date().toISOString();
  database.transaction(() => {
    requireBatch(database, input.batchId);
    const existing = database
      .prepare(
        `SELECT product_name AS productName, supplier_group AS supplierGroup,
                supplier_product_id AS supplierProductId, supplier_product_code AS supplierProductCode,
                supplier_name AS supplierName, pack_size AS packSize, order_quantity AS orderQuantity,
                order_unit AS orderUnit, last_price AS lastPrice, purchase_count AS purchaseCount,
                latest_purchase_date AS latestPurchaseDate
           FROM purchase_batch_items
          WHERE id = ? AND batch_id = ?`
      )
      .get(input.itemId, input.batchId) as Omit<AddBatchItemInput, "batchId" | "id"> | undefined;
    if (!existing) {
      throw new OrderingDatabaseError("ORDER_BATCH_ITEM_NOT_FOUND");
    }

    const next = { ...existing, ...definedFields(input) };
    validateOrderItem(next);
    database
      .prepare(
        `UPDATE purchase_batch_items
            SET product_name = ?, supplier_group = ?, supplier_product_id = ?,
                supplier_product_code = ?, supplier_name = ?, pack_size = ?,
                order_quantity = ?, order_unit = ?, last_price = ?, purchase_count = ?,
                latest_purchase_date = ?, updated_at = ?
          WHERE id = ? AND batch_id = ?`
      )
      .run(
        next.productName.trim(),
        next.supplierGroup,
        next.supplierProductId ?? null,
        next.supplierProductCode ?? null,
        next.supplierName ?? null,
        next.packSize ?? null,
        next.orderQuantity,
        next.orderUnit.trim(),
        next.lastPrice ?? null,
        next.purchaseCount ?? null,
        next.latestPurchaseDate ?? null,
        savedAt,
        input.itemId,
        input.batchId
      );
    if (next.supplierGroup !== "UNMATCHED") {
      ensureSupplierRow(database, input.batchId, next.supplierGroup, savedAt);
    }
    removeEmptySupplierRows(database, input.batchId);
    recomputeBatchStatus(database, input.batchId, savedAt);
  })();

  return getBatchDetail(database, input.batchId);
}

export function deleteBatchItem(database: Database.Database, batchId: string, itemId: string): PurchaseBatch {
  const savedAt = new Date().toISOString();
  database.transaction(() => {
    requireBatch(database, batchId);
    const result = database
      .prepare("DELETE FROM purchase_batch_items WHERE id = ? AND batch_id = ?")
      .run(itemId, batchId);
    if (result.changes === 0) {
      throw new OrderingDatabaseError("ORDER_BATCH_ITEM_NOT_FOUND");
    }
    removeEmptySupplierRows(database, batchId);
    recomputeBatchStatus(database, batchId, savedAt);
  })();

  return getBatchDetail(database, batchId);
}

export function saveBatchPo(database: Database.Database, batchId: string, poNumber: string): PurchaseBatch {
  const savedAt = new Date().toISOString();
  const result = database
    .prepare("UPDATE purchase_batches SET po_number = ?, updated_at = ? WHERE id = ?")
    .run(poNumber.trim(), savedAt, batchId);
  if (result.changes === 0) {
    throw new OrderingDatabaseError("ORDER_BATCH_NOT_FOUND");
  }
  return getBatchDetail(database, batchId);
}

export function getOrderingProfile(database: Database.Database): OrderingProfile {
  const profile = database
    .prepare(
      `SELECT purchaser_name AS purchaserName,
              hotel_name AS hotelName,
              campbells_email AS campbellsEmail,
              mark_murphy_email AS markMurphyEmail
         FROM purchase_ordering_profile
        WHERE id = 'default'`
    )
    .get() as OrderingProfile | undefined;
  return profile ?? { purchaserName: "", hotelName: "", campbellsEmail: "", markMurphyEmail: "" };
}

export function saveOrderingProfile(database: Database.Database, profile: OrderingProfile): OrderingProfile {
  database
    .prepare(
      `INSERT INTO purchase_ordering_profile (
         id, purchaser_name, hotel_name, campbells_email, mark_murphy_email, updated_at
       ) VALUES ('default', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         purchaser_name = excluded.purchaser_name,
         hotel_name = excluded.hotel_name,
         campbells_email = excluded.campbells_email,
         mark_murphy_email = excluded.mark_murphy_email,
         updated_at = excluded.updated_at`
    )
    .run(
      profile.purchaserName,
      profile.hotelName,
      profile.campbellsEmail,
      profile.markMurphyEmail,
      new Date().toISOString()
    );
  return getOrderingProfile(database);
}

export function markSupplierOrdered(database: Database.Database, input: MarkSupplierOrderedInput): PurchaseBatch {
  const orderedAt = input.orderedAt ?? new Date().toISOString();
  database.transaction(() => {
    requireBatch(database, input.batchId);
    const supplierHasItems = database
      .prepare("SELECT 1 FROM purchase_batch_items WHERE batch_id = ? AND supplier_group = ? LIMIT 1")
      .get(input.batchId, input.supplierCode);
    if (!supplierHasItems) {
      throw new OrderingDatabaseError("SUPPLIER_NOT_IN_BATCH");
    }
    ensureSupplierRow(database, input.batchId, input.supplierCode, orderedAt);
    database
      .prepare(
        `UPDATE purchase_batch_suppliers
            SET status = 'Ordered', ordered_at = ?, updated_at = ?
          WHERE batch_id = ? AND supplier_code = ?`
      )
      .run(orderedAt, orderedAt, input.batchId, input.supplierCode);
    recomputeBatchStatus(database, input.batchId, orderedAt);
  })();

  return getBatchDetail(database, input.batchId);
}

function requireBatch(database: Database.Database, batchId: string): void {
  const exists = database.prepare("SELECT 1 FROM purchase_batches WHERE id = ?").get(batchId);
  if (!exists) {
    throw new OrderingDatabaseError("ORDER_BATCH_NOT_FOUND");
  }
}

function supplierGroupFor(supplierCode: string | null): SupplierGroup {
  return supplierCode === "CMP" || supplierCode === "MM" || supplierCode === "BRK" ? supplierCode : "UNMATCHED";
}

function orderUnitFor(unit: string | null, packSize: string | null): string {
  return packSize?.trim() || unit?.trim() || "unit";
}

function validateOrderItem(input: Pick<AddBatchItemInput, "productName" | "orderQuantity" | "orderUnit">): void {
  if (
    typeof input.productName !== "string" ||
    input.productName.trim().length === 0 ||
    !Number.isFinite(input.orderQuantity) ||
    input.orderQuantity <= 0 ||
    typeof input.orderUnit !== "string" ||
    input.orderUnit.trim().length === 0
  ) {
    throw new OrderingDatabaseError("INVALID_ORDER_QUANTITY");
  }
}

function ensureSupplierRow(database: Database.Database, batchId: string, supplierCode: SupplierCode, updatedAt: string): void {
  database
    .prepare(
      `INSERT INTO purchase_batch_suppliers (batch_id, supplier_code, status, updated_at)
       VALUES (?, ?, 'Pending', ?)
       ON CONFLICT(batch_id, supplier_code) DO NOTHING`
    )
    .run(batchId, supplierCode, updatedAt);
}

function removeEmptySupplierRows(database: Database.Database, batchId: string): void {
  database
    .prepare(
      `DELETE FROM purchase_batch_suppliers
        WHERE batch_id = ?
          AND NOT EXISTS (
            SELECT 1
              FROM purchase_batch_items
             WHERE purchase_batch_items.batch_id = purchase_batch_suppliers.batch_id
               AND purchase_batch_items.supplier_group = purchase_batch_suppliers.supplier_code
          )`
    )
    .run(batchId);
}

function recomputeBatchStatus(database: Database.Database, batchId: string, updatedAt: string): void {
  const rows = database
    .prepare(
      `SELECT supplier_code AS supplierCode, status
         FROM purchase_batch_suppliers
        WHERE batch_id = ?`
    )
    .all(batchId) as Array<{ supplierCode: SupplierCode; status: SupplierOrderStatus }>;
  const status: PurchaseBatchStatus =
    rows.length > 0 && rows.every((supplier) => supplier.status === "Ordered")
      ? "Ordered"
      : rows.some((supplier) => supplier.status === "Ordered")
        ? "PartiallyOrdered"
        : "Draft";
  database.prepare("UPDATE purchase_batches SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, batchId);
}

function touchBatch(database: Database.Database, batchId: string, updatedAt: string): void {
  database.prepare("UPDATE purchase_batches SET updated_at = ? WHERE id = ?").run(updatedAt, batchId);
}

function definedFields(input: UpdateBatchItemInput): Partial<AddBatchItemInput> {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "batchId" && key !== "itemId" && value !== undefined));
}
