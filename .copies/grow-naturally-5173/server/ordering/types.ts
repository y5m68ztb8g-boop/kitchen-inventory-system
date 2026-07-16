export type SupplierGroup = "CMP" | "MM" | "BRK" | "UNMATCHED";
export type PurchaseBatchStatus = "Draft" | "PartiallyOrdered" | "Ordered";
export type SupplierOrderStatus = "Pending" | "Prepared" | "Ordered";
export type BrakesItemStatus = "Pending" | "Added" | "AwaitingConfirmation" | "InvalidCode" | "Failed";

export type BrakesQuickAddInput = { itemId: string; productCode: string; quantity: number };

export type BrakesQuickAddResult = {
  itemId: string;
  status: Exclude<BrakesItemStatus, "Pending">;
  message: string | null;
};

export interface BrakesQuickAddRunner {
  fill(items: BrakesQuickAddInput[]): Promise<BrakesQuickAddResult[]>;
}

export type PurchaseBatchItem = {
  id: string;
  batchId: string;
  productName: string;
  supplierGroup: SupplierGroup;
  supplierProductId: string | null;
  supplierProductCode: string | null;
  supplierName: string | null;
  packSize: string | null;
  orderQuantity: number | null;
  orderUnit: string;
  lastPrice: number | null;
  purchaseCount: number | null;
  latestPurchaseDate: string | null;
  brakesStatus: BrakesItemStatus;
  brakesMessage?: string | null;
};

export type PurchaseBatchSupplier = {
  supplierCode: "CMP" | "MM" | "BRK";
  status: SupplierOrderStatus;
  preparedAt: string | null;
  orderedAt: string | null;
  emailDraft: { to: string; subject: string; body: string } | null;
};

export type PurchaseBatch = {
  id: string;
  poNumber: string;
  status: PurchaseBatchStatus;
  items: PurchaseBatchItem[];
  suppliers: PurchaseBatchSupplier[];
};

export type OrderingProfile = {
  purchaserName: string;
  hotelName: string;
  campbellsEmail: string;
  markMurphyEmail: string;
};
