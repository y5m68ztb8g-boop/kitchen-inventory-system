import Busboy from "busboy";
import convertHeic from "heic-convert";
import type { IncomingMessage } from "node:http";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import * as xlsx from "xlsx";
import { PurchasingApiError } from "./errors";

export const MAX_INTAKE_UPLOAD_BYTES = 25 * 1024 * 1024;

export const intakeMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv"
]);

export type IntakeUpload = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export function readMultipartIntakeFile(request: IncomingMessage): Promise<IntakeUpload> {
  return new Promise((resolve, reject) => {
    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: request.headers,
        limits: { fields: 0, fileSize: MAX_INTAKE_UPLOAD_BYTES + 1, files: 1 }
      });
    } catch {
      reject(new PurchasingApiError("UNSUPPORTED_INTAKE_FILE"));
      return;
    }

    let upload: IntakeUpload | null = null;
    let invalidUpload = false;
    let uploadTooLarge = false;
    let emptyUpload = false;

    busboy.on("file", (fieldName, file, info) => {
      if (fieldName !== "file" || upload !== null || !intakeMimeTypes.has(info.mimeType)) {
        invalidUpload = true;
        file.resume();
        return;
      }

      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("limit", () => {
        uploadTooLarge = true;
      });
      file.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (file.truncated || buffer.length > MAX_INTAKE_UPLOAD_BYTES) {
          uploadTooLarge = true;
          return;
        }
        if (buffer.length === 0) {
          emptyUpload = true;
          return;
        }
        upload = { buffer, filename: info.filename, mimeType: info.mimeType };
      });
    });
    busboy.on("filesLimit", () => {
      invalidUpload = true;
    });
    busboy.on("fieldsLimit", () => {
      invalidUpload = true;
    });
    busboy.on("error", () => reject(new PurchasingApiError("UNSUPPORTED_INTAKE_FILE")));
    busboy.on("finish", () => {
      if (uploadTooLarge) {
        reject(new PurchasingApiError("INTAKE_FILE_TOO_LARGE"));
        return;
      }
      if (emptyUpload) {
        reject(new PurchasingApiError("EMPTY_INTAKE_FILE"));
        return;
      }
      if (invalidUpload || upload === null) {
        reject(new PurchasingApiError("UNSUPPORTED_INTAKE_FILE"));
        return;
      }
      const completedUpload = upload;
      void validateIntakeUploadContent(completedUpload)
        .then(() => resolve(completedUpload))
        .catch(() => reject(new PurchasingApiError("UNSUPPORTED_INTAKE_FILE")));
    });

    request.pipe(busboy);
  });
}

async function validateIntakeUploadContent(upload: IntakeUpload) {
  if (upload.mimeType.startsWith("image/")) {
    await validateImage(upload);
    return;
  }

  if (upload.mimeType === "application/pdf") {
    await validatePdf(upload.buffer);
    return;
  }

  if (
    upload.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    upload.mimeType === "application/vnd.ms-excel"
  ) {
    const hasXlsxSignature = upload.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const hasXlsSignature = upload.buffer
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    if (
      (upload.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && !hasXlsxSignature) ||
      (upload.mimeType === "application/vnd.ms-excel" && !hasXlsSignature)
    ) {
      throw new Error("Invalid spreadsheet signature");
    }

    const workbook = xlsx.read(upload.buffer, { type: "buffer" });
    if (workbook.SheetNames.length === 0) {
      throw new Error("Spreadsheet has no worksheets");
    }
    return;
  }

  validateCsv(upload.buffer);
}

async function validateImage(upload: IntakeUpload) {
  const image = sharp(upload.buffer, { failOn: "error", pages: 1 });
  const metadata = await image.metadata();
  const expectedFormat =
    upload.mimeType === "image/jpeg"
      ? "jpeg"
      : upload.mimeType === "image/png"
        ? "png"
        : upload.mimeType === "image/webp"
          ? "webp"
          : "heif";
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.format !== expectedFormat ||
    (metadata.format === "heif" && metadata.compression === "av1")
  ) {
    throw new Error("Unsupported image content");
  }

  if (metadata.format === "heif") {
    const decoded = Buffer.from(await convertHeic({ buffer: upload.buffer, format: "JPEG", quality: 1 }));
    await sharp(decoded, { failOn: "error" }).raw().toBuffer();
    return;
  }

  await image.raw().toBuffer();
}

async function validatePdf(buffer: Buffer) {
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    throw new Error("Invalid PDF signature");
  }

  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const document = await loadingTask.promise;
  try {
    if (document.numPages < 1) {
      throw new Error("PDF has no pages");
    }
    await document.getPage(1);
  } finally {
    document.cleanup();
    await loadingTask.destroy();
  }
}

function validateCsv(buffer: Buffer) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (text.includes("\0") || !/[\r\n]/.test(text) || !/[,;\t]/.test(text)) {
    throw new Error("Invalid CSV content");
  }

  const workbook = xlsx.read(buffer, { type: "buffer", raw: true });
  if (workbook.SheetNames.length === 0) {
    throw new Error("CSV has no readable rows");
  }
}
