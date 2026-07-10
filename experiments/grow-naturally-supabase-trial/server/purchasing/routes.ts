import type Database from "better-sqlite3";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  confirmWhiteboardScan,
  getScanImage,
  saveDraftScan,
  type ConfirmedWhiteboardItem,
  type HistoricalRecommendationFields
} from "./database";
import { PurchasingApiError } from "./errors";
import { prepareWhiteboardImage, type PreparedWhiteboardImage, type WhiteboardImageInput } from "./imagePreparation";
import { recommendHistoricalProduct, type HistoricalInventoryEntry, type HistoricalProductCandidate } from "./matching";
import { readMultipartImage } from "./multipart";
import { recogniseWhiteboard, type WhiteboardImageForRecognition } from "./openaiWhiteboard";

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
  model?: string;
  prepareImage?: (input: WhiteboardImageInput) => Promise<PreparedWhiteboardImage>;
  recognise?: (image: WhiteboardImageForRecognition) => ReturnType<typeof recogniseWhiteboard>;
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

export function installPurchasingRoutes(server: PurchasingMiddlewareServer, options: PurchasingRouteOptions) {
  const prepareImage = options.prepareImage ?? prepareWhiteboardImage;
  const recognise = options.recognise ?? recogniseWhiteboard;
  const historicalCandidates = options.historicalCandidates ?? (() => []);
  const historicalInventoryEntries = options.historicalInventoryEntries ?? (() => []);

  server.middlewares.use(async (request, response, next) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (pathname !== "/api/purchasing" && !pathname.startsWith("/api/purchasing/")) {
        next();
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
  response.setHeader("Allow", "GET, POST");
  sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "不支持的请求方法。" } });
}

function notFound(response: ServerResponse) {
  sendJson(response, 404, { error: { code: "NOT_FOUND", message: "未找到采购扫描记录。" } });
}
