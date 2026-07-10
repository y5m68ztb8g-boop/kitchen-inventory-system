import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { WhiteboardReviewItem } from "../../src/purchasing/types";
import { PurchasingApiError } from "./errors";
import {
  purchaseIntakeSchema,
  type HandOffIntakeInput,
  type PurchaseIntakeItem,
  type PurchaseIntakeStatus,
  type SaveIntakeInput
} from "./intakeSchema";
import { normaliseProductName } from "./matching";

export type DraftScanInput = {
  aiModel: string;
  createdAt?: string;
  generalNotes: string | null;
  id: string;
  image: Buffer;
  originalFilename: string;
  originalMimeType: string;
  originalSizeBytes: number;
  storedMimeType: string;
  storedSizeBytes: number;
  unreadableText: string[];
};

export type HistoricalRecommendationFields = {
  currentInventoryQuantity: number | null;
  recommendedLastPrice: number | null;
  recommendedLastPurchaseDate: string | null;
  recommendedPackSize: string | null;
  recommendedProductCode: string | null;
  recommendedProductName: string | null;
  recommendedPurchaseCount: number | null;
  recommendedSupplierCode: string | null;
  recommendedSupplierName: string | null;
  recommendedSupplierProductId: string | null;
};

export type StoredMatchFeedback = {
  confirmationCount: number;
  lastConfirmedAt: string;
  supplierProductId: string;
};

export type ConfirmedWhiteboardItem = WhiteboardReviewItem & Partial<HistoricalRecommendationFields>;

export type ConfirmWhiteboardScanInput = {
  confirmedAt?: string;
  items: ConfirmedWhiteboardItem[];
  scanId: string;
};

const schema = `${purchaseIntakeSchema}

  CREATE TABLE IF NOT EXISTS whiteboard_scans (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Pending', 'RecognitionFailed')),
    original_filename TEXT NOT NULL,
    original_mime_type TEXT NOT NULL,
    stored_mime_type TEXT NOT NULL,
    original_size_bytes INTEGER NOT NULL,
    stored_size_bytes INTEGER NOT NULL,
    image_blob BLOB NOT NULL,
    ai_model TEXT NOT NULL,
    unreadable_text_json TEXT NOT NULL,
    general_notes TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    confirmed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS whiteboard_scan_items (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL,
    row_order INTEGER NOT NULL,
    department TEXT,
    raw_text TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    notes TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    manual_reviewed INTEGER NOT NULL CHECK (manual_reviewed IN (0, 1)),
    status TEXT NOT NULL CHECK (status = 'Pending'),
    recommended_supplier_product_id TEXT,
    recommended_supplier_name TEXT,
    recommended_supplier_code TEXT,
    recommended_product_code TEXT,
    recommended_product_name TEXT,
    recommended_pack_size TEXT,
    recommended_last_price REAL,
    recommended_purchase_count INTEGER,
    recommended_last_purchase_date TEXT,
    current_inventory_quantity REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (scan_id) REFERENCES whiteboard_scans(id) ON DELETE CASCADE
  );
`;

export function createPurchasingDatabase(path: string | Database.Database): Database.Database {
  if (typeof path === "string") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const database = typeof path === "string" ? new Database(path) : path;
  database.pragma("foreign_keys = ON");
  database.exec(schema);
  return database;
}

export function saveDraftScan(database: Database.Database, input: DraftScanInput) {
  database
    .prepare(
      `INSERT INTO whiteboard_scans (
         id, status, original_filename, original_mime_type, stored_mime_type,
         original_size_bytes, stored_size_bytes, image_blob, ai_model,
         unreadable_text_json, general_notes, error_code, created_at, confirmed_at
       ) VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`
    )
    .run(
      input.id,
      input.originalFilename,
      input.originalMimeType,
      input.storedMimeType,
      input.originalSizeBytes,
      input.storedSizeBytes,
      input.image,
      input.aiModel,
      JSON.stringify(input.unreadableText),
      input.generalNotes,
      input.createdAt ?? new Date().toISOString()
    );
}

export function getScanImage(database: Database.Database, scanId: string) {
  const row = database
    .prepare(
      `SELECT image_blob AS buffer, original_filename AS filename, stored_mime_type AS mimeType
         FROM whiteboard_scans
        WHERE id = ?`
    )
    .get(scanId) as { buffer: Buffer; filename: string; mimeType: string } | undefined;

  return row ?? null;
}

export function saveDraftIntake(database: Database.Database, input: SaveIntakeInput) {
  persistIntake(database, input, "Draft");
}

export function savePendingIntake(database: Database.Database, input: SaveIntakeInput) {
  validatePurchaseIntakeItems(input.items);
  persistIntake(database, input, "Pending");
}

export function handOffIntakeToPurchasing(database: Database.Database, input: HandOffIntakeInput) {
  validatePurchaseIntakeItems(input.items);
  const handedOffAt = input.handedOffAt ?? new Date().toISOString();
  const handOff = database.transaction(() => {
    const intake = database
      .prepare("SELECT status FROM purchase_intakes WHERE id = ?")
      .get(input.intakeId) as { status: PurchaseIntakeStatus } | undefined;

    if (!intake) {
      throw new PurchasingApiError("INTAKE_NOT_FOUND");
    }
    if (intake.status !== "Draft" && intake.status !== "Pending") {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }

    replaceIntakeItems(database, input.intakeId, input.items, handedOffAt);
    recordMatchFeedback(database, input.intakeId, input.items, handedOffAt);
    database
      .prepare(
        `UPDATE purchase_intakes
            SET status = 'ReadyForPurchase', updated_at = ?, handed_off_at = ?
          WHERE id = ?`
      )
      .run(handedOffAt, handedOffAt, input.intakeId);
  });

  handOff();
}

export function getIntakeSource(database: Database.Database, intakeId: string) {
  const row = database
    .prepare(
      `SELECT source_blob AS buffer, original_filename AS filename, stored_mime_type AS mimeType
         FROM purchase_intakes
        WHERE id = ?`
    )
    .get(intakeId) as { buffer: Buffer; filename: string; mimeType: string } | undefined;

  return row ?? null;
}

export function listMatchFeedback(
  database: Database.Database,
  normalisedName: string
): StoredMatchFeedback[] {
  return database
    .prepare(
      `SELECT confirmation_count AS confirmationCount,
              last_confirmed_at AS lastConfirmedAt,
              supplier_product_id AS supplierProductId
         FROM purchase_match_feedback
        WHERE normalised_name = ?
        ORDER BY confirmation_count DESC, last_confirmed_at DESC, supplier_product_id ASC`
    )
    .all(normalisedName) as StoredMatchFeedback[];
}

function persistIntake(database: Database.Database, input: SaveIntakeInput, status: Extract<PurchaseIntakeStatus, "Draft" | "Pending">) {
  const savedAt = input.createdAt ?? new Date().toISOString();
  const save = database.transaction(() => {
    const existing = database
      .prepare("SELECT status FROM purchase_intakes WHERE id = ?")
      .get(input.id) as { status: PurchaseIntakeStatus } | undefined;
    if (existing?.status === "ReadyForPurchase") {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }

    database
      .prepare(
        `INSERT INTO purchase_intakes (
           id, status, source_type, original_filename, original_mime_type,
           stored_mime_type, original_size_bytes, stored_size_bytes, source_blob,
           ai_model, unreadable_text_json, general_notes, created_at, updated_at, handed_off_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           source_type = excluded.source_type,
           original_filename = excluded.original_filename,
           original_mime_type = excluded.original_mime_type,
           stored_mime_type = excluded.stored_mime_type,
           original_size_bytes = excluded.original_size_bytes,
           stored_size_bytes = excluded.stored_size_bytes,
           source_blob = excluded.source_blob,
           ai_model = excluded.ai_model,
           unreadable_text_json = excluded.unreadable_text_json,
           general_notes = excluded.general_notes,
           updated_at = excluded.updated_at,
           handed_off_at = NULL`
      )
      .run(
        input.id,
        status,
        input.sourceType,
        input.originalFilename,
        input.originalMimeType,
        input.storedMimeType,
        input.originalSizeBytes,
        input.storedSizeBytes,
        input.sourceBlob,
        input.aiModel,
        JSON.stringify(input.unreadableText),
        input.generalNotes,
        savedAt,
        savedAt
    );
    replaceIntakeItems(database, input.id, input.items, savedAt);
    if (status === "Pending") {
      recordMatchFeedback(database, input.id, input.items, savedAt);
    }
  });

  save();
}

function recordMatchFeedback(
  database: Database.Database,
  intakeId: string,
  items: PurchaseIntakeItem[],
  confirmedAt: string
) {
  const stateForItem = database.prepare(
    `SELECT normalised_name AS normalisedName, supplier_product_id AS supplierProductId
       FROM purchase_match_feedback_item_state
      WHERE intake_id = ? AND client_id = ?`
  );
  const staleClientIds = database.prepare(
    "SELECT client_id AS clientId FROM purchase_match_feedback_item_state WHERE intake_id = ?"
  );
  const deleteItemState = database.prepare(
    "DELETE FROM purchase_match_feedback_item_state WHERE intake_id = ? AND client_id = ?"
  );
  const upsertFeedback = database.prepare(
    `INSERT INTO purchase_match_feedback (
       normalised_name, supplier_product_id, confirmation_count, last_confirmed_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(normalised_name, supplier_product_id) DO UPDATE SET
       confirmation_count = confirmation_count + 1,
       last_confirmed_at = excluded.last_confirmed_at`
  );
  const upsertItemState = database.prepare(
    `INSERT INTO purchase_match_feedback_item_state (
       intake_id, client_id, normalised_name, supplier_product_id, updated_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(intake_id, client_id) DO UPDATE SET
       normalised_name = excluded.normalised_name,
       supplier_product_id = excluded.supplier_product_id,
       updated_at = excluded.updated_at`
  );
  const clientIds = new Set(items.map((item) => item.clientId));

  for (const { clientId } of staleClientIds.all(intakeId) as Array<{ clientId: string }>) {
    if (!clientIds.has(clientId)) {
      deleteItemState.run(intakeId, clientId);
    }
  }

  for (const item of items) {
    if (!item.supplierProductId) {
      deleteItemState.run(intakeId, item.clientId);
      continue;
    }

    const normalisedName = normaliseProductName(item.matchQueryName ?? item.product_name);
    const currentState = stateForItem.get(intakeId, item.clientId) as
      | { normalisedName: string; supplierProductId: string }
      | undefined;
    if (
      currentState?.normalisedName === normalisedName &&
      currentState.supplierProductId === item.supplierProductId
    ) {
      continue;
    }

    upsertFeedback.run(normalisedName, item.supplierProductId, confirmedAt);
    upsertItemState.run(intakeId, item.clientId, normalisedName, item.supplierProductId, confirmedAt);
  }
}

function replaceIntakeItems(
  database: Database.Database,
  intakeId: string,
  items: PurchaseIntakeItem[],
  savedAt: string
) {
  const insertItem = database.prepare(
    `INSERT INTO purchase_intake_items (
       id, intake_id, row_order, department, raw_text, product_name, quantity,
       unit, notes, confidence, manual_reviewed, supplier_product_id,
       supplier_name, supplier_code, supplier_product_code, supplier_product_name,
       supplier_pack_size, supplier_last_price, supplier_purchase_count,
       supplier_last_purchase_date, current_inventory_quantity, created_at, updated_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )`
  );

  database.prepare("DELETE FROM purchase_intake_items WHERE intake_id = ?").run(intakeId);
  items.forEach((item, rowOrder) => {
    insertItem.run(
      `${intakeId}:${item.clientId}`,
      intakeId,
      rowOrder,
      item.department,
      item.raw_text,
      item.product_name.trim(),
      item.quantity,
      item.unit,
      item.notes,
      item.confidence,
      item.manualReviewed ? 1 : 0,
      item.supplierProductId ?? null,
      item.supplierName ?? null,
      item.supplierCode ?? null,
      item.supplierProductCode ?? null,
      item.supplierProductName ?? null,
      item.supplierPackSize ?? null,
      item.supplierLastPrice ?? null,
      item.supplierPurchaseCount ?? null,
      item.supplierLastPurchaseDate ?? null,
      item.currentInventoryQuantity ?? null,
      savedAt,
      savedAt
    );
  });
}

function validatePurchaseIntakeItems(items: PurchaseIntakeItem[]) {
  if (items.length === 0) {
    throw new PurchasingApiError("INVALID_REVIEW_DATA");
  }

  const clientIds = new Set<string>();
  for (const item of items) {
    const quantityIsValid = item.quantity === null || (Number.isFinite(item.quantity) && item.quantity >= 0);
    const confidenceIsValid = Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1;

    if (
      clientIds.has(item.clientId) ||
      typeof item.clientId !== "string" ||
      item.clientId.trim().length === 0 ||
      typeof item.product_name !== "string" ||
      item.product_name.trim().length === 0 ||
      !quantityIsValid ||
      !confidenceIsValid ||
      typeof item.manualReviewed !== "boolean" ||
      (item.confidence < 0.8 && !item.manualReviewed)
    ) {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }

    clientIds.add(item.clientId);
  }
}

export function confirmWhiteboardScan(database: Database.Database, input: ConfirmWhiteboardScanInput) {
  validateReviewItems(input.items);
  const confirmedAt = input.confirmedAt ?? new Date().toISOString();
  const insertItem = database.prepare(
    `INSERT INTO whiteboard_scan_items (
       id, scan_id, row_order, department, raw_text, product_name, quantity,
       unit, notes, confidence, manual_reviewed, status,
       recommended_supplier_product_id, recommended_supplier_name,
       recommended_supplier_code, recommended_product_code,
       recommended_product_name, recommended_pack_size, recommended_last_price,
       recommended_purchase_count, recommended_last_purchase_date,
       current_inventory_quantity, created_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )`
  );

  const confirm = database.transaction(() => {
    database.prepare("DELETE FROM whiteboard_scan_items WHERE scan_id = ?").run(input.scanId);

    input.items.forEach((item, rowOrder) => {
      insertItem.run(
        `${input.scanId}:${item.clientId}`,
        input.scanId,
        rowOrder,
        item.department,
        item.raw_text,
        item.product_name.trim(),
        item.quantity,
        item.unit,
        item.notes,
        item.confidence,
        item.manualReviewed ? 1 : 0,
        item.recommendedSupplierProductId ?? null,
        item.recommendedSupplierName ?? null,
        item.recommendedSupplierCode ?? null,
        item.recommendedProductCode ?? null,
        item.recommendedProductName ?? null,
        item.recommendedPackSize ?? null,
        item.recommendedLastPrice ?? null,
        item.recommendedPurchaseCount ?? null,
        item.recommendedLastPurchaseDate ?? null,
        item.currentInventoryQuantity ?? null,
        confirmedAt
      );
    });

    database
      .prepare("UPDATE whiteboard_scans SET status = 'Pending', confirmed_at = ? WHERE id = ?")
      .run(confirmedAt, input.scanId);
  });

  confirm();
}

function validateReviewItems(items: ConfirmedWhiteboardItem[]) {
  if (items.length === 0) {
    throw new PurchasingApiError("INVALID_REVIEW_DATA");
  }

  const clientIds = new Set<string>();
  for (const item of items) {
    const quantityIsValid = item.quantity === null || (Number.isFinite(item.quantity) && item.quantity >= 0);
    const confidenceIsValid =
      Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1;

    if (
      clientIds.has(item.clientId) ||
      typeof item.product_name !== "string" ||
      item.product_name.trim().length === 0 ||
      !quantityIsValid ||
      !confidenceIsValid ||
      typeof item.manualReviewed !== "boolean" ||
      (item.confidence < 0.8 && !item.manualReviewed)
    ) {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }

    clientIds.add(item.clientId);
  }
}
