import type { HistoricalProductCandidate } from "../../../server/purchasing/matching";
import type { OrderingInventorySnapshot } from "../../../server/ordering/inventory";

export const orderingTask3Candidates: HistoricalProductCandidate[] = [
  {
    id: "BRK-100243",
    latestPrice: 12.5,
    latestPurchaseDate: "2026-06-30",
    packSize: "8x6",
    productName: "Bread Roll",
    purchaseCount: 5,
    supplierCode: "BRK",
    supplierName: "Brakes",
    supplierProductCode: "100243"
  },
  {
    id: "CMP-200101",
    latestPrice: 6.2,
    latestPurchaseDate: "2026-06-29",
    packSize: "12x1kg",
    productName: "Chicken Breast",
    purchaseCount: 8,
    supplierCode: "CMP",
    supplierName: "Campbells Prime Meat Ltd",
    supplierProductCode: "200101"
  },
  {
    id: "MM-300500",
    latestPrice: 7.9,
    latestPurchaseDate: "2026-06-20",
    packSize: "6x1L",
    productName: "Orange Juice",
    purchaseCount: 2,
    supplierCode: "MM",
    supplierName: "Mark Murphy (Dole Ltd)",
    supplierProductCode: "300500"
  }
];

export const orderingTask3InventorySnapshot = new Map<string, OrderingInventorySnapshot>([
  [
    "BRK-100243",
    {
      supplierProductId: "BRK-100243",
      totalEquivalentQuantity: 3.5,
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
          displayQuantity: "2",
          equivalentQuantity: 2
        }
      ]
    }
  ]
]);
