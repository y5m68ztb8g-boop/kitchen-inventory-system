import type { PurchaseBatch } from "./types";

export type BrakesEdiOrder = {
  supplierCode: "BRK";
  batchId: string;
  poNumber: string;
  lines: Array<{
    lineNumber: number;
    supplierProductCode: string;
    quantity: number;
    unit: string;
  }>;
};

export type BrakesEdiGateway = {
  submit(order: BrakesEdiOrder): Promise<{ status: string; reference?: string }>;
};

export class BrakesEdiValidationError extends Error {
  constructor(readonly code: "PO_REQUIRED" | "INVALID_ORDERING_DATA" | "INVALID_ORDER_QUANTITY") {
    super(code);
  }
}

export function buildBrakesEdiOrder(batch: PurchaseBatch): BrakesEdiOrder {
  const poNumber = batch.poNumber.trim();
  if (!poNumber) throw new BrakesEdiValidationError("PO_REQUIRED");

  const items = batch.items.filter((item) => item.supplierGroup === "BRK");
  if (items.length === 0) throw new BrakesEdiValidationError("INVALID_ORDERING_DATA");

  const lines = items.map((item, index) => {
    const supplierProductCode = item.supplierProductCode?.trim();
    if (!supplierProductCode) throw new BrakesEdiValidationError("INVALID_ORDERING_DATA");
    if (item.orderQuantity === null || !Number.isFinite(item.orderQuantity) || item.orderQuantity <= 0) {
      throw new BrakesEdiValidationError("INVALID_ORDER_QUANTITY");
    }
    return {
      lineNumber: index + 1,
      supplierProductCode,
      quantity: item.orderQuantity,
      unit: item.orderUnit
    };
  });

  return { supplierCode: "BRK", batchId: batch.id, poNumber, lines };
}
