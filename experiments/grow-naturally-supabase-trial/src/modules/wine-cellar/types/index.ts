export type FillDirection = "front-to-back" | "back-to-front" | "left-to-right" | "right-to-left";
export type LowStockMode = "percentage" | "absolute";
export type StockUnit = "bottle" | "keg" | "other";
export type MatchStatus = "matched" | "unmatched";

export type WineCellarPermission =
  | "wine_cellar.view"
  | "wine_cellar.manage_layout"
  | "wine_cellar.count"
  | "wine_cellar.receive"
  | "wine_cellar.adjust"
  | "wine_cellar.view_cost";

export type WineCellarScope = { hotelId: string; areaId: string };
export type WineCellarActor = { id: string; name: string };

export type WineCellarRack = WineCellarScope & {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WineCellarPosition = WineCellarScope & {
  id: string;
  rackId: string;
  code: string;
  width: number;
  depth: number;
  capacity: number;
  currentQuantity: number;
  stockUnit: StockUnit;
  fillDirection: FillDirection;
  lowStockMode: LowStockMode;
  lowStockThreshold: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WineCellarProductAssignment = WineCellarScope & {
  id: string;
  positionId: string;
  productId: string | null;
  productName: string;
  matchStatus: MatchStatus;
  supplierName: string | null;
  supplierProductCode: string | null;
  invoiceReference: string | null;
  unitCost: number | null;
  currency: string;
  assignedAt: string;
  assignedById: string;
  assignedByName: string;
  active: boolean;
};

export type WineCellarCountSession = WineCellarScope & {
  id: string;
  status: "completed";
  notes: string | null;
  startedAt: string;
  completedAt: string;
  actorId: string;
  actorName: string;
};

export type WineCellarCountEntry = WineCellarScope & {
  id: string;
  sessionId: string;
  positionId: string;
  beforeQuantity: number;
  afterQuantity: number;
  capacity: number;
  emptySlotIds: string[];
  abnormalPattern: boolean;
  actorId: string;
  actorName: string;
  createdAt: string;
};

export type WineCellarReceipt = WineCellarScope & {
  id: string;
  positionId: string;
  quantity: number;
  beforeQuantity: number;
  afterQuantity: number;
  invoiceReference: string | null;
  unitCost: number | null;
  actorId: string;
  actorName: string;
  createdAt: string;
};

export type WineCellarStockAdjustment = WineCellarScope & {
  id: string;
  positionId: string;
  delta: number;
  reason: string;
  beforeQuantity: number;
  afterQuantity: number;
  actorId: string;
  actorName: string;
  createdAt: string;
};

export type WineCellarAuditEvent = WineCellarScope & {
  id: string;
  type: "rack-created" | "rack-updated" | "rack-archived" | "position-created" | "position-updated" | "position-archived" | "product-assigned";
  entityId: string;
  changes: Record<string, unknown>;
  actorId: string;
  actorName: string;
  createdAt: string;
};

export type WineCellarSnapshot = {
  racks: WineCellarRack[];
  positions: WineCellarPosition[];
  assignments: WineCellarProductAssignment[];
  countSessions: WineCellarCountSession[];
  countEntries: WineCellarCountEntry[];
  receipts: WineCellarReceipt[];
  adjustments: WineCellarStockAdjustment[];
  auditEvents: WineCellarAuditEvent[];
};

export type WineCellarProductOption = {
  productId: string;
  productName: string;
  supplierName?: string | null;
  supplierProductCode?: string | null;
  invoiceReference?: string | null;
  unitCost?: number | null;
  currency?: string;
};

export type ProductAssignmentInput = {
  productId: string | null;
  productName: string;
  matchStatus: MatchStatus;
  supplierName?: string | null;
  supplierProductCode?: string | null;
  invoiceReference?: string | null;
  unitCost?: number | null;
  currency?: string;
};

export type CreateRackInput = { name: string };
export type UpdateRackInput = { name?: string; displayOrder?: number };
export type CreatePositionInput = {
  rackId: string;
  code: string;
  width: number;
  depth: number;
  stockUnit: StockUnit;
  fillDirection: FillDirection;
  lowStockMode: LowStockMode;
  lowStockThreshold: number;
  assignment?: ProductAssignmentInput | null;
};
export type UpdatePositionInput = Partial<Omit<CreatePositionInput, "rackId">> & { rackId?: string };
export type RecordCountInput = { positionId: string; emptySlotIds: string[]; notes?: string | null };
export type RecordReceiptInput = {
  positionId: string;
  quantity: number;
  invoiceReference?: string | null;
  unitCost?: number | null;
};
export type RecordAdjustmentInput = { positionId: string; delta: number; reason: string };

export type WineCellarInventorySummary = {
  totalQuantity: number;
  totalCapacity: number;
  inventoryPercentage: number;
  lowStockPositionCount: number;
  unmatchedProductCount: number;
  totalValue: number;
};
