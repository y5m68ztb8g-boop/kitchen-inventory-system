import type { HistoricalInventoryEntry } from "./matching";

type BaselineFreezerInventoryItem = {
  id: string;
  productName: string;
  quantityText: string;
  recordedSupplierCode: string;
  suggestedSupplierCode: string;
  suggestedSupplierProductCode: string;
};

type InventoryDatabase = {
  deletedFreezerInventoryIds?: unknown;
  dryStore?: unknown;
  freezer?: unknown;
  freezerSourceNameOverrides?: unknown;
};

export function buildCurrentInventoryEntries(
  value: unknown,
  baselineFreezerInventory: BaselineFreezerInventoryItem[]
): HistoricalInventoryEntry[] {
  const database = isRecord(value) ? (value as InventoryDatabase) : {};
  const freezerEntries = validInventoryEntries(database.freezer);
  const persistedEntries = [...validInventoryEntries(database.dryStore), ...freezerEntries];
  const representedSourceIds = new Set(
    freezerEntries.flatMap((entry) => (entry.sourceItemId ? [entry.sourceItemId] : []))
  );
  const deletedSourceIds = new Set(
    Array.isArray(database.deletedFreezerInventoryIds)
      ? database.deletedFreezerInventoryIds.filter((id): id is string => typeof id === "string")
      : []
  );
  const nameOverrides = isRecord(database.freezerSourceNameOverrides)
    ? database.freezerSourceNameOverrides
    : {};

  return [
    ...persistedEntries.map(({ productName, quantity, supplierProduct }) => ({
      productName,
      quantity,
      supplierProduct
    })),
    ...baselineFreezerInventory
      .filter((item) => !deletedSourceIds.has(item.id) && !representedSourceIds.has(item.id))
      .map((item) => {
        const nameOverride = nameOverrides[item.id];
        const supplierProductId = baselineSupplierProductId(item);
        return {
          productName:
            typeof nameOverride === "string" && nameOverride.trim()
              ? nameOverride.trim()
              : item.productName,
          quantity: numericBaselineQuantity(item.quantityText),
          ...(supplierProductId ? { supplierProduct: { id: supplierProductId } } : {})
        };
      })
  ];
}

function validInventoryEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      entry
    ): entry is HistoricalInventoryEntry & { sourceItemId?: string; supplierProduct: { id: string } } =>
      isRecord(entry) &&
      typeof entry.productName === "string" &&
      typeof entry.quantity === "number" &&
      Number.isFinite(entry.quantity) &&
      isRecord(entry.supplierProduct) &&
      typeof entry.supplierProduct.id === "string" &&
      (entry.sourceItemId === undefined || typeof entry.sourceItemId === "string")
  );
}

function baselineSupplierProductId(item: BaselineFreezerInventoryItem) {
  const supplierCode = item.suggestedSupplierCode.trim();
  const productCode = item.suggestedSupplierProductCode.trim();
  return supplierCode && productCode ? `${supplierCode}-${productCode}` : null;
}

function numericBaselineQuantity(quantityText: string) {
  const match = quantityText.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return 0;
  }

  const quantity = Number(match[0]);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
