import type { PurchaseBatch } from "./types";

export type BrakesManualQueueItem = {
  id: string;
  productName: string;
  code: string;
  quantity: number;
};

export function extractBrakesManualQueue(batch: PurchaseBatch): BrakesManualQueueItem[] {
  return batch.items.flatMap((item) => {
    const code = item.supplierProductCode?.trim();
    if (item.supplierGroup !== "BRK" || !code || item.orderQuantity == null || item.orderQuantity <= 0) return [];
    return [{ id: item.id, productName: item.productName, code, quantity: item.orderQuantity }];
  });
}

export function formatBrakesManualQueueLine(item: BrakesManualQueueItem): string {
  return `${item.code} × ${item.quantity}`;
}
