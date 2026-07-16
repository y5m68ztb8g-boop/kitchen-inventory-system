// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import type { PurchaseBatch } from "./types";

import {
  formatBrakesManualQueueLine,
  extractBrakesManualQueue
} from "./brakesManualAssistant";

describe("brakesManualAssistant", () => {
  let batch: PurchaseBatch;

  beforeEach(() => {
    batch = {
      id: "batch-001",
      poNumber: "PO-001",
      status: "Draft",
      suppliers: [],
      supplierGroups: [],
      items: [
        {
          id: "brk-valid-1",
          batchId: "batch-001",
          productName: "Brakes valid 1",
          supplierGroup: "BRK",
          supplierProductId: "BRK-100243",
          supplierProductCode: "100243",
          supplierName: "Brakes",
          packSize: "bag",
          orderQuantity: 3,
          orderUnit: "袋",
          lastPrice: null,
          purchaseCount: null,
          latestPurchaseDate: null,
          brakesStatus: "Pending"
        },
        {
          id: "brk-valid-2",
          batchId: "batch-001",
          productName: "Brakes valid 2",
          supplierGroup: "BRK",
          supplierProductId: "BRK-100244",
          supplierProductCode: "100244",
          supplierName: "Brakes",
          packSize: "箱",
          orderQuantity: 1.5,
          orderUnit: "箱",
          lastPrice: null,
          purchaseCount: null,
          latestPurchaseDate: null,
          brakesStatus: "Pending"
        },
        {
          id: "brk-missing-code",
          batchId: "batch-001",
          productName: "Brakes missing code",
          supplierGroup: "BRK",
          supplierProductId: null,
          supplierProductCode: null,
          supplierName: "Brakes",
          packSize: null,
          orderQuantity: 10,
          orderUnit: "袋",
          lastPrice: null,
          purchaseCount: null,
          latestPurchaseDate: null,
          brakesStatus: "Pending"
        },
        {
          id: "brk-zero-quantity",
          batchId: "batch-001",
          productName: "Brakes zero",
          supplierGroup: "BRK",
          supplierProductId: "BRK-100245",
          supplierProductCode: "100245",
          supplierName: "Brakes",
          packSize: "袋",
          orderQuantity: 0,
          orderUnit: "袋",
          lastPrice: null,
          purchaseCount: null,
          latestPurchaseDate: null,
          brakesStatus: "Pending"
        },
        {
          id: "cmp-product",
          batchId: "batch-001",
          productName: "Not brakes",
          supplierGroup: "CMP",
          supplierProductId: "CMP-001",
          supplierProductCode: "001",
          supplierName: "Campbells",
          packSize: null,
          orderQuantity: 12,
          orderUnit: "kg",
          lastPrice: null,
          purchaseCount: null,
          latestPurchaseDate: null,
          brakesStatus: "Pending"
        }
      ]
    };
  });

  it("extracts BRK items with supplierProductCode and positive orderQuantity only", () => {
    const result = extractBrakesManualQueue(batch);

    expect(result).toEqual([
      { id: "brk-valid-1", productName: "Brakes valid 1", code: "100243", quantity: 3 },
      { id: "brk-valid-2", productName: "Brakes valid 2", code: "100244", quantity: 1.5 }
    ]);
  });

  it("formats a manual queue item as `CODE × QUANTITY`", () => {
    const text = formatBrakesManualQueueLine({
      id: "brk-valid-1",
      productName: "Brakes valid 1",
      code: "100243",
      quantity: 3
    });

    expect(text).toBe("100243 × 3");
  });
});
