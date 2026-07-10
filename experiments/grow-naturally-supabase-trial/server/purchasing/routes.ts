import type Database from "better-sqlite3";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  confirmWhiteboardScan,
  getIntakeSource,
  getScanImage,
  handOffIntakeToPurchasing,
  listMatchFeedback,
  saveDraftScan,
  saveDraftIntake,
  savePendingIntake,
  type ConfirmedWhiteboardItem,
  type HistoricalRecommendationFields
} from "./database";
import { PurchasingApiError } from "./errors";
import { prepareWhiteboardImage, type PreparedWhiteboardImage, type WhiteboardImageInput } from "./imagePreparation";
import { recognisePurchaseSource, type PurchaseSourceForRecognition } from "./intakeRecognition";
import { readMultipartIntakeFile } from "./intakeFiles";
import type { PurchaseIntakeItem, SaveIntakeInput } from "./intakeSchema";
import {
  normaliseProductName,
  rankHistoricalProducts,
  rankHistoricalProductsForNormalisedName,
  recommendHistoricalProduct,
  type HistoricalInventoryEntry,
  type HistoricalMatchFeedback,
  type HistoricalProductCandidate,
  type RankedHistoricalProduct
} from "./matching";
import { readMultipartImage } from "./multipart";
import {
  recognisePurchasePdf,
  recogniseWhiteboard,
  type WhiteboardImageForRecognition
} from "./openaiWhiteboard";
import type { WhiteboardRecognition } from "../../src/purchasing/types";

type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: (error?: unknown) => void
) => void | Promise<void>;

type PurchasingMiddlewareServer = {
  middlewares: {
    use: (handler: RouteHandler) => void;
  };
};

export type PurchasingRouteOptions = {
  database: Database.Database;
  historicalCandidates?: () => HistoricalProductCandidate[] | Promise<HistoricalProductCandidate[]>;
  historicalInventoryEntries?: () => HistoricalInventoryEntry[] | Promise<HistoricalInventoryEntry[]>;
  intakeId?: () => string;
  model?: string;
  prepareImage?: (input: WhiteboardImageInput) => Promise<PreparedWhiteboardImage>;
  recognise?: (image: WhiteboardImageForRecognition) => ReturnType<typeof recogniseWhiteboard>;
  recognisePdf?: (source: PurchaseSourceForRecognition) => Promise<WhiteboardRecognition>;
  scanId?: () => string;
};

const confirmationItemSchema = z
  .object({
    clientId: z.string().min(1),
    confidence: z.number(),
    department: z.string().nullable(),
    manualReviewed: z.boolean(),
    notes: z.string().nullable(),
    product_name: z.string(),
    quantity: z.number().nullable(),
    raw_text: z.string(),
    unit: z.string().nullable()
  })
  .strict();

const confirmationSchema = z.object({ items: z.array(confirmationItemSchema).min(1) }).strict();

const intakeItemSchema = confirmationItemSchema
  .extend({
    currentInventoryQuantity: z.number().nullable().optional(),
    supplierCode: z.string().nullable().optional(),
    supplierLastPrice: z.number().nullable().optional(),
    supplierName: z.string().nullable().optional(),
    supplierPackSize: z.string().nullable().optional(),
    supplierProductCode: z.string().nullable().optional(),
    supplierProductId: z.string().nullable().optional(),
    supplierProductName: z.string().nullable().optional(),
    supplierPurchaseCount: z.number().int().nonnegative().nullable().optional(),
    supplierLastPurchaseDate: z.string().nullable().optional()
  })
  .strict();

const intakeUpdateSchema = z
  .object({
    generalNotes: z.string().nullable().optional(),
    items: z.array(intakeItemSchema).min(1)
  })
  .strict();

export function installPurchasingRoutes(server: PurchasingMiddlewareServer, options: PurchasingRouteOptions) {
  const prepareImage = options.prepareImage ?? prepareWhiteboardImage;
  const recognise = options.recognise ?? recogniseWhiteboard;
  const historicalCandidates = options.historicalCandidates ?? (() => []);
  const historicalInventoryEntries = options.historicalInventoryEntries ?? (() => []);
  const recognisePdf = options.recognisePdf ?? options.recognise ?? recognisePurchasePdf;

  server.middlewares.use(async (request, response, next) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (pathname !== "/api/purchasing" && !pathname.startsWith("/api/purchasing/")) {
        next();
        return;
      }

      if (pathname === "/api/purchasing/historical-products") {
        if (request.method !== "GET") {
          methodNotAllowed(response);
          return;
        }
        const rawQuery = url.searchParams.get("query")?.trim() ?? "";
        const normalisedQuery = normaliseProductName(rawQuery);
        const candidates = await historicalCandidates();
        const inventoryEntries = await historicalInventoryEntries();
        const feedback = listMatchFeedback(options.database, normalisedQuery);
        sendJson(response, 200, {
          items: rankedCandidateSearch(normalisedQuery, rawQuery, candidates, inventoryEntries, feedback),
          query: rawQuery
        });
        return;
      }

      if (pathname === "/api/purchasing/intakes/parse") {
        if (request.method !== "POST") {
          methodNotAllowed(response);
          return;
        }
        const upload = await readMultipartIntakeFile(request);
        const result = await recognisePurchaseSource(upload, {
          prepareImage,
          recogniseImage: (source) => recognise({ buffer: source.buffer, mimeType: source.mimeType }),
          recognisePdf
        });
        const intakeId = options.intakeId?.() ?? crypto.randomUUID();
        const items = result.recognition.items.map((item, index) => ({
          ...item,
          clientId: `row-${index + 1}`,
          manualReviewed: false
        }));
        saveDraftIntake(options.database, {
          aiModel: result.sourceType === "spreadsheet" ? null : options.model ?? process.env.OPENAI_WHITEBOARD_MODEL ?? "gpt-5.4-mini",
          generalNotes: result.recognition.general_notes,
          id: intakeId,
          items,
          originalFilename: upload.filename,
          originalMimeType: upload.mimeType,
          originalSizeBytes: upload.buffer.length,
          sourceBlob: result.storedBuffer,
          sourceType: result.sourceType,
          storedMimeType: result.storedMimeType,
          storedSizeBytes: result.storedBuffer.length,
          unreadableText: result.recognition.unreadable_text
        });
        sendJson(response, 201, {
          generalNotes: result.recognition.general_notes,
          intakeId,
          items: result.recognition.items,
          originalFilename: upload.filename,
          sourceType: result.sourceType,
          sourceUrl: `/api/purchasing/intakes/${encodeURIComponent(intakeId)}/source`,
          unreadableText: result.recognition.unreadable_text
        });
        return;
      }

      const intakeSourceMatch = pathname.match(/^\/api\/purchasing\/intakes\/([^/]+)\/source$/);
      if (intakeSourceMatch) {
        if (request.method !== "GET") {
          methodNotAllowed(response);
          return;
        }
        const source = getIntakeSource(options.database, decodeURIComponent(intakeSourceMatch[1]));
        if (!source) {
          throw new PurchasingApiError("INTAKE_NOT_FOUND");
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", source.mimeType);
        response.setHeader("Content-Length", String(source.buffer.length));
        response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(source.filename)}`);
        response.end(source.buffer);
        return;
      }

      const readyMatch = pathname.match(/^\/api\/purchasing\/intakes\/([^/]+)\/ready-for-purchase$/);
      if (readyMatch) {
        if (request.method !== "POST") {
          methodNotAllowed(response);
          return;
        }
        const intakeId = decodeURIComponent(readyMatch[1]);
        if (!getIntakeSource(options.database, intakeId)) {
          throw new PurchasingApiError("INTAKE_NOT_FOUND");
        }
        const update = intakeUpdateSchema.safeParse(await readJsonBody(request));
        if (!update.success) {
          throw new PurchasingApiError("INVALID_REVIEW_DATA");
        }
        const items = await enrichMatchedItems(
          update.data.items,
          await historicalCandidates(),
          await historicalInventoryEntries()
        );
        handOffIntakeToPurchasing(options.database, { intakeId, items });
        sendJson(response, 200, { intakeId, status: "ReadyForPurchase" });
        return;
      }

      const intakeMatch = pathname.match(/^\/api\/purchasing\/intakes\/([^/]+)$/);
      if (intakeMatch) {
        if (request.method !== "PUT") {
          methodNotAllowed(response);
          return;
        }
        const intakeId = decodeURIComponent(intakeMatch[1]);
        const existing = readIntakeForSave(options.database, intakeId);
        if (!existing) {
          throw new PurchasingApiError("INTAKE_NOT_FOUND");
        }
        const update = intakeUpdateSchema.safeParse(await readJsonBody(request));
        if (!update.success) {
          throw new PurchasingApiError("INVALID_REVIEW_DATA");
        }
        const items = await enrichMatchedItems(
          update.data.items,
          await historicalCandidates(),
          await historicalInventoryEntries()
        );
        savePendingIntake(options.database, {
          ...existing,
          generalNotes: update.data.generalNotes ?? existing.generalNotes,
          items
        });
        sendJson(response, 200, { intakeId, status: "Pending" });
        return;
      }

      if (pathname === "/api/purchasing/scan-whiteboard") {
        if (request.method !== "POST") {
          methodNotAllowed(response);
          return;
        }
        const upload = await readMultipartImage(request);
        const image = await prepareImage(upload);
        const recognition = await recognise({ buffer: image.buffer, mimeType: image.storedMimeType });
        const scanId = options.scanId?.() ?? crypto.randomUUID();
        saveDraftScan(options.database, {
          aiModel: options.model ?? process.env.OPENAI_WHITEBOARD_MODEL ?? "gpt-5.4-mini",
          generalNotes: recognition.general_notes,
          id: scanId,
          image: image.buffer,
          originalFilename: upload.filename,
          originalMimeType: upload.browserMimeType,
          originalSizeBytes: image.originalSizeBytes,
          storedMimeType: image.storedMimeType,
          storedSizeBytes: image.storedSizeBytes,
          unreadableText: recognition.unreadable_text
        });
        sendJson(response, 201, {
          scanId,
          imageUrl: `/api/purchasing/whiteboard-scans/${encodeURIComponent(scanId)}/image`,
          items: recognition.items,
          unreadableText: recognition.unreadable_text,
          generalNotes: recognition.general_notes
        });
        return;
      }

      const imageMatch = pathname.match(/^\/api\/purchasing\/whiteboard-scans\/([^/]+)\/image$/);
      if (imageMatch) {
        if (request.method !== "GET") {
          methodNotAllowed(response);
          return;
        }
        const scan = getScanImage(options.database, decodeURIComponent(imageMatch[1]));
        if (!scan) {
          notFound(response);
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", scan.mimeType);
        response.setHeader("Content-Length", String(scan.buffer.length));
        response.end(scan.buffer);
        return;
      }

      const confirmMatch = pathname.match(/^\/api\/purchasing\/whiteboard-scans\/([^/]+)\/confirm$/);
      if (confirmMatch) {
        if (request.method !== "POST") {
          methodNotAllowed(response);
          return;
        }
        const scanId = decodeURIComponent(confirmMatch[1]);
        if (!getScanImage(options.database, scanId)) {
          notFound(response);
          return;
        }
        const confirmation = confirmationSchema.safeParse(await readJsonBody(request));
        if (!confirmation.success) {
          throw new PurchasingApiError("INVALID_REVIEW_DATA");
        }
        const candidates = await historicalCandidates();
        const inventoryEntries = await historicalInventoryEntries();
        const items = confirmation.data.items.map((item) => {
          const recommendation = recommendHistoricalProduct({
            candidates,
            inventoryEntries,
            productName: item.product_name
          });
          return { ...item, ...(recommendation ?? {}) } satisfies ConfirmedWhiteboardItem;
        });
        confirmWhiteboardScan(options.database, { items, scanId });
        sendJson(response, 200, {
          scanId,
          status: "Pending",
          items: items.map((item) => ({
            clientId: item.clientId,
            productName: item.product_name,
            recommendation: recommendationFor(item)
          }))
        });
        return;
      }

      notFound(response);
    } catch (error) {
      sendError(response, error);
    }
  });
}

function readIntakeForSave(database: Database.Database, intakeId: string): SaveIntakeInput | null {
  const row = database
    .prepare(
      `SELECT id, source_type, original_filename, original_mime_type, stored_mime_type,
              original_size_bytes, stored_size_bytes, source_blob, ai_model,
              unreadable_text_json, general_notes
         FROM purchase_intakes
        WHERE id = ?`
    )
    .get(intakeId) as
    | {
        ai_model: string | null;
        general_notes: string | null;
        id: string;
        original_filename: string;
        original_mime_type: string;
        original_size_bytes: number;
        source_blob: Buffer;
        source_type: SaveIntakeInput["sourceType"];
        stored_mime_type: string;
        stored_size_bytes: number;
        unreadable_text_json: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    aiModel: row.ai_model,
    generalNotes: row.general_notes,
    id: row.id,
    items: [],
    originalFilename: row.original_filename,
    originalMimeType: row.original_mime_type,
    originalSizeBytes: row.original_size_bytes,
    sourceBlob: row.source_blob,
    sourceType: row.source_type,
    storedMimeType: row.stored_mime_type,
    storedSizeBytes: row.stored_size_bytes,
    unreadableText: parseStringArray(row.unreadable_text_json)
  };
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function enrichMatchedItems(
  items: PurchaseIntakeItem[],
  candidates: HistoricalProductCandidate[],
  inventoryEntries: HistoricalInventoryEntry[]
) {
  return items.map((item) => {
    if (!item.supplierProductId) {
      return item;
    }
    const candidate = candidates.find((entry) => entry.id === item.supplierProductId);
    if (!candidate) {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }
    const [card] = rankHistoricalProducts({
      candidates: [candidate],
      inventoryEntries,
      productName: candidate.productName
    });
    return {
      ...item,
      currentInventoryQuantity: card.currentInventoryQuantity,
      supplierCode: candidate.supplierCode,
      supplierLastPrice: candidate.latestPrice,
      supplierLastPurchaseDate: candidate.latestPurchaseDate,
      supplierName: candidate.supplierName,
      supplierPackSize: candidate.packSize,
      supplierProductCode: candidate.supplierProductCode,
      supplierProductName: candidate.productName,
      supplierPurchaseCount: candidate.purchaseCount
    };
  });
}

function rankedCandidateSearch(
  normalisedQuery: string,
  rawQuery: string,
  candidates: HistoricalProductCandidate[],
  inventoryEntries: HistoricalInventoryEntry[],
  feedback: HistoricalMatchFeedback[]
) {
  const ranked = rankHistoricalProductsForNormalisedName({
    candidates,
    feedback,
    inventoryEntries,
    normalisedProductName: normalisedQuery
  });
  const rankedIds = new Set(ranked.map((candidate) => candidate.id));
  const queryTokens = new Set(normalisedQuery.split(" ").filter(Boolean));
  const compactQuery = rawQuery
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^f(?=\d)/, "");
  const fallback = candidates
    .filter((candidate) => {
      if (rankedIds.has(candidate.id)) {
        return false;
      }
      const candidateTokens = normaliseProductName(candidate.productName).split(" ");
      const sharesToken = candidateTokens.some((token) => queryTokens.has(token));
      const compactCode = candidate.supplierProductCode
        .toLocaleLowerCase("en-GB")
        .replace(/[^a-z0-9]/g, "")
        .replace(/^f(?=\d)/, "");
      const supplierNameMatches = normaliseProductName(candidate.supplierName).includes(normalisedQuery);
      const compactSupplierCode = candidate.supplierCode.toLocaleLowerCase("en-GB").replace(/[^a-z0-9]/g, "");
      return (
        sharesToken ||
        (normalisedQuery.length > 1 && supplierNameMatches) ||
        (compactQuery.length > 1 && (compactCode.includes(compactQuery) || compactSupplierCode.includes(compactQuery)))
      );
    })
    .map((candidate) => candidateCard(candidate, inventoryEntries))
    .sort(
      (left, right) =>
        right.purchaseCount - left.purchaseCount ||
        Date.parse(right.latestPurchaseDate) - Date.parse(left.latestPurchaseDate) ||
        left.id.localeCompare(right.id)
    );

  return [...ranked, ...fallback].map((candidate, index) => ({
    ...candidate,
    isRecommended: index === 0
  }));
}

function candidateCard(
  candidate: HistoricalProductCandidate,
  inventoryEntries: HistoricalInventoryEntry[]
): RankedHistoricalProduct {
  const [card] = rankHistoricalProducts({
    candidates: [candidate],
    inventoryEntries,
    productName: candidate.productName
  });
  return { ...card, isRecommended: false, score: 0 };
}

function recommendationFor(item: ConfirmedWhiteboardItem): HistoricalRecommendationFields | null {
  return item.recommendedSupplierProductId === undefined
    ? null
    : {
        currentInventoryQuantity: item.currentInventoryQuantity ?? null,
        recommendedLastPrice: item.recommendedLastPrice ?? null,
        recommendedLastPurchaseDate: item.recommendedLastPurchaseDate ?? null,
        recommendedPackSize: item.recommendedPackSize ?? null,
        recommendedProductCode: item.recommendedProductCode ?? null,
        recommendedProductName: item.recommendedProductName ?? null,
        recommendedPurchaseCount: item.recommendedPurchaseCount ?? null,
        recommendedSupplierCode: item.recommendedSupplierCode ?? null,
        recommendedSupplierName: item.recommendedSupplierName ?? null,
        recommendedSupplierProductId: item.recommendedSupplierProductId ?? null
      };
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024 * 1024) {
      throw new PurchasingApiError("INVALID_REVIEW_DATA");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PurchasingApiError("INVALID_REVIEW_DATA");
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function sendError(response: ServerResponse, error: unknown) {
  if (isPurchasingError(error)) {
    sendJson(response, error.status, {
      error: {
        code: error.code,
        message: error.code === "MISSING_API_KEY" ? "服务器尚未配置 AI 识别密钥。" : error.message
      }
    });
    return;
  }
  sendJson(response, 500, { error: { code: "AI_SERVICE_UNAVAILABLE", message: "识别服务暂时不可用，请稍后重试。" } });
}

function isPurchasingError(error: unknown): error is PurchasingApiError {
  return (
    error instanceof PurchasingApiError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error &&
      "status" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string" &&
      typeof error.status === "number")
  );
}

function methodNotAllowed(response: ServerResponse) {
  response.setHeader("Allow", "GET, POST, PUT");
  sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法。" } });
}

function notFound(response: ServerResponse) {
  sendJson(response, 404, { error: { code: "NOT_FOUND", message: "未找到采购扫描记录。" } });
}
