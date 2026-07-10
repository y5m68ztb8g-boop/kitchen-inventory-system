import type {
  HistoricalProductCard,
  PurchaseIntakeResponse,
  PurchaseIntakeReviewItem,
  WhiteboardRecognitionItem,
  WhiteboardReviewItem
} from "./types";

export type WhiteboardScanResponse = {
  generalNotes: string | null;
  imageUrl: string;
  items: WhiteboardRecognitionItem[];
  scanId: string;
  unreadableText: string[];
};

export type HistoricalRecommendation = {
  currentInventoryQuantity: number | null;
  recommendedLastPrice: number | null;
  recommendedLastPurchaseDate: string | null;
  recommendedPackSize: string | null;
  recommendedProductCode: string | null;
  recommendedProductName: string | null;
  recommendedPurchaseCount: number | null;
  recommendedSupplierCode: string | null;
  recommendedSupplierName: string | null;
  recommendedSupplierProductId: string | null;
};

export type WhiteboardConfirmationResponse = {
  items: Array<{
    clientId: string;
    productName: string;
    recommendation: HistoricalRecommendation | null;
  }>;
  scanId: string;
  status: "Pending";
};

const chineseErrorMessages: Record<string, string> = {
  AI_SERVICE_UNAVAILABLE: "识别服务暂时不可用，请稍后重试。",
  EMPTY_INTAKE_FILE: "不能上传空文件。",
  IMAGE_TOO_LARGE: "图片不能超过 15 MB。",
  INTAKE_FILE_TOO_LARGE: "文件不能超过 25 MB。",
  INTAKE_NOT_FOUND: "未找到这条采购信息。",
  INVALID_AI_RESPONSE: "识别结果格式无效，请重新识别。",
  INVALID_REVIEW_DATA: "请检查采购项目后再保存。",
  MISSING_API_KEY: "服务器尚未配置 AI 识别密钥。",
  NO_READABLE_TEXT: "未识别到可用的采购文字。",
  NOT_FOUND: "未找到采购扫描记录。",
  UNSUPPORTED_INTAKE_FILE: "请上传 JPG、PNG、HEIC、HEIF、WebP、PDF、XLSX、XLS 或 CSV 文件。",
  UNSUPPORTED_IMAGE_FORMAT: "请上传 JPG、PNG、HEIC、HEIF 或 WebP 图片。"
};

export async function parseIntake(file: File): Promise<PurchaseIntakeResponse> {
  const body = new FormData();
  body.append("file", file);
  return readPurchasingResponse<PurchaseIntakeResponse>("/api/purchasing/intakes/parse", {
    body,
    method: "POST"
  });
}

export async function savePendingIntake(intakeId: string, items: PurchaseIntakeReviewItem[]) {
  return readPurchasingResponse<{ intakeId: string; status: "Pending" }>(
    `/api/purchasing/intakes/${encodeURIComponent(intakeId)}`,
    {
      body: JSON.stringify({ items }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    }
  );
}

export async function readyForPurchase(intakeId: string, items: PurchaseIntakeReviewItem[]) {
  return readPurchasingResponse<{ intakeId: string; status: "ReadyForPurchase" }>(
    `/api/purchasing/intakes/${encodeURIComponent(intakeId)}/ready-for-purchase`,
    {
      body: JSON.stringify({ items }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
}

export async function searchHistoricalProducts(query: string) {
  const response = await readPurchasingResponse<{
    candidates?: HistoricalProductCard[];
    items?: HistoricalProductCard[];
  }>(`/api/purchasing/historical-products?query=${encodeURIComponent(query)}`, { method: "GET" });
  return { candidates: response?.candidates ?? response?.items ?? [] };
}

export async function scanWhiteboard(file: File): Promise<WhiteboardScanResponse> {
  const body = new FormData();
  body.append("image", file);

  return readPurchasingResponse<WhiteboardScanResponse>("/api/purchasing/scan-whiteboard", {
    body,
    method: "POST"
  });
}

export async function confirmWhiteboardScan(
  scanId: string,
  items: WhiteboardReviewItem[]
): Promise<WhiteboardConfirmationResponse> {
  return readPurchasingResponse<WhiteboardConfirmationResponse>(
    `/api/purchasing/whiteboard-scans/${encodeURIComponent(scanId)}/confirm`,
    {
      body: JSON.stringify({ items }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
}

async function readPurchasingResponse<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error("网络连接失败，请检查网络后重试。");
  }
  const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | T | null;

  if (!response.ok) {
    const code =
      payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error.code === "string"
        ? payload.error.code
        : "";
    throw new Error(chineseErrorMessages[code] ?? "请求失败，请稍后重试。");
  }

  return payload as T;
}
