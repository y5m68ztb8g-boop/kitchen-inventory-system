import { describeFreezerLocation, type StockItem } from "./inventoryData";
import { calculateInventoryUnits } from "./inventoryQuantity";
import type { SupplierProduct } from "./supplierProducts";

export { calculateInventoryUnits, getInventoryPackageCounts, getSupplierUnitsPerCase } from "./inventoryQuantity";

const STORAGE_KEY = "grow-naturally-freezer-inventory";
const DRY_STORE_STORAGE_KEY = "grow-naturally-dry-store-inventory";
const DELETED_SOURCE_IDS_KEY = "grow-naturally-deleted-freezer-inventory-ids";
const SOURCE_NAME_OVERRIDES_KEY = "grow-naturally-freezer-source-name-overrides";

export type InventoryStorageScope = "freezer" | "dry-store";

const inventoryStorageKeys: Record<InventoryStorageScope, string> = {
  "dry-store": DRY_STORE_STORAGE_KEY,
  freezer: STORAGE_KEY
};

export type InventoryEntry = {
  id: string;
  productName: string;
  locationCode: string;
  rack: string;
  position: string;
  quantity: number;
  fullPackageCount?: number;
  loosePackageCount?: number;
  openPackagePercent?: number;
  unit: string;
  quantityText?: string;
  sourceItemId?: string;
  supplierProduct: SupplierProduct;
  createdAt: string;
};

export function loadInventoryEntries(scope: InventoryStorageScope = "freezer"): InventoryEntry[] {
  try {
    const raw = window.localStorage.getItem(inventoryStorageKeys[scope]);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveInventoryEntries(
  entries: InventoryEntry[],
  scope: InventoryStorageScope = "freezer",
  options: { persistRemote?: boolean } = {}
) {
  window.localStorage.setItem(inventoryStorageKeys[scope], JSON.stringify(entries));
  if (options.persistRemote !== false) {
    persistLocalInventoryDatabase();
  }
}

export function loadDeletedInventoryItemIds(): string[] {
  try {
    const raw = window.localStorage.getItem(DELETED_SOURCE_IDS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveDeletedInventoryItemIds(ids: string[], options: { persistRemote?: boolean } = {}) {
  window.localStorage.setItem(DELETED_SOURCE_IDS_KEY, JSON.stringify(ids));
  if (options.persistRemote !== false) {
    persistLocalInventoryDatabase();
  }
}

export function loadSourceProductNameOverrides(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SOURCE_NAME_OVERRIDES_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => (
        typeof entry[0] === "string" && typeof entry[1] === "string" && entry[1].trim().length > 0
      ))
    );
  } catch {
    return {};
  }
}

export function saveSourceProductNameOverrides(
  overrides: Record<string, string>,
  options: { persistRemote?: boolean } = {}
) {
  window.localStorage.setItem(SOURCE_NAME_OVERRIDES_KEY, JSON.stringify(overrides));
  if (options.persistRemote !== false) {
    persistLocalInventoryDatabase();
  }
}

export function buildInventoryEntry(input: {
  productName: string;
  locationCode: string;
  describeLocation?: (locationCode: string) => {
    position: string;
    positionEn: string;
    rack: string;
    rackEn: string;
  };
  quantity: number;
  fullPackageCount?: number;
  loosePackageCount?: number;
  openPackagePercent?: number;
  quantityText?: string;
  sourceItemId?: string;
  unit: string;
  supplierProduct: SupplierProduct;
}): InventoryEntry {
  const location = (input.describeLocation || describeFreezerLocation)(input.locationCode);

  return {
    id: `${Date.now()}-${input.supplierProduct.id}`,
    productName: input.productName.trim(),
    locationCode: input.locationCode,
    rack: location.rack,
    position: location.position,
    quantity: input.quantity,
    fullPackageCount: input.fullPackageCount,
    loosePackageCount: input.loosePackageCount,
    openPackagePercent: input.openPackagePercent || undefined,
    quantityText: input.quantityText,
    sourceItemId: input.sourceItemId,
    unit: input.unit.trim(),
    supplierProduct: input.supplierProduct,
    createdAt: new Date().toISOString()
  };
}

export function calculateInventoryLineTotal(entry: InventoryEntry) {
  return calculateInventoryUnits(entry) * entry.supplierProduct.latestPrice;
}

export function calculateInventoryTotal(entries: InventoryEntry[]) {
  return entries.reduce((total, entry) => total + calculateInventoryLineTotal(entry), 0);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    minimumFractionDigits: 2,
    style: "currency"
  }).format(value);
}

export function entryToStockItem(
  entry: InventoryEntry,
  options: {
    describeLocation?: (locationCode: string) => {
      position: string;
      positionEn: string;
      rack: string;
      rackEn: string;
    };
    warehouse?: string;
    warehouseEn?: string;
  } = {}
): StockItem {
  const describeLocation = options.describeLocation || describeFreezerLocation;
  const location = describeLocation(entry.locationCode);

  return {
    id: entry.id,
    productName: entry.productName,
    productNameEn: entry.supplierProduct.productName,
    warehouse: options.warehouse || "冷冻库",
    warehouseEn: options.warehouseEn || "Freezer",
    rack: location.rack,
    rackEn: location.rackEn,
    position: location.position,
    positionEn: location.positionEn,
    quantityText: formatEntryQuantity(entry),
    quantityTextEn: formatEntryQuantity(entry)
  };
}

export function formatEntryQuantity(entry: InventoryEntry) {
  if (entry.quantityText) {
    return entry.quantityText;
  }

  const baseQuantity = `${entry.quantity}${entry.unit}`;
  if (!entry.openPackagePercent) {
    return baseQuantity;
  }

  return `${baseQuantity} + ${entry.openPackagePercent}%`;
}

export function parseRecordedQuantity(quantityText: string) {
  const numbers = [...quantityText.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const quantity = numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) : 1;
  const unit = quantityText
    .replace(/\d+(?:\.\d+)?/g, "")
    .replace(/[+(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    quantity,
    unit: unit || "unit"
  };
}

function parsePackageCounts(quantityText: string) {
  const openCaseCount = sumQuantitiesBeforeUnits(quantityText, ["open case", "open cases"]);
  const allCaseCount = sumQuantitiesBeforeUnits(quantityText, ["case", "cases"]);
  const loosePackageCount = sumQuantitiesBeforeUnits(quantityText, [
    "bag",
    "bags",
    "cake",
    "cakes",
    "pack",
    "packs",
    "piece",
    "pieces",
    "roll",
    "rolls",
    "slice",
    "slices",
    "portion",
    "portions"
  ]);

  return {
    fullPackageCount: Math.max(0, allCaseCount - openCaseCount),
    loosePackageCount
  };
}

function sumQuantitiesBeforeUnits(text: string, unitWords: string[]) {
  const unitPattern = unitWords.map((unit) => unit.replace(/\s+/g, "\\s+")).join("|");
  return [...text.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:full\\s*)?(?:${unitPattern})\\b`, "gi"))].reduce(
    (total, match) => total + Number(match[1]),
    0
  );
}

function hasCaseQuantity(quantityText: string) {
  return /\b(?:case|cases|open\s+case|open\s+cases)\b/i.test(quantityText);
}

function legacyGetSupplierUnitsPerCase(product: SupplierProduct) {
  const knownLoosePackageCounts: Record<string, number> = {
    "BRK-123224": 12,
    "BRK-136269": 2,
    "BRK-3625": 8,
    "BRK-460806": 24
  };
  const knownLoosePackageCount = knownLoosePackageCounts[product.id];
  if (knownLoosePackageCount) {
    return knownLoosePackageCount;
  }

  const searchable = `${product.productName} ${product.packSize}`;
  const packOfMatch = searchable.match(/pack\s+of\s+(\d+(?:\.\d+)?)/i);

  if (packOfMatch) {
    return Number(packOfMatch[1]);
  }

  const countedPackMatch = searchable.match(
    /\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(?:fillet|fillets|fish|pack|packs|each|ea|pc|pcs|piece|pieces)\b/i
  );

  if (countedPackMatch) {
    return Number(countedPackMatch[1]) * Number(countedPackMatch[2]);
  }

  const countedMeasuredPackMatch = searchable.match(
    /\b(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l|ltr)\b/i
  );

  if (countedMeasuredPackMatch) {
    return Number(countedMeasuredPackMatch[1]);
  }

  const measuredPackMatch = searchable.match(/\b(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l|ltr)\b/i);

  if (measuredPackMatch) {
    return Number(measuredPackMatch[1]);
  }

  const simpleCountMatch = searchable.match(/\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\b/i);

  if (simpleCountMatch) {
    return Number(simpleCountMatch[1]) * Number(simpleCountMatch[2]);
  }

  const singleCountMatch = searchable.match(
    /\b(\d+(?:\.\d+)?)\s*x\s*(?:fillet|fillets|fish|pack|packs|each|ea|pc|pcs|piece|pieces)\b/i
  );

  if (singleCountMatch) {
    return Number(singleCountMatch[1]);
  }

  return 0;
}

export function getInvoiceUnitLabel(product: SupplierProduct) {
  return product.packSize.trim() || "unit";
}

export function supplierShortName(product: SupplierProduct) {
  if (product.supplierCode === "CMP") {
    return "Campbell";
  }
  if (product.supplierCode === "BRK") {
    return "Brakes";
  }
  if (product.supplierCode === "MM") {
    return "Mark Murphy";
  }
  return product.supplierName;
}

function persistLocalInventoryDatabase() {
  if (typeof window.fetch !== "function") {
    return;
  }

  const database = {
    deletedFreezerInventoryIds: loadDeletedInventoryItemIds(),
    dryStore: loadInventoryEntries("dry-store"),
    freezer: loadInventoryEntries("freezer"),
    freezerSourceNameOverrides: loadSourceProductNameOverrides()
  };

  const request = window.fetch("/api/inventory-db", {
    body: JSON.stringify(database),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (request && typeof request.catch === "function") {
    void request.catch(() => undefined);
  }
}
