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
