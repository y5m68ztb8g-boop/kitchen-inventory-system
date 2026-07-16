import type { OrderingInventorySnapshot } from "../../../server/ordering/inventory";

export const task4Now = "2026-07-11T10:00:00.000Z";
export const task4PoNumber = "PO-7788";

export const task4OrderingProfile = {
  purchaserName: "Jordan Liu",
  hotelName: "Grow Naturally Hotel",
  campbellsEmail: "purchaser@campbells.example",
  markMurphyEmail: "purchaser@markmurphy.example"
};

export type Task4BatchFixtureItem = {
  id: string;
  productName: string;
  supplierGroup: "CMP" | "MM" | "BRK";
  supplierProductId: string;
  supplierProductCode: string;
  supplierName: string;
  packSize: string;
  orderQuantity: number;
  orderUnit: string;
};

export const task4CmpReviewItem: Task4BatchFixtureItem = {
  id: "batch-item-cmp-review",
  productName: "Chicken Breast",
  supplierGroup: "CMP",
  supplierProductId: "CMP-200101",
  supplierProductCode: "200101",
  supplierName: "Campbells Prime Meat Ltd",
  packSize: "12x1kg",
  orderQuantity: 2,
  orderUnit: "12x1kg"
};

export const task4CmpSingleItem: Task4BatchFixtureItem = {
  id: "batch-item-cmp-single",
  productName: "Beef Tenderloin",
  supplierGroup: "CMP",
  supplierProductId: "CMP-200102",
  supplierProductCode: "200102",
  supplierName: "Campbells Prime Meat Ltd",
  packSize: "10x1kg",
  orderQuantity: 1,
  orderUnit: "10x1kg"
};

export const task4MmReviewItem: Task4BatchFixtureItem = {
  id: "batch-item-mm-review",
  productName: "Orange Juice",
  supplierGroup: "MM",
  supplierProductId: "MM-300500",
  supplierProductCode: "300500",
  supplierName: "Mark Murphy (Dole Ltd)",
  packSize: "6x1L",
  orderQuantity: 5,
  orderUnit: "6x1L"
};

export const task4BrkReviewItem: Task4BatchFixtureItem = {
  id: "batch-item-brk-review",
  productName: "Bread Roll",
  supplierGroup: "BRK",
  supplierProductId: "BRK-100243",
  supplierProductCode: "100243",
  supplierName: "Brakes",
  packSize: "8x6",
  orderQuantity: 4,
  orderUnit: "8x6"
};

export const task4InventorySnapshots = new Map<string, OrderingInventorySnapshot>([
  [
    "CMP-200101",
    {
      supplierProductId: "CMP-200101",
      totalEquivalentQuantity: 2.5,
      locations: [
        {
          warehouse: "freezer",
          warehouseLabel: "冷冻库",
          locationCode: "A1",
          displayQuantity: "1.5",
          equivalentQuantity: 1.5
        },
        {
          warehouse: "dry-store",
          warehouseLabel: "干货库",
          locationCode: "C0",
          displayQuantity: "1",
          equivalentQuantity: 1
        }
      ]
    }
  ],
  [
    "CMP-200102",
    {
      supplierProductId: "CMP-200102",
      totalEquivalentQuantity: 1,
      locations: [
        {
          warehouse: "freezer",
          warehouseLabel: "冷冻库",
          locationCode: "A2",
          displayQuantity: "1",
          equivalentQuantity: 1
        }
      ]
    }
  ],
  [
    "MM-300500",
    {
      supplierProductId: "MM-300500",
      totalEquivalentQuantity: 2.4,
      locations: [
        {
          warehouse: "dry-store",
          warehouseLabel: "干货库",
          locationCode: "D1",
          displayQuantity: "2.4",
          equivalentQuantity: 2.4
        }
      ]
    }
  ],
  [
    "BRK-100243",
    {
      supplierProductId: "BRK-100243",
      totalEquivalentQuantity: 3.2,
      locations: [
        {
          warehouse: "dry-store",
          warehouseLabel: "干货库",
          locationCode: "D2",
          displayQuantity: "3.2",
          equivalentQuantity: 3.2
        }
      ]
    }
  ]
]);

export const task4InventorySnapshotsForMutation = new Map<string, OrderingInventorySnapshot>([
  [
    "CMP-200101",
    {
      supplierProductId: "CMP-200101",
      totalEquivalentQuantity: 4.25,
      locations: [
        {
          warehouse: "freezer",
          warehouseLabel: "冷冻库",
          locationCode: "A1",
          displayQuantity: "4.25",
          equivalentQuantity: 4.25
        }
      ]
    }
  ],
  [
    "CMP-200102",
    {
      supplierProductId: "CMP-200102",
      totalEquivalentQuantity: 1,
      locations: [
        {
          warehouse: "freezer",
          warehouseLabel: "冷冻库",
          locationCode: "A2",
          displayQuantity: "1",
          equivalentQuantity: 1
        }
      ]
    }
  ]
]);
