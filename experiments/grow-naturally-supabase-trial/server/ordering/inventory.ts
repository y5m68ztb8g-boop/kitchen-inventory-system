import { createHash } from "node:crypto";

import { calculateInventoryUnits, type InventoryQuantityInput } from "../../src/inventoryQuantity";
import { FREEZER_INVENTORY } from "../../src/generated/freezerInventory";
import { SUPPLIER_CATALOGUE } from "../../src/generated/supplierCatalogue";
import { normaliseProductName } from "../purchasing/matching";

export type OrderingInventoryLocation = {
  warehouse: "freezer" | "dry-store";
  warehouseLabel: "冷冻库" | "干货库";
  locationCode: string;
  displayQuantity: string;
  equivalentQuantity: number;
};

export type OrderingInventorySnapshot = {
  supplierProductId: string;
  totalEquivalentQuantity: number;
  locations: OrderingInventoryLocation[];
};

type SnapshotEntry = InventoryQuantityInput & {
  locationCode: string;
  productName: string;
  sourceItemId?: string;
  supplierProductId?: string;
  warehouse: "freezer" | "dry-store";
};

type BaselineFreezerInventoryItem = Record<string, unknown>;

export function buildOrderingInventorySnapshot(
  inventoryDatabase: unknown,
  baselineFreezerInventory: readonly BaselineFreezerInventoryItem[] = FREEZER_INVENTORY
) {
  const database = isRecord(inventoryDatabase) ? inventoryDatabase : {};
  const persistedEntries = Array.isArray(inventoryDatabase)
    ? inventoryDatabase
    : [...asArray(database.freezer), ...asArray(database.dryStore)];
  const representedSourceIds = new Set(
    persistedEntries.flatMap((entry) => {
      const sourceItemId = readString(entry, "sourceItemId");
      return sourceItemId ? [sourceItemId] : [];
    })
  );
  const deletedSourceIds = new Set(asArray(database.deletedFreezerInventoryIds).filter(isString));
  const nameOverrides = isRecord(database.freezerSourceNameOverrides) ? database.freezerSourceNameOverrides : {};
  const entries = [
    ...persistedEntries.map((entry) => normalizeSnapshotEntry(entry, inferWarehouse(entry))).filter(isSnapshotEntry),
    ...baselineFreezerInventory
      .filter((entry) => {
        const id = readString(entry, "id");
        return !id || (!representedSourceIds.has(id) && !deletedSourceIds.has(id));
      })
      .map((entry) => normalizeBaselineEntry(entry, nameOverrides))
      .filter(isSnapshotEntry)
  ];

  const idsByName = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.supplierProductId) continue;
    addNameId(idsByName, entry.productName, entry.supplierProductId);
    addNameId(idsByName, entry.supplierProduct.productName || "", entry.supplierProductId);
  }

  const snapshots = new Map<string, OrderingInventorySnapshot>();
  for (const entry of entries) {
    const supplierProductId = entry.supplierProductId || uniqueNameMatch(idsByName, entry.productName);
    if (!supplierProductId) continue;

    const equivalentQuantity = calculateInventoryUnits(entry);
    const snapshot: OrderingInventorySnapshot = snapshots.get(supplierProductId) || {
      supplierProductId,
      totalEquivalentQuantity: 0,
      locations: []
    };
    snapshot.totalEquivalentQuantity += equivalentQuantity;
    snapshot.locations.push({
      warehouse: entry.warehouse,
      warehouseLabel: entry.warehouse === "freezer" ? "冷冻库" : "干货库",
      locationCode: entry.locationCode,
      displayQuantity: displayQuantity(entry),
      equivalentQuantity
    });
    snapshots.set(supplierProductId, snapshot);
  }

  return snapshots;
}

export function inventorySnapshotKey(snapshot: OrderingInventorySnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function inventoryDeepLink(input: {
  supplierProductId: string;
  warehouse: string;
  locationCode: string;
}): string;
export function inventoryDeepLink(
  supplierProductId: string,
  location: Pick<OrderingInventoryLocation, "warehouse" | "locationCode">
): string;
export function inventoryDeepLink(
  input: string | { supplierProductId: string; warehouse: string; locationCode: string },
  location?: Pick<OrderingInventoryLocation, "warehouse" | "locationCode">
) {
  const supplierProductId = typeof input === "string" ? input : input.supplierProductId;
  const target = typeof input === "string" ? location : input;
  if (!target || (target.warehouse !== "freezer" && target.warehouse !== "dry-store")) {
    return "#ordering";
  }

  const params = new URLSearchParams({ supplierProductId, location: target.locationCode });
  return "#" + target.warehouse + "?" + params.toString();
}

function normalizeSnapshotEntry(value: unknown, fallbackWarehouse: "freezer" | "dry-store"): SnapshotEntry | null {
  if (!isRecord(value)) return null;
  const supplierProduct = isRecord(value.supplierProduct) ? value.supplierProduct : {};
  const supplierProductId = readString(value, "supplierProductId") || readString(supplierProduct, "id");
  const catalogueProduct = supplierProductId ? SUPPLIER_CATALOGUE.find((product) => product.id === supplierProductId) : undefined;
  const warehouse = readWarehouse(value, "warehouse") || fallbackWarehouse;
  const quantity = readNumber(value, "quantity") ?? readNumber(value, "fullPackageCount") ?? 0;
  const locationCode = readString(value, "locationCode");
  const productName = readString(value, "productName") || catalogueProduct?.productName || "";
  if (!locationCode || !productName) return null;

  return {
    fullPackageCount: readNumber(value, "fullPackageCount") ?? undefined,
    locationCode,
    loosePackageCount: readNumber(value, "loosePackageCount") ?? undefined,
    openPackagePercent: readNumber(value, "openPackagePercent") ?? undefined,
    productName,
    quantity,
    quantityText: readString(value, "quantityText") || undefined,
    sourceItemId: readString(value, "sourceItemId") || undefined,
    supplierProduct: {
      id: supplierProductId || undefined,
      packSize: readString(value, "packSize") || readString(supplierProduct, "packSize") || catalogueProduct?.packSize || "",
      productName: readString(supplierProduct, "productName") || catalogueProduct?.productName || productName
    },
    supplierProductId: supplierProductId || undefined,
    warehouse
  };
}

function normalizeBaselineEntry(value: BaselineFreezerInventoryItem, nameOverrides: Record<string, unknown>) {
  const id = readString(value, "id");
  const supplierProductId =
    readString(value, "supplierProductId") ||
    joinSupplierProductId(readString(value, "suggestedSupplierCode"), readString(value, "suggestedSupplierProductCode"));
  const catalogueProduct = supplierProductId ? SUPPLIER_CATALOGUE.find((product) => product.id === supplierProductId) : undefined;
  const productName = (id && readString(nameOverrides, id)) || readString(value, "productName") || catalogueProduct?.productName || "";

  return normalizeSnapshotEntry(
    {
      locationCode: readString(value, "locationCode"),
      productName,
      quantity: numericBaselineQuantity(readString(value, "quantityText")),
      quantityText: readString(value, "quantityText"),
      sourceItemId: id,
      supplierProduct: catalogueProduct || { id: supplierProductId, packSize: readString(value, "packSize"), productName },
      supplierProductId,
      warehouse: "freezer"
    },
    "freezer"
  );
}

function addNameId(idsByName: Map<string, Set<string>>, name: string, supplierProductId: string) {
  const normalizedName = normaliseProductName(name);
  if (!normalizedName) return;
  const ids = idsByName.get(normalizedName) || new Set<string>();
  ids.add(supplierProductId);
  idsByName.set(normalizedName, ids);
}

function uniqueNameMatch(idsByName: Map<string, Set<string>>, productName: string) {
  const ids = idsByName.get(normaliseProductName(productName));
  return ids?.size === 1 ? Array.from(ids)[0] : undefined;
}

function displayQuantity(entry: SnapshotEntry) {
  return entry.quantityText || String(entry.quantity);
}

function inferWarehouse(value: unknown): "freezer" | "dry-store" {
  return isRecord(value) && readWarehouse(value, "warehouse") === "dry-store" ? "dry-store" : "freezer";
}

function joinSupplierProductId(supplierCode: string, supplierProductCode: string) {
  return supplierCode && supplierProductCode ? supplierCode + "-" + supplierProductCode : "";
}

function numericBaselineQuantity(quantityText: string) {
  const match = quantityText.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSnapshotEntry(value: SnapshotEntry | null): value is SnapshotEntry {
  return value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function readNumber(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function readString(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function readWarehouse(value: Record<string, unknown>, key: string) {
  const candidate = readString(value, key);
  return candidate === "freezer" || candidate === "dry-store" ? candidate : null;
}
