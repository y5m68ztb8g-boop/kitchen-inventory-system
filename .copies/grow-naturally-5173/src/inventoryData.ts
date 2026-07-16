import { FREEZER_INVENTORY, type FreezerInventoryItem } from "./generated/freezerInventory";

export type StockItem = {
  id: string;
  productName: string;
  productNameEn: string;
  warehouse: string;
  warehouseEn: string;
  rack: string;
  rackEn: string;
  position: string;
  positionEn: string;
  quantityText: string;
  quantityTextEn: string;
};

export const RECORDED_FREEZER_STOCK: StockItem[] = FREEZER_INVENTORY.map(freezerInventoryItemToStockItem);

export const SAMPLE_STOCK: StockItem[] = [...RECORDED_FREEZER_STOCK];

export function freezerInventoryItemToStockItem(item: FreezerInventoryItem): StockItem {
  const location = describeFreezerLocation(item.locationCode);

  return {
    id: item.id,
    productName: item.productName,
    productNameEn: item.productName,
    warehouse: "冷冻库",
    warehouseEn: "Freezer",
    rack: location.rack,
    rackEn: location.rackEn,
    position: location.position,
    positionEn: location.positionEn,
    quantityText: item.quantityText,
    quantityTextEn: item.quantityText
  };
}

export function describeFreezerLocation(locationCode: string) {
  const zone = locationCode.charAt(0);
  const number = locationCode.slice(1);
  const displayCode = formatFreezerLocationCode(locationCode);

  if (zone === "P") {
    return {
      rack: "托盘区",
      rackEn: "Pallet Zone",
      position: displayCode,
      positionEn: displayCode
    };
  }

  return {
    rack: `${zone}货架`,
    rackEn: `Rack ${zone}`,
    position: displayCode,
    positionEn: displayCode
  };
}

export function formatFreezerLocationCode(locationCode: string) {
  if (/^[A-D]0$/.test(locationCode)) {
    return `${locationCode.charAt(0)} top`;
  }

  if (/^[A-D]4$/.test(locationCode)) {
    return `${locationCode.charAt(0)} floor`;
  }

  return locationCode;
}

export function searchStockByProductName(
  query: string,
  additionalStock: StockItem[] = [],
  excludedBaseIds: Set<string> = new Set()
) {
  const normalized = query.trim().toLocaleLowerCase();

  if (!normalized) {
    return [];
  }

  const baseStock = SAMPLE_STOCK.filter((item) => !excludedBaseIds.has(item.id));

  return [...baseStock, ...additionalStock].filter((item) => {
    const chineseMatch = item.productName.toLocaleLowerCase().includes(normalized);
    const englishMatch = item.productNameEn.toLocaleLowerCase().includes(normalized);
    return chineseMatch || englishMatch;
  });
}
