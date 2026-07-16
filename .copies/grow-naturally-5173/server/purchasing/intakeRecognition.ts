import * as xlsx from "xlsx";
import type { WhiteboardRecognition, WhiteboardRecognitionItem } from "../../src/purchasing/types";
import { PurchasingApiError } from "./errors";
import type { PreparedWhiteboardImage, WhiteboardImageInput } from "./imagePreparation";
import type { IntakeUpload } from "./intakeFiles";

export type PurchaseSourceForRecognition = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export type RecognisedPurchaseSource = {
  recognition: WhiteboardRecognition;
  sourceType: "image" | "pdf" | "spreadsheet";
  storedBuffer: Buffer;
  storedMimeType: string;
};

export type RecognisePurchaseSourceConfig = {
  prepareImage: (input: WhiteboardImageInput) => Promise<PreparedWhiteboardImage>;
  recogniseImage: (source: PurchaseSourceForRecognition) => Promise<WhiteboardRecognition>;
  recognisePdf: (source: PurchaseSourceForRecognition) => Promise<WhiteboardRecognition>;
};

const headerAliases = {
  department: new Set(["department", "section"]),
  notes: new Set(["notes", "note", "comment"]),
  product: new Set(["product", "item", "description", "name", "productname"]),
  quantity: new Set(["quantity", "qty", "amount"]),
  unit: new Set(["unit", "uom"])
};

export async function recognisePurchaseSource(
  upload: IntakeUpload,
  config: RecognisePurchaseSourceConfig
): Promise<RecognisedPurchaseSource> {
  if (upload.mimeType.startsWith("image/")) {
    const prepared = await config.prepareImage({
      browserMimeType: upload.mimeType,
      buffer: upload.buffer,
      filename: upload.filename
    });
    return {
      recognition: await config.recogniseImage({
        buffer: prepared.buffer,
        filename: upload.filename,
        mimeType: prepared.storedMimeType
      }),
      sourceType: "image",
      storedBuffer: prepared.buffer,
      storedMimeType: prepared.storedMimeType
    };
  }

  if (upload.mimeType === "application/pdf") {
    return {
      recognition: await config.recognisePdf(upload),
      sourceType: "pdf",
      storedBuffer: upload.buffer,
      storedMimeType: upload.mimeType
    };
  }

  return {
    recognition: parseSpreadsheet(upload.buffer),
    sourceType: "spreadsheet",
    storedBuffer: upload.buffer,
    storedMimeType: upload.mimeType
  };
}

export function parseSpreadsheet(buffer: Buffer): WhiteboardRecognition {
  let workbook: xlsx.WorkBook;
  try {
    workbook = xlsx.read(buffer, { type: "buffer", raw: true });
  } catch {
    throw new PurchasingApiError("UNSUPPORTED_INTAKE_FILE");
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      blankrows: false,
      defval: null,
      header: 1,
      raw: true
    });
    if (!rows.some((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""))) {
      continue;
    }

    const items = itemsFromRows(rows);
    if (items.length === 0) {
      throw new PurchasingApiError("NO_READABLE_TEXT");
    }
    return { general_notes: null, items, unreadable_text: [] };
  }

  throw new PurchasingApiError("NO_READABLE_TEXT");
}

function itemsFromRows(rows: unknown[][]): WhiteboardRecognitionItem[] {
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));
  if (headerRowIndex < 0) {
    return [];
  }

  const headers = rows[headerRowIndex].map(normaliseHeader);
  const productIndex = findHeader(headers, headerAliases.product);
  if (productIndex < 0) {
    return [];
  }

  const departmentIndex = findHeader(headers, headerAliases.department);
  const quantityIndex = findHeader(headers, headerAliases.quantity);
  const unitIndex = findHeader(headers, headerAliases.unit);
  const notesIndex = findHeader(headers, headerAliases.notes);

  return rows.slice(headerRowIndex + 1).flatMap((row) => {
    const productName = cellText(row[productIndex]);
    if (!productName) {
      return [];
    }

    const visibleCells = row.map(cellText).filter((value): value is string => value !== null);
    return [
      {
        confidence: 1,
        department: departmentIndex >= 0 ? cellText(row[departmentIndex]) : null,
        notes: notesIndex >= 0 ? cellText(row[notesIndex]) : null,
        product_name: productName,
        quantity: quantityIndex >= 0 ? cellNumber(row[quantityIndex]) : null,
        raw_text: visibleCells.join(" | "),
        unit: unitIndex >= 0 ? cellText(row[unitIndex]) : null
      }
    ];
  });
}

function normaliseHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, "");
}

function findHeader(headers: string[], aliases: Set<string>) {
  return headers.findIndex((header) => aliases.has(header));
}

function cellText(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function cellNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const number = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(number) && number >= 0 ? number : null;
}
