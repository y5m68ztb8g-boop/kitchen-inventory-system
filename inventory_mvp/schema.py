from pathlib import Path
import sqlite3


def connect_database(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    create_schema(conn)
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY,
            supplier_code TEXT NOT NULL UNIQUE,
            supplier_name TEXT NOT NULL,
            primary_use TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY,
            display_code TEXT NOT NULL UNIQUE,
            warehouse TEXT,
            location_type TEXT,
            description TEXT,
            notes TEXT,
            active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS hotel_products (
            id INTEGER PRIMARY KEY,
            legacy_product_id TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            category TEXT,
            item_type TEXT,
            default_location_id INTEGER REFERENCES locations(id),
            purchase_unit TEXT,
            usage_unit TEXT,
            minimum_stock REAL,
            homemade INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS supplier_products (
            id INTEGER PRIMARY KEY,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            supplier_product_code TEXT NOT NULL,
            supplier_product_name TEXT,
            pack_size TEXT,
            purchase_unit TEXT,
            latest_price REAL,
            average_price REAL,
            vat_rate REAL,
            latest_purchase_date TEXT,
            purchase_count INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            UNIQUE (supplier_id, supplier_product_code)
        );

        CREATE TABLE IF NOT EXISTS product_supplier_links (
            id INTEGER PRIMARY KEY,
            hotel_product_id INTEGER NOT NULL REFERENCES hotel_products(id),
            supplier_product_id INTEGER NOT NULL REFERENCES supplier_products(id),
            preferred INTEGER NOT NULL DEFAULT 0,
            match_status TEXT,
            match_confidence REAL,
            conversion_factor REAL,
            conversion_status TEXT,
            notes TEXT,
            UNIQUE (hotel_product_id, supplier_product_id)
        );

        CREATE TABLE IF NOT EXISTS invoice_headers (
            id INTEGER PRIMARY KEY,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            invoice_number TEXT,
            invoice_date TEXT,
            document_type TEXT,
            invoice_total REAL,
            source_file TEXT,
            extraction_status TEXT,
            imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (supplier_id, invoice_number, source_file)
        );

        CREATE TABLE IF NOT EXISTS invoice_lines (
            id INTEGER PRIMARY KEY,
            invoice_header_id INTEGER REFERENCES invoice_headers(id),
            supplier_product_id INTEGER REFERENCES supplier_products(id),
            raw_supplier_product_code TEXT,
            raw_product_description TEXT,
            raw_pack_size TEXT,
            quantity REAL,
            unit_price REAL,
            vat_rate REAL,
            line_value REAL,
            matched_hotel_product_id INTEGER REFERENCES hotel_products(id),
            source_file TEXT
        );

        CREATE TABLE IF NOT EXISTS inventory_balances (
            id INTEGER PRIMARY KEY,
            hotel_product_id INTEGER NOT NULL REFERENCES hotel_products(id),
            location_id INTEGER REFERENCES locations(id),
            quantity_purchase_units REAL,
            quantity_usage_units REAL,
            opened INTEGER NOT NULL DEFAULT 0,
            raw_stock_text TEXT,
            last_counted_at TEXT,
            last_counted_by TEXT,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY,
            hotel_product_id INTEGER NOT NULL REFERENCES hotel_products(id),
            location_id INTEGER REFERENCES locations(id),
            transaction_type TEXT NOT NULL,
            quantity REAL,
            unit TEXT,
            reason TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS unit_conversions (
            id INTEGER PRIMARY KEY,
            hotel_product_id INTEGER REFERENCES hotel_products(id),
            supplier_product_id INTEGER REFERENCES supplier_products(id),
            from_unit TEXT,
            to_unit TEXT,
            factor REAL,
            confidence TEXT,
            status TEXT NOT NULL,
            source_note TEXT
        );

        CREATE TABLE IF NOT EXISTS match_review_queue (
            id INTEGER PRIMARY KEY,
            hotel_product_id INTEGER NOT NULL REFERENCES hotel_products(id),
            proposed_supplier_product_id INTEGER REFERENCES supplier_products(id),
            proposed_supplier_code TEXT,
            proposed_supplier_product_code TEXT,
            proposed_description TEXT,
            second_best_text TEXT,
            confidence REAL,
            status TEXT NOT NULL DEFAULT 'pending',
            match_status TEXT,
            reviewer_note TEXT
        );

        CREATE TABLE IF NOT EXISTS valuation_snapshots (
            id INTEGER PRIMARY KEY,
            hotel_product_id INTEGER REFERENCES hotel_products(id),
            location_id INTEGER REFERENCES locations(id),
            supplier_product_id INTEGER REFERENCES supplier_products(id),
            raw_stock_text TEXT,
            qty_purchase_units REAL,
            price_used REAL,
            price_source TEXT,
            estimated_value REAL,
            valuation_status TEXT NOT NULL,
            conversion_status TEXT,
            match_basis TEXT,
            snapshot_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS import_batches (
            id INTEGER PRIMARY KEY,
            source_workbook TEXT NOT NULL,
            source_sheet TEXT,
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            status TEXT NOT NULL,
            notes TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS supplier_product_search USING fts5(
            supplier_product_id UNINDEXED,
            supplier_code,
            supplier_name,
            supplier_product_code,
            supplier_product_name,
            pack_size,
            invoice_descriptions
        );

        CREATE INDEX IF NOT EXISTS idx_invoice_headers_supplier_invoice
            ON invoice_headers (supplier_id, invoice_number);
        CREATE INDEX IF NOT EXISTS idx_invoice_lines_supplier_product
            ON invoice_lines (supplier_product_id);
        CREATE INDEX IF NOT EXISTS idx_hotel_products_name
            ON hotel_products (display_name);
        """
    )
    conn.commit()
