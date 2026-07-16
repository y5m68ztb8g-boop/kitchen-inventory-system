// @vitest-environment node

import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWineCellarDatabase } from "../../../../server/wine-cellar/database";

const actor = { id: "u1", name: "Alex" };
const scope = { hotelId: "h1", areaId: "a1" };
const databases: Array<{ close(): void }> = [];
const temporaryDirectories: string[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { force: true, recursive: true }));
});

function open() {
  const database = createWineCellarDatabase(":memory:");
  databases.push(database);
  return database;
}

function seed(database: ReturnType<typeof createWineCellarDatabase>) {
  const rack = database.createRack(scope, { name: "A架" }, actor);
  return database.createPosition(scope, {
    rackId: rack.id, code: "A1", width: 3, depth: 2, stockUnit: "bottle",
    fillDirection: "left-to-right", lowStockMode: "percentage", lowStockThreshold: 25,
    assignment: { productId: "wine-1", productName: "House Red", matchStatus: "matched", unitCost: 10 }
  }, actor);
}

describe("wine cellar SQLite repository", () => {
  it("initialises idempotently with foreign keys and all eight tables", () => {
    const database = open();
    database.initialize();
    database.initialize();
    expect(database.getTableNames()).toEqual(expect.arrayContaining([
      "wine_cellar_racks", "wine_cellar_positions", "wine_cellar_product_assignments",
      "wine_cellar_count_sessions", "wine_cellar_count_entries", "wine_cellar_receipts",
      "wine_cellar_stock_adjustments", "wine_cellar_audit_events"
    ]));
    expect(database.foreignKeysEnabled()).toBe(true);
  });

  it("commits inventory history atomically and rolls back a rejected mutation", () => {
    const database = open();
    const position = seed(database);
    database.recordCount(scope, { positionId: position.id, emptySlotIds: ["0:0", "1:0"] }, actor);
    database.recordReceipt(scope, { positionId: position.id, quantity: 2 }, actor);
    const before = database.getSnapshot(scope);

    expect(() => database.recordAdjustment(scope, { positionId: position.id, delta: -1, reason: "" }, actor)).toThrow();
    expect(database.getSnapshot(scope)).toEqual(before);
    expect(before.positions[0].currentQuantity).toBe(6);
    expect(before.countEntries).toHaveLength(1);
    expect(before.receipts).toHaveLength(1);
  });

  it("isolates areas and rejects cross-area references", () => {
    const database = open();
    const position = seed(database);
    const otherScope = { hotelId: "h1", areaId: "a2" };
    expect(database.getSnapshot(otherScope).positions).toEqual([]);
    expect(() => database.recordCount(otherScope, { positionId: position.id, emptySlotIds: [] }, actor)).toThrow();
  });

  it("keeps matched cost and invoice when a receipt leaves optional fields blank", () => {
    const database = open();
    const position = seed(database);
    database.updatePosition(scope, position.id, {
      assignment: {
        productId: "wine-1", productName: "House Red", matchStatus: "matched",
        invoiceReference: "INV-100", unitCost: 10
      }
    }, actor);

    database.recordReceipt(scope, {
      positionId: position.id,
      quantity: 1,
      invoiceReference: "",
      unitCost: null
    }, actor);

    expect(database.getSnapshot(scope).assignments.find((item) => item.active)).toMatchObject({
      invoiceReference: "INV-100",
      unitCost: 10
    });
  });

  it("creates a nested database directory and rejects a cross-scope foreign-key row", () => {
    const root = mkdtempSync(join(tmpdir(), "wine-cellar-"));
    temporaryDirectories.push(root);
    const path = join(root, "nested", "data", "wine-cellar.sqlite");
    const database = createWineCellarDatabase(path);
    databases.push(database);
    seed(database);
    expect(existsSync(path)).toBe(true);

    const direct = new Database(path);
    databases.push(direct);
    direct.pragma("foreign_keys = ON");
    expect(() => direct.prepare(`
      INSERT INTO wine_cellar_positions (
        id, rack_id, hotel_id, area_id, code, width, depth, capacity,
        current_quantity, stock_unit, fill_direction, low_stock_mode,
        low_stock_threshold, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "cross-scope-position", database.getSnapshot(scope).racks[0].id, "h1", "a2", "X1",
      1, 1, 1, 0, "bottle", "front-to-back", "percentage", 25, 1,
      "2026-07-11T00:00:00.000Z", "2026-07-11T00:00:00.000Z"
    )).toThrow(/foreign key/i);
  });

  it("reorders racks atomically and rejects invalid or cross-area ids", () => {
    const database = open();
    const first = database.createRack(scope, { name: "A架" }, actor);
    const second = database.createRack(scope, { name: "B架" }, actor);

    database.reorderRacks(scope, [second.id, first.id], actor);
    expect(database.getSnapshot(scope).racks.map(({ id, displayOrder }) => ({ id, displayOrder }))).toEqual([
      { id: first.id, displayOrder: 1 },
      { id: second.id, displayOrder: 0 }
    ]);
    const reordered = database.getSnapshot(scope);

    expect(() => database.reorderRacks(scope, [second.id, "missing"], actor)).toThrow();
    expect(database.getSnapshot(scope)).toEqual(reordered);

    const otherScope = { hotelId: "h1", areaId: "a2" };
    const foreign = database.createRack(otherScope, { name: "C架" }, actor);
    expect(() => database.reorderRacks(scope, [second.id, foreign.id], actor)).toThrow();
    expect(database.getSnapshot(scope)).toEqual(reordered);
  });

  it("records successful adjustments at both capacity boundaries", () => {
    const database = open();
    const position = seed(database);

    expect(database.recordAdjustment(scope, { positionId: position.id, delta: 6, reason: "initial stock" }, actor)).toMatchObject({
      beforeQuantity: 0, afterQuantity: 6
    });
    expect(() => database.recordAdjustment(scope, { positionId: position.id, delta: 1, reason: "overflow" }, actor)).toThrow();
    expect(database.recordAdjustment(scope, { positionId: position.id, delta: -6, reason: "empty shelf" }, actor)).toMatchObject({
      beforeQuantity: 6, afterQuantity: 0
    });
    expect(() => database.recordAdjustment(scope, { positionId: position.id, delta: -1, reason: "underflow" }, actor)).toThrow();
    expect(database.getSnapshot(scope).adjustments).toHaveLength(2);
  });
});
