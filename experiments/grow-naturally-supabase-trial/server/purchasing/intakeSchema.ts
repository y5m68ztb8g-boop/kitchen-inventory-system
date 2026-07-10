export type PurchaseIntakeSource = "camera" | "image" | "pdf" | "spreadsheet";

export type PurchaseIntakeStatus = "Draft" | "Pending" | "ReadyForPurchase" | "RecognitionFailed";

export type PurchaseIntakeItem = {
  clientId: string;
  confidence: number;
  currentInventoryQuantity?: number | null;
  department: string | null;
  manualReviewed: boolean;
  notes: string | null;
  product_name: string;
  quantity: number | null;
  raw_text: string;
  supplierCode?: string | null;
  supplierLastPrice?: number | null;
  supplierName?: string | null;
  supplierPackSize?: string | null;
  supplierProductCode?: string | null;
  supplierProductId?: string | null;
  supplierProductName?: string | null;
  supplierPurchaseCount?: number | null;
  supplierLastPurchaseDate?: string | null;
  unit: string | null;
};

export type SaveIntakeInput = {
  aiModel: string | null;
  createdAt?: string;
  generalNotes: string | null;
  id: string;
  items: PurchaseIntakeItem[];
  originalFilename: string;
  originalMimeType: string;
  originalSizeBytes: number;
  sourceBlob: Buffer;
  sourceType: PurchaseIntakeSource;
  storedMimeType: string;
  storedSizeBytes: number;
  unreadableText: string[];
};

export type HandOffIntakeInput = {
  handedOffAt?: string;
  intakeId: string;
  items: PurchaseIntakeItem[];
};

export const purchaseIntakeSchema = `
  CREATE TABLE IF NOT EXISTS purchase_intakes (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Pending', 'ReadyForPurchase', 'RecognitionFailed')),
    source_type TEXT NOT NULL CHECK (source_type IN ('camera', 'image', 'pdf', 'spreadsheet')),
    original_filename TEXT NOT NULL,
    original_mime_type TEXT NOT NULL,
    stored_mime_type TEXT NOT NULL,
    original_size_bytes INTEGER NOT NULL,
    stored_size_bytes INTEGER NOT NULL,
    source_blob BLOB NOT NULL,
    ai_model TEXT,
    unreadable_text_json TEXT NOT NULL,
    general_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    handed_off_at TEXT
  );

  CREATE TABLE IF NOT EXISTS purchase_intake_items (
    id TEXT PRIMARY KEY,
    intake_id TEXT NOT NULL,
    row_order INTEGER NOT NULL,
    department TEXT,
    raw_text TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    notes TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    manual_reviewed INTEGER NOT NULL CHECK (manual_reviewed IN (0, 1)),
    supplier_product_id TEXT,
    supplier_name TEXT,
    supplier_code TEXT,
    supplier_product_code TEXT,
    supplier_product_name TEXT,
    supplier_pack_size TEXT,
    supplier_last_price REAL,
    supplier_purchase_count INTEGER,
    supplier_last_purchase_date TEXT,
    current_inventory_quantity REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (intake_id) REFERENCES purchase_intakes(id) ON DELETE CASCADE
  );
`;
