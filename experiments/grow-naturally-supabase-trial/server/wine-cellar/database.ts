import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { LocalStorageWineCellarRepository, emptyWineCellarSnapshot } from "../../src/modules/wine-cellar/services/localStorageRepository";
import type { WineCellarRepository } from "../../src/modules/wine-cellar/services/repository";
import type {
  CreatePositionInput, CreateRackInput, RecordAdjustmentInput, RecordCountInput, RecordReceiptInput,
  UpdatePositionInput, UpdateRackInput, WineCellarActor, WineCellarScope, WineCellarSnapshot
} from "../../src/modules/wine-cellar/types";
import { initializeWineCellarSchema } from "./schema";

class SnapshotStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

type Row = Record<string, unknown>;
const tableNames = [
  "wine_cellar_racks", "wine_cellar_positions", "wine_cellar_product_assignments", "wine_cellar_count_sessions",
  "wine_cellar_count_entries", "wine_cellar_receipts", "wine_cellar_stock_adjustments", "wine_cellar_audit_events"
] as const;

function boolean(value: unknown) { return value === 1; }
function text(value: unknown) { return value === null || value === undefined ? null : String(value); }
function number(value: unknown) { return Number(value); }

export function createWineCellarDatabase(path = process.env.GROW_NATURALLY_WINE_CELLAR_DB_PATH || "local-data/wine-cellar.sqlite") {
  if (path !== ":memory:" && !path.startsWith("file:")) mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  initializeWineCellarSchema(sqlite);

  function query(table: string, scope: WineCellarScope) {
    return sqlite.prepare(`SELECT * FROM ${table} WHERE hotel_id = ? AND area_id = ?`).all(scope.hotelId, scope.areaId) as Row[];
  }

  function getSnapshot(scope: WineCellarScope): WineCellarSnapshot {
    const snapshot = emptyWineCellarSnapshot();
    snapshot.racks = query("wine_cellar_racks", scope).map((row) => ({
      id: String(row.id), ...scope, name: String(row.name), displayOrder: number(row.display_order), active: boolean(row.active),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at)
    }));
    snapshot.positions = query("wine_cellar_positions", scope).map((row) => ({
      id: String(row.id), ...scope, rackId: String(row.rack_id), code: String(row.code), width: number(row.width), depth: number(row.depth),
      capacity: number(row.capacity), currentQuantity: number(row.current_quantity), stockUnit: String(row.stock_unit) as never,
      fillDirection: String(row.fill_direction) as never, lowStockMode: String(row.low_stock_mode) as never,
      lowStockThreshold: number(row.low_stock_threshold), active: boolean(row.active), createdAt: String(row.created_at), updatedAt: String(row.updated_at)
    }));
    snapshot.assignments = query("wine_cellar_product_assignments", scope).map((row) => ({
      id: String(row.id), ...scope, positionId: String(row.position_id), productId: text(row.product_id), productName: String(row.product_name),
      matchStatus: String(row.match_status) as never, supplierName: text(row.supplier_name), supplierProductCode: text(row.supplier_product_code),
      invoiceReference: text(row.invoice_reference), unitCost: row.unit_cost === null ? null : number(row.unit_cost), currency: String(row.currency),
      assignedAt: String(row.assigned_at), assignedById: String(row.assigned_by_id), assignedByName: String(row.assigned_by_name), active: boolean(row.active)
    }));
    snapshot.countSessions = query("wine_cellar_count_sessions", scope).map((row) => ({
      id: String(row.id), ...scope, status: "completed", notes: text(row.notes), startedAt: String(row.started_at), completedAt: String(row.completed_at),
      actorId: String(row.actor_id), actorName: String(row.actor_name)
    }));
    snapshot.countEntries = query("wine_cellar_count_entries", scope).map((row) => ({
      id: String(row.id), ...scope, sessionId: String(row.session_id), positionId: String(row.position_id), beforeQuantity: number(row.before_quantity),
      afterQuantity: number(row.after_quantity), capacity: number(row.capacity), emptySlotIds: JSON.parse(String(row.empty_slot_ids_json)) as string[],
      abnormalPattern: boolean(row.abnormal_pattern), actorId: String(row.actor_id), actorName: String(row.actor_name), createdAt: String(row.created_at)
    }));
    snapshot.receipts = query("wine_cellar_receipts", scope).map((row) => ({
      id: String(row.id), ...scope, positionId: String(row.position_id), quantity: number(row.quantity), beforeQuantity: number(row.before_quantity),
      afterQuantity: number(row.after_quantity), invoiceReference: text(row.invoice_reference), unitCost: row.unit_cost === null ? null : number(row.unit_cost),
      actorId: String(row.actor_id), actorName: String(row.actor_name), createdAt: String(row.created_at)
    }));
    snapshot.adjustments = query("wine_cellar_stock_adjustments", scope).map((row) => ({
      id: String(row.id), ...scope, positionId: String(row.position_id), delta: number(row.delta), reason: String(row.reason),
      beforeQuantity: number(row.before_quantity), afterQuantity: number(row.after_quantity), actorId: String(row.actor_id), actorName: String(row.actor_name), createdAt: String(row.created_at)
    }));
    snapshot.auditEvents = query("wine_cellar_audit_events", scope).map((row) => ({
      id: String(row.id), ...scope, type: String(row.type) as never, entityId: String(row.entity_id), changes: JSON.parse(String(row.changes_json)) as Record<string, unknown>,
      actorId: String(row.actor_id), actorName: String(row.actor_name), createdAt: String(row.created_at)
    }));
    return snapshot;
  }

  function saveSnapshot(snapshot: WineCellarSnapshot) {
    const insert = (sql: string, rows: unknown[][]) => { const statement = sqlite.prepare(sql); rows.forEach((row) => statement.run(...row)); };
    insert(`INSERT INTO wine_cellar_racks VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, display_order=excluded.display_order, active=excluded.active, updated_at=excluded.updated_at
      WHERE wine_cellar_racks.hotel_id=excluded.hotel_id AND wine_cellar_racks.area_id=excluded.area_id`, snapshot.racks.map((r) => [r.id, r.hotelId, r.areaId, r.name, r.displayOrder, +r.active, r.createdAt, r.updatedAt]));
    insert(`INSERT INTO wine_cellar_positions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET rack_id=excluded.rack_id, code=excluded.code, width=excluded.width, depth=excluded.depth,
      capacity=excluded.capacity, current_quantity=excluded.current_quantity, stock_unit=excluded.stock_unit,
      fill_direction=excluded.fill_direction, low_stock_mode=excluded.low_stock_mode, low_stock_threshold=excluded.low_stock_threshold,
      active=excluded.active, updated_at=excluded.updated_at
      WHERE wine_cellar_positions.hotel_id=excluded.hotel_id AND wine_cellar_positions.area_id=excluded.area_id`, snapshot.positions.map((p) => [p.id, p.rackId, p.hotelId, p.areaId, p.code, p.width, p.depth, p.capacity, p.currentQuantity, p.stockUnit, p.fillDirection, p.lowStockMode, p.lowStockThreshold, +p.active, p.createdAt, p.updatedAt]));
    insert(`INSERT INTO wine_cellar_product_assignments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET invoice_reference=excluded.invoice_reference, unit_cost=excluded.unit_cost, active=excluded.active
      WHERE wine_cellar_product_assignments.hotel_id=excluded.hotel_id AND wine_cellar_product_assignments.area_id=excluded.area_id`, snapshot.assignments.map((a) => [a.id, a.positionId, a.hotelId, a.areaId, a.productId, a.productName, a.matchStatus, a.supplierName, a.supplierProductCode, a.invoiceReference, a.unitCost, a.currency, a.assignedAt, a.assignedById, a.assignedByName, +a.active]));
    insert("INSERT OR IGNORE INTO wine_cellar_count_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", snapshot.countSessions.map((s) => [s.id, s.hotelId, s.areaId, s.status, s.notes, s.startedAt, s.completedAt, s.actorId, s.actorName]));
    insert("INSERT OR IGNORE INTO wine_cellar_count_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", snapshot.countEntries.map((e) => [e.id, e.sessionId, e.positionId, e.hotelId, e.areaId, e.beforeQuantity, e.afterQuantity, e.capacity, JSON.stringify(e.emptySlotIds), +e.abnormalPattern, e.actorId, e.actorName, e.createdAt]));
    insert("INSERT OR IGNORE INTO wine_cellar_receipts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", snapshot.receipts.map((r) => [r.id, r.positionId, r.hotelId, r.areaId, r.quantity, r.beforeQuantity, r.afterQuantity, r.invoiceReference, r.unitCost, r.actorId, r.actorName, r.createdAt]));
    insert("INSERT OR IGNORE INTO wine_cellar_stock_adjustments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", snapshot.adjustments.map((a) => [a.id, a.positionId, a.hotelId, a.areaId, a.delta, a.reason, a.beforeQuantity, a.afterQuantity, a.actorId, a.actorName, a.createdAt]));
    insert("INSERT OR IGNORE INTO wine_cellar_audit_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", snapshot.auditEvents.map((a) => [a.id, a.hotelId, a.areaId, a.type, a.entityId, JSON.stringify(a.changes), a.actorId, a.actorName, a.createdAt]));
  }

  function replaceSnapshot(scope: WineCellarScope, snapshot: WineCellarSnapshot) {
    const collections: Array<keyof WineCellarSnapshot> = [
      "racks", "positions", "assignments", "countSessions", "countEntries", "receipts", "adjustments", "auditEvents"
    ];
    if (collections.some((collection) => !Array.isArray(snapshot[collection]) || snapshot[collection].some((item) => item.hotelId !== scope.hotelId || item.areaId !== scope.areaId))) {
      throw new Error("酒水库数据范围无效。");
    }
    return sqlite.transaction(() => {
      [
        "wine_cellar_count_entries",
        "wine_cellar_count_sessions",
        "wine_cellar_receipts",
        "wine_cellar_stock_adjustments",
        "wine_cellar_product_assignments",
        "wine_cellar_positions",
        "wine_cellar_audit_events",
        "wine_cellar_racks"
      ].forEach((table) => sqlite.prepare(`DELETE FROM ${table} WHERE hotel_id = ? AND area_id = ?`).run(scope.hotelId, scope.areaId));
      saveSnapshot(snapshot);
      return getSnapshot(scope);
    })();
  }

  function mutate<T>(scope: WineCellarScope, operation: (repository: LocalStorageWineCellarRepository) => T) {
    return sqlite.transaction(() => {
      const storage = new SnapshotStorage();
      const key = `grow-naturally:wine-cellar:v1:${encodeURIComponent(scope.hotelId)}:${encodeURIComponent(scope.areaId)}`;
      storage.setItem(key, JSON.stringify({ version: 1, snapshot: getSnapshot(scope) }));
      const repository = new LocalStorageWineCellarRepository({ storage });
      const result = operation(repository);
      saveSnapshot(repository.getSnapshot(scope));
      return result;
    })();
  }

  const repository: WineCellarRepository & {
    initialize(): void; getTableNames(): string[]; foreignKeysEnabled(): boolean; close(): void;
    replaceSnapshot(scope: WineCellarScope, snapshot: WineCellarSnapshot): WineCellarSnapshot;
  } = {
    initialize: () => initializeWineCellarSchema(sqlite),
    getTableNames: () => (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'wine_cellar_%' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name),
    foreignKeysEnabled: () => sqlite.pragma("foreign_keys", { simple: true }) === 1,
    close: () => sqlite.close(),
    getSnapshot,
    replaceSnapshot,
    createRack: (scope, input: CreateRackInput, actor) => mutate(scope, (repo) => repo.createRack(scope, input, actor)),
    updateRack: (scope, id, input: UpdateRackInput, actor) => mutate(scope, (repo) => repo.updateRack(scope, id, input, actor)),
    reorderRacks: (scope, ids, actor) => mutate(scope, (repo) => repo.reorderRacks(scope, ids, actor)),
    createPosition: (scope, input: CreatePositionInput, actor) => mutate(scope, (repo) => repo.createPosition(scope, input, actor)),
    updatePosition: (scope, id, input: UpdatePositionInput, actor) => mutate(scope, (repo) => repo.updatePosition(scope, id, input, actor)),
    archiveRack: (scope, id, actor) => mutate(scope, (repo) => repo.archiveRack(scope, id, actor)),
    archivePosition: (scope, id, actor) => mutate(scope, (repo) => repo.archivePosition(scope, id, actor)),
    recordCount: (scope, input: RecordCountInput, actor) => mutate(scope, (repo) => repo.recordCount(scope, input, actor)),
    recordReceipt: (scope, input: RecordReceiptInput, actor) => mutate(scope, (repo) => repo.recordReceipt(scope, input, actor)),
    recordAdjustment: (scope, input: RecordAdjustmentInput, actor) => mutate(scope, (repo) => repo.recordAdjustment(scope, input, actor))
  };
  void tableNames;
  return repository;
}
