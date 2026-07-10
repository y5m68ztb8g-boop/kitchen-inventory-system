import { z } from "zod";
import type { WhiteboardRecognition } from "../../src/purchasing/types";
import { PurchasingApiError } from "./errors";

const whiteboardRecognitionItemSchema = z
  .object({
    department: z.string().nullable(),
    raw_text: z.string(),
    product_name: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    notes: z.string().nullable(),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const whiteboardRecognitionSchema = z
  .object({
    items: z.array(whiteboardRecognitionItemSchema),
    unreadable_text: z.array(z.string()),
    general_notes: z.string().nullable()
  })
  .strict();

export function parseWhiteboardRecognition(value: unknown): WhiteboardRecognition {
  const parsed = whiteboardRecognitionSchema.safeParse(value);

  if (!parsed.success) {
    throw new PurchasingApiError("INVALID_AI_RESPONSE");
  }

  if (parsed.data.items.length === 0 && parsed.data.unreadable_text.length === 0) {
    throw new PurchasingApiError("NO_READABLE_TEXT");
  }

  return parsed.data;
}
