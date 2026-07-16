import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import { MAX_UPLOAD_BYTES } from "./imagePreparation";
import { PurchasingApiError } from "./errors";

export type MultipartImage = {
  buffer: Buffer;
  browserMimeType: string;
  filename: string;
};

export function readMultipartImage(request: IncomingMessage): Promise<MultipartImage> {
  return new Promise((resolve, reject) => {
    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: request.headers,
        limits: { fields: 0, fileSize: MAX_UPLOAD_BYTES + 1, files: 1 }
      });
    } catch {
      reject(new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT"));
      return;
    }

    let image: MultipartImage | null = null;
    let invalidUpload = false;
    let uploadTooLarge = false;

    busboy.on("file", (fieldName, file, info) => {
      if (fieldName !== "image" || image !== null) {
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
        if (file.truncated || buffer.length > MAX_UPLOAD_BYTES) {
          uploadTooLarge = true;
          return;
        }
        image = {
          buffer,
          browserMimeType: info.mimeType,
          filename: info.filename
        };
      });
    });
    busboy.on("filesLimit", () => {
      invalidUpload = true;
    });
    busboy.on("fieldsLimit", () => {
      invalidUpload = true;
    });
    busboy.on("error", () => reject(new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT")));
    busboy.on("finish", () => {
      if (uploadTooLarge) {
        reject(new PurchasingApiError("IMAGE_TOO_LARGE"));
        return;
      }
      if (invalidUpload || image === null) {
        reject(new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT"));
        return;
      }
      resolve(image);
    });

    request.pipe(busboy);
  });
}
