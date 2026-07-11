import type Database from "better-sqlite3";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { PurchasingApiError, type PurchasingApiErrorCode } from "../purchasing/errors";
import type { HistoricalProductCandidate } from "../purchasing/matching";
import {
  addBatchItem,
  addReadyIntakeToBatch,
  acknowledgeRestockOnly,
  deleteBatchItem,
  getBatchDetail,
  getOrderingIntakeForTransfer,
  getOrderingProfile,
  getOrCreateDraftBatch,
  listReadyOrderingIntakes,
  markSupplierOrdered,
  prepareSupplierGroup,
  recordInventoryRecheck,
  saveBatchPo,
  saveBrakesQuickAddResults,
  saveSupplierEmailDraft,
  saveOrderingProfile,
  updateBatchItem
} from "./database";
import { inventoryDeepLink, type OrderingInventorySnapshot } from "./inventory";
import { buildRetryQueue } from "./brakesQuickAdd";
import type { BrakesQuickAddRunner, PurchaseBatch, PurchaseBatchItem, SupplierGroup } from "./types";

type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void
) => void | Promise<void>;

export type OrderingMiddlewareServer = {
  middlewares: {
    use: (handler: RouteHandler) => void;
  };
};

export type OrderingRouteOptions = {
  database: Database.Database;
  historicalCandidates?: () => HistoricalProductCandidate[] | Promise<HistoricalProductCandidate[]>;
  orderingInventory?: () =>
    | Map<string, OrderingInventorySnapshot>
    | Promise<Map<string, OrderingInventorySnapshot>>;
  quickAdd?: BrakesQuickAddRunner;
  brakesQuickAddRunner?: BrakesQuickAddRunner;
};

const supplierGroupSchema = z.enum(["CMP", "MM", "BRK", "UNMATCHED"]);
const positiveQuantitySchema = z.number().finite().positive();
const matchedItemSchema = z
  .object({
    supplierProductId: z.string().trim().min(1),
    orderQuantity: positiveQuantitySchema
  })
  .strict();
const manualItemSchema = z
  .object({
    productName: z.string().trim().min(1),
    orderQuantity: positiveQuantitySchema,
    orderUnit: z.string().trim().min(1),
    supplierGroup: supplierGroupSchema,
    supplierProductCode: z.string().trim().min(1).optional()
  })
  .strict();
const addItemSchema = z.union([matchedItemSchema, manualItemSchema]);
const updateItemSchema = z
  .object({
    productName: z.string().trim().min(1).optional(),
    orderQuantity: positiveQuantitySchema.optional(),
    orderUnit: z.string().trim().min(1).optional(),
    supplierGroup: supplierGroupSchema.optional(),
    supplierProductCode: z.string().trim().min(1).nullable().optional(),
    supplierProductId: z.string().trim().min(1).nullable().optional()
  })
  .strict();
const poSchema = z.object({ poNumber: z.string() }).strict();
const emailSchema = z.union([z.literal(""), z.string().email()]);
const profileSchema = z
  .object({
    purchaserName: z.string(),
    hotelName: z.string(),
    campbellsEmail: emailSchema,
    markMurphyEmail: emailSchema
  })
  .strict();
const supplierEmailDraftSchema = z
  .object({
    to: z.string().trim().min(1),
    subject: z.string().trim().min(1),
    body: z.string().trim().min(1)
  })
  .strict();

const orderingErrorCodes = new Set<PurchasingApiErrorCode>([
  "INVALID_ORDERING_DATA",
  "PO_REQUIRED",
  "ORDERING_PROFILE_REQUIRED",
  "SUPPLIER_NOT_PREPARED",
  "INVALID_ORDER_QUANTITY",
  "SUPPLIER_PRODUCT_NOT_FOUND",
  "INTAKE_NOT_READY_FOR_ORDER",
  "INTAKE_ALREADY_ADDED",
  "ORDER_BATCH_NOT_FOUND",
  "ORDER_BATCH_ITEM_NOT_FOUND"
]);

export function installOrderingRoutes(server: OrderingMiddlewareServer, options: OrderingRouteOptions): void {
  const historicalCandidates = options.historicalCandidates ?? (() => []);
  const orderingInventory = options.orderingInventory ?? (() => new Map());
  const quickAdd = options.brakesQuickAddRunner ?? options.quickAdd;

  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/api/ordering" && !url.pathname.startsWith("/api/ordering/")) {
      next();
      return;
    }

    try {
      if (url.pathname === "/api/ordering/current") {
        requireMethod(request, "GET");
        const batch = getOrCreateDraftBatch(options.database);
        sendJson(response, 200, {
          batch: await enrichBatch(batch, await orderingInventory()),
          readyIntakes: listReadyOrderingIntakes(options.database)
        });
        return;
      }

      const intakeMatch = url.pathname.match(/^\/api\/ordering\/current\/intakes\/([^/]+)$/);
      if (intakeMatch) {
        requireMethod(request, "POST");
        const intakeId = decodeURIComponent(intakeMatch[1]);
        const intake = getOrderingIntakeForTransfer(options.database, intakeId);
        const candidates = await historicalCandidates();
        const rows = intake.items.map((item) => canonicalIntakeRow(item, candidates));
        const batch = getOrCreateDraftBatch(options.database);
        const imported = addReadyIntakeToBatch(options.database, {
          batchId: batch.id,
          intakeId,
          rows
        });
        sendJson(response, 200, {
          batch: await enrichBatch(imported, await orderingInventory()),
          intakeStatus: "AddedToOrder",
          readyIntakes: listReadyOrderingIntakes(options.database)
        });
        return;
      }

      if (url.pathname === "/api/ordering/profile") {
        if (request.method === "GET") {
          sendJson(response, 200, getOrderingProfile(options.database));
          return;
        }
        requireMethod(request, "PUT");
        const parsed = profileSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw new PurchasingApiError("INVALID_ORDERING_DATA");
        sendJson(response, 200, saveOrderingProfile(options.database, parsed.data));
        return;
      }

      const poMatch = url.pathname.match(/^\/api\/ordering\/batches\/([^/]+)\/po$/);
      if (poMatch) {
        requireMethod(request, "PUT");
        const parsed = poSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw new PurchasingApiError("INVALID_ORDERING_DATA");
        if (!parsed.data.poNumber.trim()) throw new PurchasingApiError("PO_REQUIRED");
        const batch = saveBatchPo(options.database, decodeURIComponent(poMatch[1]), parsed.data.poNumber);
        sendJson(response, 200, await enrichBatch(batch, await orderingInventory()));
        return;
      }

      const prepareMatch = url.pathname.match(
        /^\/api\/ordering\/batches\/([^/]+)\/suppliers\/(CMP|MM|BRK)\/prepare$/
      );
      if (prepareMatch) {
        requireMethod(request, "POST");
        const batchId = decodeURIComponent(prepareMatch[1]);
        const supplierCode = prepareMatch[2] as "CMP" | "MM" | "BRK";
        const batch = getBatchDetail(options.database, batchId);
        if (!batch.poNumber.trim()) throw new PurchasingApiError("PO_REQUIRED");
        if (supplierCode === "CMP" || supplierCode === "MM") {
          const profile = getOrderingProfile(options.database);
          const recipient = supplierCode === "CMP" ? profile.campbellsEmail : profile.markMurphyEmail;
          if (!profile.purchaserName.trim() || !profile.hotelName.trim() || !recipient.trim()) {
            throw new PurchasingApiError("ORDERING_PROFILE_REQUIRED");
          }
        }
        const result = prepareSupplierGroup(options.database, {
          batchId,
          supplierCode,
          inventory: await orderingInventory()
        });
        sendJson(response, 200, result);
        return;
      }

      const markOrderedMatch = url.pathname.match(
        /^\/api\/ordering\/batches\/([^/]+)\/suppliers\/(CMP|MM|BRK)\/mark-ordered$/
      );
      if (markOrderedMatch) {
        requireMethod(request, "POST");
        const batchId = decodeURIComponent(markOrderedMatch[1]);
        const supplierCode = markOrderedMatch[2] as "CMP" | "MM" | "BRK";
        const batch = getBatchDetail(options.database, batchId);
        const supplier = batch.suppliers.find((entry) => entry.supplierCode === supplierCode);
        if (supplier?.status !== "Prepared") throw new PurchasingApiError("SUPPLIER_NOT_PREPARED");
        const saved = markSupplierOrdered(options.database, { batchId, supplierCode });
        sendJson(response, 200, { batch: await enrichBatch(saved, await orderingInventory()) });
        return;
      }

      const emailDraftMatch = url.pathname.match(
        /^\/api\/ordering\/batches\/([^/]+)\/suppliers\/(CMP|MM)\/email-draft$/
      );
      if (emailDraftMatch) {
        requireMethod(request, "PUT");
        const parsed = supplierEmailDraftSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw new PurchasingApiError("INVALID_ORDERING_DATA");
        const batch = saveSupplierEmailDraft(options.database, {
          batchId: decodeURIComponent(emailDraftMatch[1]),
          supplierCode: emailDraftMatch[2] as "CMP" | "MM",
          draft: parsed.data
        });
        sendJson(response, 200, { batch: await enrichBatch(batch, await orderingInventory()) });
        return;
      }

      const quickAddMatch = url.pathname.match(
        /^\/api\/ordering\/batches\/([^/]+)\/suppliers\/BRK\/quick-add$/
      );
      if (quickAddMatch) {
        requireMethod(request, "POST");
        const batchId = decodeURIComponent(quickAddMatch[1]);
        const batch = getBatchDetail(options.database, batchId);
        if (!batch.poNumber.trim()) throw new PurchasingApiError("PO_REQUIRED");
        const brakesItems = batch.items.filter((item) => item.supplierGroup === "BRK");
        if (brakesItems.some((item) => !item.supplierProductCode?.trim())) {
          throw new PurchasingApiError("INVALID_ORDERING_DATA");
        }
        if (brakesItems.some((item) => !Number.isFinite(item.orderQuantity) || item.orderQuantity <= 0)) {
          throw new PurchasingApiError("INVALID_ORDER_QUANTITY");
        }
        const prepared = prepareSupplierGroup(options.database, {
          batchId,
          supplierCode: "BRK",
          inventory: await orderingInventory()
        });
        if (prepared.kind === "inventory-review-required") {
          sendJson(response, 409, prepared);
          return;
        }
        if (prepared.kind !== "brakes-ready" || !quickAdd) throw new PurchasingApiError("INVALID_ORDERING_DATA");
        const queue = buildRetryQueue(brakesItems.map((item) => ({
          itemId: item.id,
          productCode: item.supplierProductCode || "",
          quantity: item.orderQuantity,
          brakesStatus: item.brakesStatus
        })));
        for (const item of queue) {
          if (!item.productCode.trim()) throw new PurchasingApiError("INVALID_ORDERING_DATA");
          if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new PurchasingApiError("INVALID_ORDER_QUANTITY");
        }
        const results = queue.length > 0 ? await quickAdd.fill(queue) : [];
        const saved = saveBrakesQuickAddResults(options.database, { batchId, results });
        sendJson(response, 200, { batch: await enrichBatch(saved, await orderingInventory()), results });
        return;
      }

      const inventoryDecisionMatch = url.pathname.match(
        /^\/api\/ordering\/batches\/([^/]+)\/items\/([^/]+)\/(restock-only|recheck-inventory)$/
      );
      if (inventoryDecisionMatch) {
        requireMethod(request, "POST");
        const batchId = decodeURIComponent(inventoryDecisionMatch[1]);
        const itemId = decodeURIComponent(inventoryDecisionMatch[2]);
        const item = requireBatchItem(options.database, batchId, itemId);
        if (!item.supplierProductId) throw new PurchasingApiError("INVALID_ORDERING_DATA");
        const snapshot = (await orderingInventory()).get(item.supplierProductId);
        if (!snapshot) throw new PurchasingApiError("INVALID_ORDERING_DATA");
        if (inventoryDecisionMatch[3] === "restock-only") {
          acknowledgeRestockOnly(options.database, { batchId, itemId, snapshot });
        } else {
          recordInventoryRecheck(options.database, { batchId, itemId, snapshot });
        }
        sendJson(response, 200, {
          batch: await enrichBatch(getBatchDetail(options.database, batchId), await orderingInventory())
        });
        return;
      }

      const itemMatch = url.pathname.match(/^\/api\/ordering\/batches\/([^/]+)\/items\/([^/]+)$/);
      if (itemMatch) {
        const batchId = decodeURIComponent(itemMatch[1]);
        const itemId = decodeURIComponent(itemMatch[2]);
        if (request.method === "DELETE") {
          const batch = deleteBatchItem(options.database, batchId, itemId);
          sendJson(response, 200, { batch: await enrichBatch(batch, await orderingInventory()) });
          return;
        }
        requireMethod(request, "PUT");
        const parsed = updateItemSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw invalidUpdateError(parsed.error.issues);
        const existing = requireBatchItem(options.database, batchId, itemId);
        const candidates = await historicalCandidates();
        const input = updateInput(existing, parsed.data, candidates);
        const batch = updateBatchItem(options.database, { batchId, itemId, ...input });
        sendJson(response, 200, { batch: await enrichBatch(batch, await orderingInventory()) });
        return;
      }

      const itemsMatch = url.pathname.match(/^\/api\/ordering\/batches\/([^/]+)\/items$/);
      if (itemsMatch) {
        requireMethod(request, "POST");
        const parsed = addItemSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) throw invalidAddError(parsed.error.issues);
        const batchId = decodeURIComponent(itemsMatch[1]);
        const input =
          "supplierProductId" in parsed.data
            ? matchedDatabaseInput(requireCandidate(await historicalCandidates(), parsed.data.supplierProductId), parsed.data.orderQuantity)
            : parsed.data;
        const batch = addBatchItem(options.database, { batchId, ...input });
        sendJson(response, 200, { batch: await enrichBatch(batch, await orderingInventory()) });
        return;
      }

      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "未找到下单接口。" } });
    } catch (error) {
      sendError(response, error);
    }
  });
}

function requireBatchItem(database: Database.Database, batchId: string, itemId: string): PurchaseBatchItem {
  const item = getBatchDetail(database, batchId).items.find((entry) => entry.id === itemId);
  if (!item) throw new PurchasingApiError("ORDER_BATCH_ITEM_NOT_FOUND");
  return item;
}

function updateInput(
  existing: PurchaseBatchItem,
  input: z.infer<typeof updateItemSchema>,
  candidates: HistoricalProductCandidate[]
) {
  const keys = Object.keys(input);
  const requestedProductId = input.supplierProductId === undefined ? existing.supplierProductId : input.supplierProductId;
  if (input.supplierProductId === null) {
    if (
      input.productName === undefined ||
      input.orderQuantity === undefined ||
      input.orderUnit === undefined ||
      input.supplierGroup === undefined
    ) {
      throw new PurchasingApiError("INVALID_ORDERING_DATA");
    }
    return {
      productName: input.productName,
      orderQuantity: input.orderQuantity,
      orderUnit: input.orderUnit,
      supplierGroup: input.supplierGroup,
      supplierProductId: null,
      supplierProductCode: input.supplierProductCode ?? null,
      supplierName: null,
      packSize: null,
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null
    };
  }
  if (requestedProductId) {
    if (keys.some((key) => key !== "supplierProductId" && key !== "orderQuantity")) {
      throw new PurchasingApiError("INVALID_ORDERING_DATA");
    }
    return matchedDatabaseInput(
      requireCandidate(candidates, requestedProductId),
      input.orderQuantity ?? existing.orderQuantity
    );
  }
  return input;
}

function canonicalIntakeRow(
  item: ReturnType<typeof getOrderingIntakeForTransfer>["items"][number],
  candidates: HistoricalProductCandidate[]
) {
  if (!Number.isFinite(item.quantity) || item.quantity === null || item.quantity <= 0) {
    throw new PurchasingApiError("INVALID_ORDER_QUANTITY");
  }
  if (item.supplierProductId) {
    return {
      id: item.id,
      rowOrder: item.rowOrder,
      ...matchedDatabaseInput(requireCandidate(candidates, item.supplierProductId), item.quantity)
    };
  }
  return {
    id: item.id,
    rowOrder: item.rowOrder,
    productName: item.productName,
    supplierGroup: isSupplierGroup(item.supplierCode ?? "") ? item.supplierCode as Exclude<SupplierGroup, "UNMATCHED"> : "UNMATCHED" as const,
    supplierProductId: null,
    supplierProductCode: item.supplierProductCode,
    supplierName: null,
    packSize: null,
    orderQuantity: item.quantity,
    orderUnit: item.unit?.trim() || "unit",
    lastPrice: null,
    purchaseCount: null,
    latestPurchaseDate: null
  };
}

function requireCandidate(candidates: HistoricalProductCandidate[], supplierProductId: string) {
  const candidate = candidates.find((entry) => entry.id === supplierProductId);
  if (!candidate || !isSupplierGroup(candidate.supplierCode)) {
    throw new PurchasingApiError("SUPPLIER_PRODUCT_NOT_FOUND");
  }
  return candidate as HistoricalProductCandidate & { supplierCode: Exclude<SupplierGroup, "UNMATCHED"> };
}

function matchedDatabaseInput(
  candidate: HistoricalProductCandidate & { supplierCode: Exclude<SupplierGroup, "UNMATCHED"> },
  orderQuantity: number
) {
  return {
    productName: candidate.productName,
    supplierGroup: candidate.supplierCode,
    supplierProductId: candidate.id,
    supplierProductCode: candidate.supplierProductCode,
    supplierName: candidate.supplierName,
    packSize: candidate.packSize,
    orderQuantity,
    orderUnit: candidate.packSize,
    lastPrice: candidate.latestPrice,
    purchaseCount: candidate.purchaseCount,
    latestPurchaseDate: candidate.latestPurchaseDate
  };
}

async function enrichBatch(batch: PurchaseBatch, inventory: Map<string, OrderingInventorySnapshot>) {
  return {
    ...batch,
    supplierGroups: batch.suppliers,
    items: batch.items.map((item) => {
      if (!item.supplierProductId) return item;
      const snapshot = inventory.get(item.supplierProductId);
      return {
        ...item,
        totalEquivalentQuantity: snapshot?.totalEquivalentQuantity ?? 0,
        locations: (snapshot?.locations ?? []).map((location) => ({
          ...location,
          deepLink: inventoryDeepLink(item.supplierProductId as string, location)
        }))
      };
    })
  };
}

function invalidAddError(issues: z.core.$ZodIssue[]) {
  return issues.some((issue) => issue.path.includes("orderQuantity"))
    ? new PurchasingApiError("INVALID_ORDER_QUANTITY")
    : new PurchasingApiError("INVALID_ORDERING_DATA");
}

function invalidUpdateError(issues: z.core.$ZodIssue[]) {
  return invalidAddError(issues);
}

function isSupplierGroup(value: string): value is Exclude<SupplierGroup, "UNMATCHED"> {
  return value === "CMP" || value === "MM" || value === "BRK";
}

function requireMethod(request: IncomingMessage, method: "GET" | "POST" | "PUT") {
  if (request.method !== method) {
    throw new MethodNotAllowedError(method);
  }
}

class MethodNotAllowedError extends Error {
  constructor(readonly allowedMethod: string) {
    super("METHOD_NOT_ALLOWED");
  }
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024 * 1024) throw new PurchasingApiError("INVALID_ORDERING_DATA");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PurchasingApiError("INVALID_ORDERING_DATA");
  }
}

function sendError(response: ServerResponse, error: unknown) {
  if (error instanceof MethodNotAllowedError) {
    response.setHeader("Allow", error.allowedMethod);
    sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法。" } });
    return;
  }
  const code = readOrderingErrorCode(error);
  if (code) {
    const apiError = error instanceof PurchasingApiError ? error : new PurchasingApiError(code);
    sendJson(response, apiError.status, { error: { code: apiError.code, message: apiError.message } });
    return;
  }
  sendJson(response, 500, { error: { code: "ORDERING_SERVICE_UNAVAILABLE", message: "下单服务暂时不可用。" } });
}

function readOrderingErrorCode(error: unknown): PurchasingApiErrorCode | null {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return null;
  return orderingErrorCodes.has(error.code as PurchasingApiErrorCode) ? (error.code as PurchasingApiErrorCode) : null;
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}
