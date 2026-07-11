import type { SupplierProduct } from "./supplierProducts";

type InventoryQuantitySupplierProduct = Pick<SupplierProduct, "packSize"> &
  Partial<Pick<SupplierProduct, "id" | "productName">>;

export type InventoryQuantityInput = {
  quantity: number;
  quantityText?: string;
  fullPackageCount?: number;
  loosePackageCount?: number;
  openPackagePercent?: number;
  supplierProduct: InventoryQuantitySupplierProduct;
} & Record<string, unknown>;

export function calculateInventoryUnits(entry: InventoryQuantityInput): number;
export function calculateInventoryUnits(entry: Record<string, unknown>): number;
export function calculateInventoryUnits(entry: InventoryQuantityInput | Record<string, unknown>) {
  const inventoryEntry = entry as InventoryQuantityInput;
  const packageCounts = getInventoryPackageCounts(inventoryEntry);
  const hasPackageCountOverride = inventoryEntry.fullPackageCount !== undefined || inventoryEntry.loosePackageCount !== undefined;
  const hasLoosePackageCount = Boolean(inventoryEntry.quantityText && packageCounts.loosePackageCount > 0);
  if (packageCounts.unitsPerCase > 1 && (hasCaseQuantity(inventoryEntry.quantityText || "") || hasLoosePackageCount || hasPackageCountOverride)) {
    return packageCounts.fullPackageCount + packageCounts.loosePackageCount / packageCounts.unitsPerCase;
  }

  return inventoryEntry.quantity + (inventoryEntry.openPackagePercent || 0) / 100;
}

export function getInventoryPackageCounts(entry: InventoryQuantityInput) {
  const unitsPerCase = getSupplierUnitsPerCase(entry.supplierProduct);
  const parsedCounts = entry.quantityText ? parsePackageCounts(entry.quantityText) : null;

  return {
    fullPackageCount: entry.fullPackageCount ?? parsedCounts?.fullPackageCount ?? entry.quantity,
    loosePackageCount: entry.loosePackageCount ?? parsedCounts?.loosePackageCount ?? 0,
    unitsPerCase
  };
}

export function getSupplierUnitsPerCase(product: InventoryQuantitySupplierProduct) {
  const knownLoosePackageCounts: Record<string, number> = {
    "BRK-123224": 12,
    "BRK-136269": 2,
    "BRK-3625": 8,
    "BRK-460806": 24
  };
  const knownLoosePackageCount = product.id ? knownLoosePackageCounts[product.id] : undefined;
  if (knownLoosePackageCount) {
    return knownLoosePackageCount;
  }

  const searchable = `${product.productName || ""} ${product.packSize}`;
  const packOfMatch = searchable.match(/pack\s+of\s+(\d+(?:\.\d+)?)/i);
  if (packOfMatch) return Number(packOfMatch[1]);

  const countedPackMatch = searchable.match(
    /\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(?:fillet|fillets|fish|pack|packs|each|ea|pc|pcs|piece|pieces)\b/i
  );
  if (countedPackMatch) return Number(countedPackMatch[1]) * Number(countedPackMatch[2]);

  const countedMeasuredPackMatch = searchable.match(
    /\b(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*x\s*(\d+(?:\.\d+)?)\s*(?:kg|g|ml|l|ltr)\b/i
  );
  if (countedMeasuredPackMatch) return Number(countedMeasuredPackMatch[1]);

  const measuredPackMatch = searchable.match(/\b(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l|ltr)\b/i);
  if (measuredPackMatch) return Number(measuredPackMatch[1]);

  const simpleCountMatch = searchable.match(/\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\b/i);
  if (simpleCountMatch) {
    const firstCount = Number(simpleCountMatch[1]);
    const secondCount = Number(simpleCountMatch[2]);
    return firstCount === 1 ? secondCount : firstCount;
  }

  const singleCountMatch = searchable.match(
    /\b(\d+(?:\.\d+)?)\s*x\s*(?:fillet|fillets|fish|pack|packs|each|ea|pc|pcs|piece|pieces)\b/i
  );
  if (singleCountMatch) return Number(singleCountMatch[1]);

  return 0;
}

function parsePackageCounts(quantityText: string) {
  const openCaseCount = sumQuantitiesBeforeUnits(quantityText, ["open case", "open cases"]);
  const allCaseCount = sumQuantitiesBeforeUnits(quantityText, ["case", "cases"]);
  const loosePackageCount = sumQuantitiesBeforeUnits(quantityText, [
    "bag", "bags", "cake", "cakes", "pack", "packs", "piece", "pieces", "roll", "rolls", "slice", "slices", "portion", "portions"
  ]);

  return { fullPackageCount: Math.max(0, allCaseCount - openCaseCount), loosePackageCount };
}

function sumQuantitiesBeforeUnits(text: string, unitWords: string[]) {
  const unitPattern = unitWords.map((unit) => unit.replace(/\s+/g, "\\\\s+")).join("|");
  return [...text.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:full\\s*)?(?:${unitPattern})\\b`, "gi"))].reduce(
    (total, match) => total + Number(match[1]),
    0
  );
}

function hasCaseQuantity(quantityText: string) {
  return /\b(?:case|cases|open\s+case|open\s+cases)\b/i.test(quantityText);
}
