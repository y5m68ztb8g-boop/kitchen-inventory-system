import type Database from "better-sqlite3";

export const wineCellarSchema = `
  CREATE TABLE IF NOT EXISTS wine_cellar_racks (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_positions (
    id TEXT PRIMARY KEY,
    rack_id TEXT NOT NULL,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    code TEXT NOT NULL,
    width INTEGER NOT NULL CHECK (width > 0),
    depth INTEGER NOT NULL CHECK (depth > 0),
    capacity INTEGER NOT NULL CHECK (capacity = width * depth),
    current_quantity INTEGER NOT NULL CHECK (current_quantity >= 0 AND current_quantity <= capacity),
    stock_unit TEXT NOT NULL CHECK (stock_unit IN ('bottle', 'keg', 'other')),
    fill_direction TEXT NOT NULL CHECK (fill_direction IN ('front-to-back', 'back-to-front', 'left-to-right', 'right-to-left')),
    low_stock_mode TEXT NOT NULL CHECK (low_stock_mode IN ('percentage', 'absolute')),
    low_stock_threshold REAL NOT NULL CHECK (low_stock_threshold >= 0),
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (id, hotel_id, area_id),
    FOREIGN KEY (rack_id, hotel_id, area_id) REFERENCES wine_cellar_racks(id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_product_assignments (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    product_id TEXT,
    product_name TEXT NOT NULL,
    match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'unmatched')),
    supplier_name TEXT,
    supplier_product_code TEXT,
    invoice_reference TEXT,
    unit_cost REAL CHECK (unit_cost IS NULL OR unit_cost >= 0),
    currency TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    assigned_by_id TEXT NOT NULL,
    assigned_by_name TEXT NOT NULL,
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    FOREIGN KEY (position_id, hotel_id, area_id) REFERENCES wine_cellar_positions(id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_count_sessions (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status = 'completed'),
    notes TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    UNIQUE (id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_count_entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    position_id TEXT NOT NULL,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    before_quantity INTEGER NOT NULL,
    after_quantity INTEGER NOT NULL,
    capacity INTEGER NOT NULL,
    empty_slot_ids_json TEXT NOT NULL,
    abnormal_pattern INTEGER NOT NULL CHECK (abnormal_pattern IN (0, 1)),
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id, hotel_id, area_id) REFERENCES wine_cellar_count_sessions(id, hotel_id, area_id),
    FOREIGN KEY (position_id, hotel_id, area_id) REFERENCES wine_cellar_positions(id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_receipts (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    before_quantity INTEGER NOT NULL,
    after_quantity INTEGER NOT NULL,
    invoice_reference TEXT,
    unit_cost REAL CHECK (unit_cost IS NULL OR unit_cost >= 0),
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (position_id, hotel_id, area_id) REFERENCES wine_cellar_positions(id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_stock_adjustments (
    id TEXT PRIMARY KEY,
    position_id TEXT NOT NULL,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    delta INTEGER NOT NULL CHECK (delta != 0),
    reason TEXT NOT NULL,
    before_quantity INTEGER NOT NULL,
    after_quantity INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (position_id, hotel_id, area_id) REFERENCES wine_cellar_positions(id, hotel_id, area_id)
  );

  CREATE TABLE IF NOT EXISTS wine_cellar_audit_events (
    id TEXT PRIMARY KEY,
    hotel_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    changes_json TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS wine_cellar_racks_scope_idx ON wine_cellar_racks(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_positions_scope_idx ON wine_cellar_positions(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_assignments_scope_idx ON wine_cellar_product_assignments(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_count_sessions_scope_idx ON wine_cellar_count_sessions(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_count_entries_scope_idx ON wine_cellar_count_entries(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_receipts_scope_idx ON wine_cellar_receipts(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_adjustments_scope_idx ON wine_cellar_stock_adjustments(hotel_id, area_id);
  CREATE INDEX IF NOT EXISTS wine_cellar_audit_scope_idx ON wine_cellar_audit_events(hotel_id, area_id);
`;

export function initializeWineCellarSchema(database: Database.Database) {
  database.pragma("foreign_keys = ON");
  database.exec(wineCellarSchema);
}
