import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { WhiteboardRecognition } from "../../src/purchasing/types";
import { PurchasingApiError } from "./errors";
import { parseWhiteboardRecognition, whiteboardRecognitionSchema } from "./recognitionSchema";

export const WHITEBOARD_SYSTEM_INSTRUCTION = `Read handwritten English hotel purchasing lists from a whiteboard.
Recognise department headings such as Breakfast, Kitchen, Dinner, Bar, and Housekeeping. Return the relevant department for each item, or null when none is visible.
Preserve the visible original wording in raw_text. Correct only obvious spelling errors in product_name.
Never invent quantities, units, departments, products, or other details. Return null for any unreadable quantity, unit, or department.
Use lower confidence for ambiguous handwriting, grouping, units, quantities, or uncertain interpretation.`;

export const PURCHASE_DOCUMENT_INSTRUCTION = `Read this hotel purchasing document and return only explicit purchase-request items.
Preserve the visible original wording in raw_text and correct only obvious spelling mistakes in product_name.
Never invent products, quantities, units, departments, dates, guest counts, or event details. Return null when a quantity, unit, or department is absent or unreadable.
Put visible event, date, guest-count, delivery, or other purchasing context in general_notes without calculating purchase quantities from that context.
Use lower confidence for ambiguous text or uncertain interpretation.`;

export type OpenAIResponsesClient = {
  responses: {
    parse: (request: unknown) => Promise<{ output_parsed?: unknown }>;
  };
};

export type RecogniseWhiteboardConfig = {
  apiKey?: string;
  baseURL?: string;
  client?: OpenAIResponsesClient;
  clientFactory?: (options: { apiKey: string; baseURL?: string }) => OpenAIResponsesClient;
  model?: string;
};

export type WhiteboardImageForRecognition = {
  buffer: Buffer;
  mimeType: string;
};

export async function recogniseWhiteboard(
  image: WhiteboardImageForRecognition,
  config: RecogniseWhiteboardConfig = {}
): Promise<WhiteboardRecognition> {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new PurchasingApiError("MISSING_API_KEY");
  }

  const client = config.client ?? createConfiguredClient(apiKey, config);

  try {
    const response = await client.responses.parse({
      model: config.model ?? process.env.OPENAI_WHITEBOARD_MODEL ?? "gpt-5.4-mini",
      input: [
        { role: "system", content: WHITEBOARD_SYSTEM_INSTRUCTION },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Read this hotel purchase whiteboard." },
            { type: "input_image", image_url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` }
          ]
        }
      ],
      text: { format: zodTextFormat(whiteboardRecognitionSchema, "whiteboard_purchase_list") }
    });

    return parseWhiteboardRecognition(response.output_parsed);
  } catch (error) {
    if (error instanceof PurchasingApiError) {
      throw error;
    }
    throw new PurchasingApiError("AI_SERVICE_UNAVAILABLE");
  }
}

export async function recognisePurchasePdf(
  source: { buffer: Buffer; filename: string; mimeType: string },
  config: RecogniseWhiteboardConfig = {}
): Promise<WhiteboardRecognition> {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new PurchasingApiError("MISSING_API_KEY");
  }

  const client = config.client ?? createConfiguredClient(apiKey, config);
  try {
    const response = await client.responses.parse({
      model: config.model ?? process.env.OPENAI_WHITEBOARD_MODEL ?? "gpt-5.4-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: source.filename,
              file_data: `data:application/pdf;base64,${source.buffer.toString("base64")}`
            },
            { type: "input_text", text: PURCHASE_DOCUMENT_INSTRUCTION }
          ]
        }
      ],
      text: { format: zodTextFormat(whiteboardRecognitionSchema, "purchase_document") }
    });
    return parseWhiteboardRecognition(response.output_parsed);
  } catch (error) {
    if (error instanceof PurchasingApiError) {
      throw error;
    }
    throw new PurchasingApiError("AI_SERVICE_UNAVAILABLE");
  }
}

function createConfiguredClient(apiKey: string, config: RecogniseWhiteboardConfig) {
  const baseURL = config.baseURL ?? process.env.OPENAI_BASE_URL;
  return (config.clientFactory ?? createOpenAIClient)({
    apiKey,
    ...(baseURL?.trim() ? { baseURL: baseURL.trim() } : {})
  });
}

function createOpenAIClient(options: { apiKey: string; baseURL?: string }) {
  return new OpenAI(options) as unknown as OpenAIResponsesClient;
}
