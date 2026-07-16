import { beforeEach, describe, expect, it } from "vitest";

import { LocalStorageWineCellarRepository } from "../services/localStorageRepository";
import { WineCellarPersistenceError } from "../types/errors";
import { calculateInventorySummary } from "../utils/inventory";

const actor = { id: "u1", name: "Alex" };
const scope = { hotelId: "h1", areaId: "a1" };

function seedPosition(repository: LocalStorageWineCellarRepository) {
  const rack = repository.createRack(scope, { name: "A架" }, actor);
  return repository.createPosition(scope, {
    rackId: rack.id,
    code: "A1",
    width: 3,
    depth: 2,
    stockUnit: "bottle",
    fillDirection: "left-to-right",
    lowStockMode: "percentage",
    lowStockThreshold: 25,
    assignment: { productId: null, productName: "House Red", matchStatus: "unmatched", unitCost: null }
  }, actor);
}

function seedMatchedPosition(repository: LocalStorageWineCellarRepository) {
  const rack = repository.createRack(scope, { name: "B架" }, actor);
  return repository.createPosition(scope, {
    rackId: rack.id,
    code: "B1",
    width: 3,
    depth: 2,
    stockUnit: "bottle",
    fillDirection: "front-to-back",
    lowStockMode: "percentage",
    lowStockThreshold: 25,
    assignment: {
      productId: "wine-1",
      productName: "Invoice Red",
      matchStatus: "matched",
      invoiceReference: "INV-100",
      unitCost: 10
    }
  }, actor);
}

const storageKey = "grow-naturally:wine-cellar:v1:h1:a1";

describe("LocalStorageWineCellarRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists a scoped count, receipt, adjustment, actor and audit history", () => {
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    const position = seedPosition(repository);

    const count = repository.recordCount(scope, { positionId: position.id, emptySlotIds: ["0:0", "1:0"] }, actor);
    expect(count).toMatchObject({ beforeQuantity: 0, afterQuantity: 4, actorId: "u1", actorName: "Alex" });
    expect(Number.isNaN(Date.parse(count.createdAt))).toBe(false);
    expect(repository.recordReceipt(scope, { positionId: position.id, quantity: 2 }, actor)).toMatchObject({
      beforeQuantity: 4, afterQuantity: 6
    });
    expect(() => repository.recordReceipt(scope, { positionId: position.id, quantity: 1 }, actor)).toThrow();
    expect(() => repository.recordAdjustment(scope, { positionId: position.id, delta: -1, reason: " " }, actor)).toThrow();
    expect(repository.recordAdjustment(scope, { positionId: position.id, delta: -2, reason: "breakage" }, actor)).toMatchObject({
      beforeQuantity: 6, afterQuantity: 4, reason: "breakage"
    });

    const restored = new LocalStorageWineCellarRepository({ storage: window.localStorage }).getSnapshot(scope);
    expect(restored.positions.find(({ id }) => id === position.id)?.currentQuantity).toBe(4);
    expect(restored.countEntries).toHaveLength(1);
    expect(restored.receipts).toHaveLength(1);
    expect(restored.adjustments).toHaveLength(1);
    expect(restored.auditEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("isolates hotel and area keys and rejects cross-area entity ids", () => {
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    const position = seedPosition(repository);
    const otherScope = { hotelId: "h1", areaId: "a2" };

    expect(repository.getSnapshot(otherScope).positions).toEqual([]);
    expect(() => repository.recordCount(otherScope, { positionId: position.id, emptySlotIds: [] }, actor)).toThrow();
  });

  it("keeps matched cost and invoice when a receipt leaves optional fields blank", () => {
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    const position = seedMatchedPosition(repository);

    repository.recordReceipt(scope, {
      positionId: position.id,
      quantity: 1,
      invoiceReference: "",
      unitCost: null
    }, actor);

    expect(repository.getSnapshot(scope).assignments.find((item) => item.active)).toMatchObject({
      invoiceReference: "INV-100",
      unitCost: 10
    });
  });

  it("throws a persistence error for malformed stored JSON", () => {
    window.localStorage.setItem(storageKey, "{not-json");
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });

    expect(() => repository.getSnapshot(scope)).toThrow(WineCellarPersistenceError);
  });

  it("throws a persistence error when a stored entity belongs to another scope", () => {
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    seedPosition(repository);
    const payload = JSON.parse(window.localStorage.getItem(storageKey) as string);
    payload.snapshot.racks[0].areaId = "a2";
    window.localStorage.setItem(storageKey, JSON.stringify(payload));

    expect(() => repository.getSnapshot(scope)).toThrow(WineCellarPersistenceError);
  });

  it("accepts only GBP matched assignments and excludes other currencies from valuation", () => {
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    const rack = repository.createRack(scope, { name: "C架" }, actor);

    expect.soft(() => repository.createPosition(scope, {
      rackId: rack.id, code: "C1", width: 2, depth: 2, stockUnit: "bottle",
      fillDirection: "front-to-back", lowStockMode: "percentage", lowStockThreshold: 25,
      assignment: {
        productId: "wine-usd", productName: "Dollar Wine", matchStatus: "matched",
        unitCost: 10, currency: "USD"
      }
    }, actor)).toThrow();

    expect.soft(calculateInventorySummary({
      racks: [],
      positions: [{ id: "p1", active: true, capacity: 4, currentQuantity: 2 }],
      assignments: [{
        positionId: "p1", active: true, matchStatus: "matched", unitCost: 10, currency: "USD"
      }],
      countSessions: [], countEntries: [], receipts: [], adjustments: [], auditEvents: []
    } as never).totalValue).toBe(0);
  });

  it("reorders racks atomically and rejects invalid or cross-area ids", () => {
    const repository = new LocalStorageWineCellarRepository({ storage: window.localStorage });
    const first = repository.createRack(scope, { name: "A架" }, actor);
    const second = repository.createRack(scope, { name: "B架" }, actor);

    repository.reorderRacks(scope, [second.id, first.id], actor);
    expect(repository.getSnapshot(scope).racks.map(({ id, displayOrder }) => ({ id, displayOrder }))).toEqual([
      { id: first.id, displayOrder: 1 },
      { id: second.id, displayOrder: 0 }
    ]);
    const reordered = repository.getSnapshot(scope);

    expect(() => repository.reorderRacks(scope, [second.id, "missing"], actor)).toThrow();
    expect(repository.getSnapshot(scope)).toEqual(reordered);

    const otherScope = { hotelId: "h1", areaId: "a2" };
    const foreign = repository.createRack(otherScope, { name: "C架" }, actor);
    expect(() => repository.reorderRacks(scope, [second.id, foreign.id], actor)).toThrow();
    expect(repository.getSnapshot(scope)).toEqual(reordered);
  });
});
