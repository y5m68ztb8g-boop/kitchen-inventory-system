import type {
  AddOrderingItemInput,
  CurrentOrderingResponse,
  OrderingProfile,
  PreparationResult,
  PurchaseBatch,
  SupplierEmailDraft,
  UpdateOrderingItemInput
} from "./types";

const chineseErrorMessages: Record<string, string> = {
  PO_REQUIRED: "请先填写 PO 再继续操作。",
  INVALID_ORDER_QUANTITY: "订购数量无效，请填写大于 0 的数字。",
  SUPPLIER_PRODUCT_NOT_FOUND: "未找到对应历史商品，商品信息已过期。",
  INTAKE_ALREADY_ADDED: "该采购清单已转入下单模块。",
  ORDER_BATCH_NOT_FOUND: "当前下单批次不存在。",
  ORDER_BATCH_ITEM_NOT_FOUND: "未找到该下单商品。",
  INTAKE_NOT_READY_FOR_ORDER: "该采购清单尚未准备好转入下单模块。",
  INVALID_ORDERING_DATA: "下单数据无效，请检查后重试。"
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

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method
  };
}

async function readOrderingResponse<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("网络连接失败，请检查网络后重试。");
  }
  const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | T | null;
  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error?.code === "string"
        ? payload.error.code
        : "";
    throw new Error(chineseErrorMessages[code] ?? "请求失败，请稍后重试。");
  }
  return payload as T;
}
