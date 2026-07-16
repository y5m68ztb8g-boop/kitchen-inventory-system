import { describe, expect, it } from "vitest";

import { calculateCapacity, calculateInventorySummary, isLowStock } from "../utils/inventory";
import { getOrderedSlots, hasAbnormalEmptyPattern } from "../utils/slots";

describe("wine cellar inventory rules", () => {
  it("calculates capacity and inclusive low-stock thresholds", () => {
    expect(calculateCapacity(6, 4)).toBe(24);
    expect(() => calculateCapacity(0, 4)).toThrow();
    expect(() => calculateCapacity(2.5, 4)).toThrow();
    expect(
      isLowStock({ capacity: 24, currentQuantity: 6, lowStockMode: "percentage", lowStockThreshold: 25 })
    ).toBe(true);
    expect(isLowStock({ capacity: 4, currentQuantity: 1, lowStockMode: "absolute", lowStockThreshold: 1 })).toBe(
      true
    );
  });

  it("orders every shelf direction deterministically and detects skipped empty slots", () => {
    expect(getOrderedSlots(3, 2, "front-to-back").map(({ id }) => id)).toEqual([
      "0:0", "0:1", "0:2", "1:0", "1:1", "1:2"
    ]);
    expect(getOrderedSlots(3, 2, "back-to-front").map(({ id }) => id)).toEqual([
      "1:0", "1:1", "1:2", "0:0", "0:1", "0:2"
    ]);
    expect(getOrderedSlots(3, 2, "left-to-right").map(({ id }) => id)).toEqual([
      "0:0", "1:0", "0:1", "1:1", "0:2", "1:2"
    ]);
    expect(getOrderedSlots(3, 2, "right-to-left").map(({ id }) => id)).toEqual([
      "0:2", "1:2", "0:1", "1:1", "0:0", "1:0"
    ]);
    expect(hasAbnormalEmptyPattern(getOrderedSlots(3, 2, "left-to-right"), ["0:0", "0:2"])).toBe(true);
    expect(hasAbnormalEmptyPattern(getOrderedSlots(3, 2, "left-to-right"), ["0:0", "1:0"])).toBe(false);
  });

  it("summarises active stock, values only matched products, and handles zero capacity", () => {
    const summary = calculateInventorySummary({
      racks: [],
      positions: [
        { id: "p1", active: true, capacity: 8, currentQuantity: 2, lowStockMode: "percentage", lowStockThreshold: 25 },
        { id: "p2", active: true, capacity: 0, currentQuantity: 0, lowStockMode: "percentage", lowStockThreshold: 25 },
        { id: "p3", active: false, capacity: 20, currentQuantity: 20, lowStockMode: "percentage", lowStockThreshold: 25 }
      ],
      assignments: [
        { positionId: "p1", active: true, matchStatus: "matched", unitCost: 12.5 },
        { positionId: "p2", active: true, matchStatus: "unmatched", unitCost: 99 }
      ],
      countSessions: [], countEntries: [], receipts: [], adjustments: [], auditEvents: []
    } as never);

    expect(summary).toMatchObject({
      totalQuantity: 2,
      totalCapacity: 8,
      inventoryPercentage: 25,
      lowStockPositionCount: 1,
      unmatchedProductCount: 1,
      totalValue: 25
    });
  });
});
