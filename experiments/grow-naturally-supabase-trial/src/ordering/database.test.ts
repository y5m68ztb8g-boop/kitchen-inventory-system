// @vitest-environment node

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  addReadyIntakeToBatch,
  createPurchasingDatabase,
  getBatchDetail,
  getOrCreateDraftBatch,
  markSupplierOrdered,
  saveBatchPo,
  tableNames
} from "../../server/ordering/database";

type IntakeStatus = "Draft" | "Pending" | "ReadyForPurchase" | "AddedToOrder" | "RecognitionFailed";

type IntakeRow = {
  id: string;
  status: IntakeStatus;
};

const openDatabases: Database.Database[] = [];

afterEach(() => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
});

function readIntakeStatus(database: Database.Database, intakeId: string): IntakeStatus {
  return database.prepare("SELECT status FROM purchase_intakes WHERE id = ?").pluck().get(intakeId) as IntakeStatus;
}

function setIntakeStatus(database: Database.Database, intakeId: string, status: IntakeStatus): void {
  database.prepare("UPDATE purchase_intakes SET status = ? WHERE id = ?").run(status, intakeId);
}

function inventoryFixtureHash(database: Database.Database): string {
  return JSON.stringify(
    database
      .prepare(
        `SELECT item_id AS itemId, batch_id AS batchId, snapshot_key AS snapshotKey,
                equivalent_quantity AS equivalentQuantity, locations_json AS locationsJson,
                decision, confirmed_at AS confirmedAt
           FROM purchase_inventory_checks
          ORDER BY item_id`
      )
      .all()
  );
}

function databaseWithPreOrderingIntakeSchema() {
  const database = new Database(":memory:");
  openDatabases.push(database);

  database.exec(`
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

    CREATE TABLE IF NOT EXISTS purchase_match_feedback_item_state (
      intake_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      normalised_name TEXT NOT NULL,
      supplier_product_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (intake_id, client_id),
      FOREIGN KEY (intake_id) REFERENCES purchase_intakes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchase_match_feedback (
      normalised_name TEXT NOT NULL,
      supplier_product_id TEXT NOT NULL,
      confirmation_count INTEGER NOT NULL CHECK (confirmation_count > 0),
      last_confirmed_at TEXT NOT NULL,
      PRIMARY KEY (normalised_name, supplier_product_id)
    );
  `);

  database
    .prepare(`
      INSERT INTO purchase_intakes (
        id, status, source_type, original_filename, original_mime_type,
        stored_mime_type, original_size_bytes, stored_size_bytes, source_blob,
        ai_model, unreadable_text_json, general_notes, created_at, updated_at,
        handed_off_at
      )
      VALUES
        ('intake-1', 'ReadyForPurchase', 'pdf', 'test.pdf', 'application/pdf',
         'application/pdf', 3, 3, X'010203', null,
         '["note"]', 'seed notes',
         '2026-07-11T10:00:00.000Z', '2026-07-11T10:00:00.000Z', '2026-07-11T10:05:00.000Z')
    `)
    .run();

  database
    .prepare(`
      INSERT INTO purchase_intake_items (
        id, intake_id, row_order, department, raw_text, product_name, quantity,
        unit, notes, confidence, manual_reviewed, supplier_product_id,
        supplier_name, supplier_code, supplier_product_code, supplier_product_name,
        supplier_pack_size, supplier_last_price, supplier_purchase_count,
        supplier_last_purchase_date, current_inventory_quantity, created_at, updated_at
      )
      VALUES (
        'intake-1:item-1', 'intake-1', 0, 'Kitchen', '4 rolls', 'Bread rolls', 4,
        'tray', null, 0.95, 0, 'BRK-1000', 'Brakes', 'BRK',
        'BRK-1000', 'Bread Roll', '10', 12.5, 5, '2026-06-30', 12, '2026-07-11T10:00:00.000Z',
        '2026-07-11T10:00:00.000Z'
      )
    `)
    .run();

  database
    .prepare(`
      INSERT INTO purchase_match_feedback_item_state (
        intake_id, client_id, normalised_name, supplier_product_id, updated_at
      )
      VALUES ('intake-1', 'item-1', 'bread rolls', 'BRK-1000', '2026-07-11T10:00:00.000Z')
    `)
    .run();

  return database;
}

describe("ordering purchasing database", () => {
  it("creates ordering tables idempotently with foreign keys enabled", () => {
    const names = tableNames(createPurchasingDatabase(":memory:"));
    expect(names).toEqual(
      expect.arrayContaining([
        "purchase_batches",
        "purchase_batch_items",
        "purchase_batch_suppliers",
        "purchase_inventory_checks",
        "purchase_ordering_profile"
      ])
    );
  });

  it("migrates an existing intake database to AddedToOrder without losing rows", () => {
    const database = databaseWithPreOrderingIntakeSchema();
    const migrated = createPurchasingDatabase(database);

    expect(readIntakeStatus(migrated, "intake-1")).toBe("ReadyForPurchase");
    expect(
      migrated
        .prepare(`
          SELECT id, intake_id AS intakeId, product_name AS productName,
                 quantity, supplier_product_id AS supplierProductId
            FROM purchase_intake_items
           WHERE id = ?
        `)
        .get("intake-1:item-1")
    ).toMatchObject({
      id: "intake-1:item-1",
      intakeId: "intake-1",
      productName: "Bread rolls",
      quantity: 4,
      supplierProductId: "BRK-1000"
    });
    expect(
      migrated
        .prepare(`
          SELECT intake_id AS intakeId, client_id AS clientId,
                 normalised_name AS normalisedName,
                 supplier_product_id AS supplierProductId
            FROM purchase_match_feedback_item_state
           WHERE intake_id = ? AND client_id = ?
        `)
        .get("intake-1", "item-1")
    ).toMatchObject({
      intakeId: "intake-1",
      clientId: "item-1",
      normalisedName: "bread rolls",
      supplierProductId: "BRK-1000"
    });
    expect(migrated.pragma("foreign_key_check")).toEqual([]);
    expect(() => setIntakeStatus(migrated, "intake-1", "AddedToOrder")).not.toThrow();
  });

  it("moves one ready intake into the current draft batch exactly once", () => {
    const database = databaseWithPreOrderingIntakeSchema();
    const migrated = createPurchasingDatabase(database);
    const batch = getOrCreateDraftBatch(migrated, "2026-07-11T10:00:00.000Z");

    addReadyIntakeToBatch(migrated, {
      batchId: batch.id,
      intakeId: "intake-1",
      transferredAt: "2026-07-11T10:01:00.000Z"
    });

    expect(getBatchDetail(migrated, batch.id).items).toHaveLength(1);
    expect(readIntakeStatus(migrated, "intake-1")).toBe("AddedToOrder");
    let duplicateError: unknown;
    try {
      addReadyIntakeToBatch(migrated, {
        batchId: batch.id,
        intakeId: "intake-1"
      });
    } catch (error) {
      duplicateError = error;
    }

    expect(duplicateError).toMatchObject({ code: "INTAKE_ALREADY_ADDED" });
  });

  it("shares one PO while supplier groups keep independent status", () => {
    const database = createPurchasingDatabase(":memory:");
    const batch = getOrCreateDraftBatch(database, "2026-07-11T10:00:00.000Z");

    database.exec(`
      INSERT INTO purchase_batch_items (
        id,
        batch_id,
        row_order,
        product_name,
        supplier_group,
        supplier_product_id,
        supplier_product_code,
        supplier_name,
        pack_size,
        order_quantity,
        order_unit,
        brakes_status,
        created_at,
        updated_at
      )
      VALUES (
        '${batch.id}:item-1',
        '${batch.id}',
        0,
        'Bread rolls',
        'CMP',
        'CMP-100',
        'CMP-100',
        'Campbells',
        '12',
        6,
        'tray',
        'Pending',
        '2026-07-11T10:00:00.000Z',
        '2026-07-11T10:00:00.000Z'
      )
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO purchase_batch_suppliers (
        batch_id,
        supplier_code,
        status,
        updated_at,
        email_to,
        email_subject,
        email_body,
        prepared_at,
        ordered_at
      )
      VALUES
        ('${batch.id}', 'CMP', 'Pending', '2026-07-11T10:00:00.000Z', 'a@a.io', 'PO', 'to=campbells', NULL, NULL),
        ('${batch.id}', 'BRK', 'Pending', '2026-07-11T10:00:00.000Z', 'b@b.io', 'PO', 'to=brakes', NULL, NULL)
      ON CONFLICT (batch_id, supplier_code) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at,
        email_to = excluded.email_to,
        email_subject = excluded.email_subject,
        email_body = excluded.email_body,
        prepared_at = excluded.prepared_at,
        ordered_at = excluded.ordered_at;
    `);

    saveBatchPo(database, batch.id, "PO-7788");
    markSupplierOrdered(database, {
      batchId: batch.id,
      supplierCode: "CMP",
      orderedAt: "2026-07-11T11:00:00.000Z"
    });

    expect(getBatchDetail(database, batch.id)).toMatchObject({
      poNumber: "PO-7788",
      status: "Ordered"
    });
  });

  it("does not mutate inventory tables when a supplier is marked ordered", () => {
    const database = createPurchasingDatabase(":memory:");
    database.exec(`
      INSERT INTO purchase_batches (id, po_number, status, created_at, updated_at)
      VALUES ('batch-1', 'PO-7788', 'Draft', '2026-07-11T08:00:00.000Z', '2026-07-11T08:00:00.000Z');

      INSERT INTO purchase_batch_suppliers (
        batch_id, supplier_code, status, email_to, email_subject, email_body, prepared_at, ordered_at, updated_at
      ) VALUES (
        'batch-1', 'CMP', 'Pending', NULL, NULL, NULL, NULL, NULL, '2026-07-11T08:00:00.000Z'
      );

      INSERT INTO purchase_batch_items (
        id, batch_id, row_order, product_name, supplier_group, supplier_product_id,
        supplier_product_code, supplier_name, pack_size, order_quantity, order_unit,
        last_price, purchase_count, latest_purchase_date, brakes_status,
        brakes_message, created_at, updated_at
      )
      VALUES (
        'batch-1:item-1', 'batch-1', 0, 'Bread rolls', 'BRK', 'BRK-1000',
        'BRK-1000', 'Brakes', '10', 3, 'tray', NULL, 2, '2026-07-10', 'Pending', NULL,
        '2026-07-11T08:00:00.000Z', '2026-07-11T08:00:00.000Z'
      );

      INSERT INTO purchase_inventory_checks (
        batch_id, item_id, snapshot_key, equivalent_quantity, locations_json,
        decision, confirmed_at
      )
      VALUES (
        'batch-1', 'batch-1:item-1', 'inv:1', 4.0,
        '{"rack":"A1","qty":4}', 'NeedsRecheck', '2026-07-11T08:05:00.000Z'
      );
    `);

    const before = inventoryFixtureHash(database);
    markSupplierOrdered(database, { batchId: "batch-1", supplierCode: "BRK" });
    expect(inventoryFixtureHash(database)).toBe(before);
  });
});
