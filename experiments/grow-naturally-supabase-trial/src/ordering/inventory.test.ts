// @vitest-environment node

import { describe, expect, it } from "vitest";

import { calculateInventoryUnits } from "../inventoryQuantity";
import { buildOrderingInventorySnapshot, inventorySnapshotKey } from "../../server/ordering/inventory";

const baseInventoryDb = [
  {
    supplierProductId: "BRK-100243",
    packSize: "8x6",
    warehouse: "freezer",
    locationCode: "A1",
    fullPackageCount: 1,
    loosePackageCount: 4
  },
  {
    supplierProductId: "BRK-100243",
    packSize: "8x6",
    warehouse: "dry-store",
    locationCode: "C0",
    fullPackageCount: 1,
    loosePackageCount: 0
  }
] as const;

describe("ordering inventory snapshots", () => {
  it("converts full and loose packages into equivalent supplier packs", () => {
    const snapshot = buildOrderingInventorySnapshot(baseInventoryDb as unknown as Record<string, unknown>[], []);

    expect(snapshot.get("BRK-100243")?.totalEquivalentQuantity).toBe(1.5);
  });

  it("keeps every location for one matched supplier product", () => {
    const snapshot = buildOrderingInventorySnapshot(baseInventoryDb as unknown as Record<string, unknown>[], []);
    expect(snapshot.get("BRK-100243")?.locations).toEqual([
      expect.objectContaining({ warehouse: "freezer", locationCode: "A1" }),
      expect.objectContaining({ warehouse: "dry-store", locationCode: "C0" })
    ]);
  });

  it("produces deterministic snapshot keys for downstream sync and routing", () => {
    expect(
      inventorySnapshotKey({
        supplierProductId: "BRK-100243",
        totalEquivalentQuantity: 1.5,
        locations: [
          { warehouse: "freezer", warehouseLabel: "冷冻库", locationCode: "A1", displayQuantity: "1.5", equivalentQuantity: 1.5 }
        ]
      })
    ).toMatch(/^[0-9a-f]{64}$/i);
  });

  it("parses full and loose package counts into equivalent supplier units", () => {
    expect(
      calculateInventoryUnits({
        quantity: 1,
        quantityText: "1 Case + 4 Packs",
        fullPackageCount: 1,
        loosePackageCount: 4,
        supplierProduct: {
          id: "BRK-100243",
          packSize: "8x6",
          supplierCode: "BRK",
          supplierName: "Brakes",
          supplierProductCode: "100243",
          productName: "Chunky Chips",
          latestPrice: 10,
          averagePrice: 10,
          lowestPrice: 10,
          highestPrice: 10,
          latestPurchaseDate: "2026-07-11",
          purchaseCount: 0,
          vatRate: 0
        }
      } as Record<string, unknown>)
    ).toBe(1.5);
  });
});
