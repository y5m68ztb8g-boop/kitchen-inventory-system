export type SupplierGroup = "CMP" | "MM" | "BRK" | "UNMATCHED";
export type PurchaseBatchStatus = "Draft" | "PartiallyOrdered" | "Ordered";
export type SupplierOrderStatus = "Pending" | "Prepared" | "Ordered";
export type BrakesItemStatus = "Pending" | "Added" | "AwaitingConfirmation" | "InvalidCode" | "Failed";

export type OrderingInventoryLocation = {
  warehouse: "freezer" | "dry-store";
  warehouseLabel: "冷冻库" | "干货库";
  locationCode: string;
  displayQuantity: string;
  equivalentQuantity: number;
  deepLink: string;
};

export type PurchaseBatchItem = {
  id: string;
  batchId: string;
  productName: string;
  supplierGroup: SupplierGroup;
  supplierProductId: string | null;
  supplierProductCode: string | null;
  supplierName: string | null;
  packSize: string | null;
  orderQuantity: number;
  orderUnit: string;
  lastPrice: number | null;
  purchaseCount: number | null;
  latestPurchaseDate: string | null;
  brakesStatus: BrakesItemStatus;
  brakesMessage?: string | null;
  totalEquivalentQuantity?: number;
  locations?: OrderingInventoryLocation[];
};

export type PurchaseBatchSupplier = {
  supplierCode: Exclude<SupplierGroup, "UNMATCHED">;
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
  supplierGroups: PurchaseBatchSupplier[];
};

export type OrderingProfile = {
  purchaserName: string;
  hotelName: string;
  campbellsEmail: string;
  markMurphyEmail: string;
};

export type CurrentOrderingResponse = {
  batch: PurchaseBatch;
  readyIntakes: Array<{ id: string; originalFilename: string; handedOffAt: string; itemCount: number }>;
  intakeStatus?: "AddedToOrder";
};

export type SupplierEmailDraft = {
  supplierCode: "CMP" | "MM";
  to: string;
  subject: string;
  body: string;
};

export type InventoryReviewItem = {
  itemId: string;
  productName: string;
  totalEquivalentQuantity: number;
  locations: OrderingInventoryLocation[];
  inventoryLink: string;
};

export type PreparationResult =
  | { kind: "inventory-review-required"; items: InventoryReviewItem[] }
  | { kind: "email-draft"; draft: SupplierEmailDraft }
  | { kind: "brakes-ready"; items: Array<{ itemId: string; productCode: string; quantity: number }> };

export type AddOrderingItemInput =
  | { supplierProductId: string; orderQuantity: number }
  | {
      productName: string;
      orderQuantity: number;
      orderUnit: string;
      supplierGroup: SupplierGroup;
      supplierProductCode?: string;
    };

export type UpdateOrderingItemInput = {
  productName?: string;
  orderQuantity?: number;
  orderUnit?: string;
  supplierGroup?: SupplierGroup;
  supplierProductCode?: string | null;
  supplierProductId?: string | null;
};
