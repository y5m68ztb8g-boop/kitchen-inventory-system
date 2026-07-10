import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { WhiteboardReviewItem } from "../../src/purchasing/types";
import { PurchasingApiError } from "./errors";

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

export type ConfirmedWhiteboardItem = WhiteboardReviewItem & Partial<HistoricalRecommendationFields>;

export type ConfirmWhiteboardScanInput = {
  confirmedAt?: string;
  items: ConfirmedWhiteboardItem[];
  scanId: string;
};

const schema = `
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
        item.clientId,
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
  for (const item of items) {
    const quantityIsValid = item.quantity === null || (Number.isFinite(item.quantity) && item.quantity >= 0);
    const confidenceIsValid =
      Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1;

    if (
      typeof item.product_name !== "string" ||
      item.product_name.trim().length === 0 ||
      !quantityIsValid ||
      !confidenceIsValid ||
      typeof item.manualReviewed !== "boolean" ||
      (item.confidence < 0.8 && !item.manualReviewed)
    ) {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }
  }
}
