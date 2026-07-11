import Database from "better-sqlite3";

export const orderingSchema = `
  CREATE TABLE IF NOT EXISTS purchase_batches (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('Draft', 'PartiallyOrdered', 'Ordered')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_ordering_profile (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    purchaser_name TEXT NOT NULL DEFAULT '',
    hotel_name TEXT NOT NULL DEFAULT '',
    campbells_email TEXT NOT NULL DEFAULT '',
    mark_murphy_email TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_batch_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    row_order INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    supplier_group TEXT NOT NULL CHECK (supplier_group IN ('CMP', 'MM', 'BRK', 'UNMATCHED')),
    supplier_product_id TEXT,
    supplier_product_code TEXT,
    supplier_name TEXT,
    pack_size TEXT,
    order_quantity REAL CHECK (order_quantity IS NULL OR order_quantity > 0),
    order_unit TEXT NOT NULL,
    last_price REAL,
    purchase_count INTEGER,
    latest_purchase_date TEXT,
    brakes_status TEXT NOT NULL CHECK (brakes_status IN ('Pending', 'Added', 'AwaitingConfirmation', 'InvalidCode', 'Failed')),
    brakes_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS purchase_batch_suppliers (
    batch_id TEXT NOT NULL,
    supplier_code TEXT NOT NULL CHECK (supplier_code IN ('CMP', 'MM', 'BRK')),
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Prepared', 'Ordered')),
    email_to TEXT,
    email_subject TEXT,
    email_body TEXT,
    prepared_at TEXT,
    ordered_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (batch_id, supplier_code),
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS purchase_inventory_checks (
    batch_id TEXT NOT NULL,
    item_id TEXT PRIMARY KEY,
    snapshot_key TEXT NOT NULL,
    equivalent_quantity REAL NOT NULL,
    locations_json TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('NeedsRecheck', 'RestockOnly')),
    confirmed_at TEXT NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES purchase_batch_items(id) ON DELETE CASCADE
  );
`;

export function migrateOrderingBatchQuantity(database: Database.Database): void {
  const column = database
    .prepare("PRAGMA table_info(purchase_batch_items)")
    .all()
    .find((entry) => (entry as { name?: string }).name === "order_quantity") as { notnull?: number } | undefined;

  if (!column?.notnull) return;

  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE purchase_batch_items_quantity_migration (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          row_order INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          supplier_group TEXT NOT NULL CHECK (supplier_group IN ('CMP', 'MM', 'BRK', 'UNMATCHED')),
          supplier_product_id TEXT,
          supplier_product_code TEXT,
          supplier_name TEXT,
          pack_size TEXT,
          order_quantity REAL CHECK (order_quantity IS NULL OR order_quantity > 0),
          order_unit TEXT NOT NULL,
          last_price REAL,
          purchase_count INTEGER,
          latest_purchase_date TEXT,
          brakes_status TEXT NOT NULL CHECK (brakes_status IN ('Pending', 'Added', 'AwaitingConfirmation', 'InvalidCode', 'Failed')),
          brakes_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE
        );
        INSERT INTO purchase_batch_items_quantity_migration
          SELECT id, batch_id, row_order, product_name, supplier_group, supplier_product_id,
                 supplier_product_code, supplier_name, pack_size, order_quantity, order_unit,
                 last_price, purchase_count, latest_purchase_date, brakes_status, brakes_message,
                 created_at, updated_at
            FROM purchase_batch_items;
        DROP TABLE purchase_batch_items;
        ALTER TABLE purchase_batch_items_quantity_migration RENAME TO purchase_batch_items;
      `);
    })();
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

const migratedIntakeSchema = `
  CREATE TABLE purchase_intakes_ordering_migration (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Pending', 'ReadyForPurchase', 'AddedToOrder', 'RecognitionFailed')),
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

  CREATE TABLE purchase_intake_items_ordering_migration (
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
    FOREIGN KEY (intake_id) REFERENCES purchase_intakes_ordering_migration(id) ON DELETE CASCADE
  );

  CREATE TABLE purchase_match_feedback_item_state_ordering_migration (
    intake_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    normalised_name TEXT NOT NULL,
    supplier_product_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (intake_id, client_id),
    FOREIGN KEY (intake_id) REFERENCES purchase_intakes_ordering_migration(id) ON DELETE CASCADE
  );
`;

const intakeColumns = `
  id, status, source_type, original_filename, original_mime_type,
  stored_mime_type, original_size_bytes, stored_size_bytes, source_blob,
  ai_model, unreadable_text_json, general_notes, created_at, updated_at,
  handed_off_at
`;

const intakeItemColumns = `
  id, intake_id, row_order, department, raw_text, product_name, quantity,
  unit, notes, confidence, manual_reviewed, supplier_product_id, supplier_name,
  supplier_code, supplier_product_code, supplier_product_name, supplier_pack_size,
  supplier_last_price, supplier_purchase_count, supplier_last_purchase_date,
  current_inventory_quantity, created_at, updated_at
`;

const feedbackStateColumns = "intake_id, client_id, normalised_name, supplier_product_id, updated_at";

export function migratePurchaseIntakesForOrdering(database: Database.Database): void {
  const intakeSchema = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'purchase_intakes'")
    .get() as { sql: string } | undefined;

  if (!intakeSchema || intakeSchema.sql.includes("AddedToOrder")) {
    return;
  }

  database.pragma("foreign_keys = OFF");
  try {
    database.transaction(() => {
      database.exec(migratedIntakeSchema);
      database.exec(`
        INSERT INTO purchase_intakes_ordering_migration (${intakeColumns})
        SELECT ${intakeColumns} FROM purchase_intakes;

        INSERT INTO purchase_intake_items_ordering_migration (${intakeItemColumns})
        SELECT ${intakeItemColumns} FROM purchase_intake_items;

        INSERT INTO purchase_match_feedback_item_state_ordering_migration (${feedbackStateColumns})
        SELECT ${feedbackStateColumns} FROM purchase_match_feedback_item_state;

        DROP TABLE purchase_match_feedback_item_state;
        DROP TABLE purchase_intake_items;
        DROP TABLE purchase_intakes;

        ALTER TABLE purchase_intakes_ordering_migration RENAME TO purchase_intakes;
        ALTER TABLE purchase_intake_items_ordering_migration RENAME TO purchase_intake_items;
        ALTER TABLE purchase_match_feedback_item_state_ordering_migration RENAME TO purchase_match_feedback_item_state;
      `);
    })();
  } finally {
    database.pragma("foreign_keys = ON");
  }

  const foreignKeyErrors = database.pragma("foreign_key_check") as unknown[];
  if (foreignKeyErrors.length > 0) {
    throw new Error("purchase intake migration left foreign key violations");
  }
}
