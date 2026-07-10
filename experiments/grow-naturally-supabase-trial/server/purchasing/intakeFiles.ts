import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
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
      resolve(upload);
    });

    request.pipe(busboy);
  });
}
