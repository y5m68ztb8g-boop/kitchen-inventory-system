import type {
  AddOrderingItemInput,
  CurrentOrderingResponse,
  InventoryReviewItem,
  OrderingProfile,
  PreparationResult,
  PurchaseBatch,
  SupplierEmailDraft,
  UpdateOrderingItemInput
} from "./types";

const chineseErrorMessages: Record<string, string> = {
  PO_REQUIRED: "请先填写 PO 再继续操作。",
  ORDERING_PROFILE_REQUIRED: "请先在下单设置中填写订购人、酒店名称和供应商邮箱。",
  INVALID_ORDER_QUANTITY: "订购数量无效，请填写大于 0 的数字。",
  SUPPLIER_PRODUCT_NOT_FOUND: "未找到对应历史商品，商品信息已过期。",
  INTAKE_ALREADY_ADDED: "该采购清单已转入下单模块。",
  ORDER_BATCH_NOT_FOUND: "当前下单批次不存在。",
  ORDER_BATCH_ITEM_NOT_FOUND: "未找到该下单商品。",
  INTAKE_NOT_READY_FOR_ORDER: "该采购清单尚未准备好转入下单模块。",
  INVALID_ORDERING_DATA: "下单数据无效，请检查后重试。",
  SUPPLIER_NOT_PREPARED: "请先完成该供应商的下单准备。"
};

export function getCurrentOrderingBatch(): Promise<CurrentOrderingResponse> {
  return readOrderingResponse("/api/ordering/current", { method: "GET" });
}

export function importReadyIntake(intakeId: string): Promise<CurrentOrderingResponse> {
  return readOrderingResponse(`/api/ordering/current/intakes/${encodeURIComponent(intakeId)}`, { method: "POST" });
}

export function saveBatchPo(batchId: string, poNumber: string): Promise<PurchaseBatch> {
  return readOrderingResponse(`/api/ordering/batches/${encodeURIComponent(batchId)}/po`, jsonRequest("PUT", { poNumber }));
}

export async function addOrderingItem(batchId: string, input: AddOrderingItemInput): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/items`,
    jsonRequest("POST", input)
  );
  return response.batch;
}

export async function updateOrderingItem(
  batchId: string,
  itemId: string,
  input: UpdateOrderingItemInput
): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}`,
    jsonRequest("PUT", input)
  );
  return response.batch;
}

export async function deleteOrderingItem(batchId: string, itemId: string): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
  return response.batch;
}

export function getOrderingProfile(): Promise<OrderingProfile> {
  return readOrderingResponse("/api/ordering/profile", { method: "GET" });
}

export function saveOrderingProfile(input: OrderingProfile): Promise<OrderingProfile> {
  return readOrderingResponse("/api/ordering/profile", jsonRequest("PUT", input));
}

export function prepareSupplierGroup(
  batchId: string,
  supplierCode: "CMP" | "MM" | "BRK"
): Promise<PreparationResult> {
  return readOrderingResponse(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/suppliers/${supplierCode}/prepare`,
    { method: "POST" }
  );
}

export async function acknowledgeRestockOnly(batchId: string, itemId: string): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}/restock-only`,
    { method: "POST" }
  );
  return response.batch;
}

export async function recordInventoryRecheck(batchId: string, itemId: string): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}/recheck-inventory`,
    { method: "POST" }
  );
  return response.batch;
}

export async function saveSupplierEmailDraft(
  batchId: string,
  supplierCode: "CMP" | "MM",
  draft: Omit<SupplierEmailDraft, "supplierCode">
): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/suppliers/${supplierCode}/email-draft`,
    jsonRequest("PUT", draft)
  );
  return response.batch;
}

export type BrakesQuickAddResponse =
  | { batch: PurchaseBatch; results?: Array<{ itemId: string; status: string; message: string | null }> }
  | { kind: "inventory-review-required"; items: InventoryReviewItem[] };

export function runBrakesQuickAdd(batchId: string): Promise<BrakesQuickAddResponse> {
  return readOrderingResponse<BrakesQuickAddResponse>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/suppliers/BRK/quick-add`,
    { method: "POST" },
    (_response, payload) => Boolean(payload && typeof payload === "object" && "kind" in payload && payload.kind === "inventory-review-required")
  );
}

export async function markSupplierOrdered(
  batchId: string,
  supplierCode: "CMP" | "MM" | "BRK"
): Promise<PurchaseBatch> {
  const response = await readOrderingResponse<{ batch: PurchaseBatch }>(
    `/api/ordering/batches/${encodeURIComponent(batchId)}/suppliers/${supplierCode}/mark-ordered`,
    { method: "POST" }
  );
  return response.batch;
}

export async function updateOrderingInventoryLocation(
  supplierProductId: string,
  warehouse: "freezer" | "dry-store",
  locationCode: string,
  equivalentQuantity: number
): Promise<void> {
  if (!supplierProductId || !Number.isFinite(equivalentQuantity) || equivalentQuantity < 0) {
    throw new Error("库存数量无效。 ");
  }
  const response = await fetch("/api/inventory-db", { method: "GET" });
  if (!response.ok) throw new Error("库存读取失败，请稍后重试。 ");
  const database = await response.json() as {
    freezer?: Array<Record<string, unknown>>;
    dryStore?: Array<Record<string, unknown>>;
  };
  const key = warehouse === "freezer" ? "freezer" : "dryStore";
  const entries = Array.isArray(database[key]) ? database[key]! : [];
  const index = entries.findIndex((entry) => {
    const supplierProduct = entry.supplierProduct as { id?: unknown } | undefined;
    return supplierProduct?.id === supplierProductId && entry.locationCode === locationCode;
  });
  if (index < 0) throw new Error("未找到该位置的库存记录。 ");
  const current = entries[index];
  const currentUnit = typeof current.unit === "string" && current.unit.trim() ? current.unit.trim() : "case";
  const { fullPackageCount: _full, loosePackageCount: _loose, openPackagePercent: _open, ...rest } = current;
  entries[index] = {
    ...rest,
    quantity: equivalentQuantity,
    quantityText: `${equivalentQuantity} ${currentUnit}`,
    unit: currentUnit
  };
  const saved = await fetch("/api/inventory-db", {
    body: JSON.stringify({ ...database, [key]: entries }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  if (!saved.ok) throw new Error("库存保存失败，请稍后重试。 ");
}

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method
  };
}

async function readOrderingResponse<T>(url: string, options: RequestInit, acceptNonOk?: (response: Response, payload: unknown) => boolean): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("网络连接失败，请检查网络后重试。");
  }
  const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | T | null;
  if (!response.ok && !acceptNonOk?.(response, payload)) {
    const code =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error?.code === "string"
        ? payload.error.code
        : "";
    throw new Error(chineseErrorMessages[code] ?? "请求失败，请稍后重试。");
  }
  return payload as T;
}
