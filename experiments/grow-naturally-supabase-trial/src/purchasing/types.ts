export type WhiteboardRecognitionItem = {
  department: string | null;
  raw_text: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  confidence: number;
};

export type WhiteboardRecognition = {
  items: WhiteboardRecognitionItem[];
  unreadable_text: string[];
  general_notes: string | null;
};

export type WhiteboardReviewItem = WhiteboardRecognitionItem & {
  clientId: string;
  manualReviewed: boolean;
};

export type PurchaseIntakeSource = "camera" | "image" | "pdf" | "spreadsheet";

export type HistoricalProductCard = {
  currentInventoryQuantity: number | null;
  id: string;
  isRecommended: boolean;
  latestPrice: number;
  latestPurchaseDate: string;
  packSize: string;
  productName: string;
  purchaseCount: number;
  supplierCode: string;
  supplierName: string;
  supplierProductCode: string;
};

export type PurchaseIntakeReviewItem = WhiteboardReviewItem & {
  currentInventoryQuantity?: number | null;
  matchQueryName?: string;
  supplierCode: string | null;
  supplierLastPrice: number | null;
  supplierLastPurchaseDate: string | null;
  supplierName: string | null;
  supplierPackSize: string | null;
  supplierProductCode: string | null;
  supplierProductId: string | null;
  supplierProductName: string | null;
  supplierPurchaseCount: number | null;
};

export type PurchaseIntakeResponse = {
  generalNotes: string | null;
  intakeId: string;
  items: WhiteboardRecognitionItem[];
  originalFilename: string;
  sourceType: PurchaseIntakeSource;
  sourceUrl: string;
  unreadableText: string[];
};
