import sharp, { type Metadata } from "sharp";
import convertHeic from "heic-convert";
import { PurchasingApiError } from "./errors";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024;
export const MAX_LONG_EDGE = 2048;

type DecodedImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export type PreparedWhiteboardImage = {
  buffer: Buffer;
  storedMimeType: "image/jpeg" | "image/png" | "image/webp";
  originalSizeBytes: number;
  storedSizeBytes: number;
  width: number;
  height: number;
};

export type WhiteboardImageInput = {
  buffer: Buffer;
  filename: string;
  browserMimeType: string;
};

export function mapSharpFormatToMimeType(format: string | undefined): DecodedImageMimeType | null {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heif":
      return "image/heic";
    default:
      return null;
  }
}

export async function prepareWhiteboardImage(input: WhiteboardImageInput): Promise<PreparedWhiteboardImage> {
  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    throw new PurchasingApiError("IMAGE_TOO_LARGE");
  }

  let metadata: Metadata;

  try {
    metadata = await sharp(input.buffer, { failOn: "error", pages: 1 }).metadata();
  } catch {
    throw new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT");
  }

  const decodedMimeType = mapSharpFormatToMimeType(metadata.format);
  const width = metadata.width;
  const height = metadata.height;

  if (!decodedMimeType || !width || !height) {
    throw new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT");
  }

  const requiresAutoRotation = metadata.orientation !== undefined && metadata.orientation !== 1;
  const shouldConvert =
    decodedMimeType === "image/heic" ||
    input.buffer.length > COMPRESSION_THRESHOLD_BYTES ||
    Math.max(width, height) > MAX_LONG_EDGE ||
    requiresAutoRotation;

  if (!shouldConvert) {
    try {
      await sharp(input.buffer, { failOn: "error", pages: 1 }).raw().toBuffer();
    } catch {
      throw new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT");
    }

    return {
      buffer: input.buffer,
      storedMimeType: decodedMimeType,
      originalSizeBytes: input.buffer.length,
      storedSizeBytes: input.buffer.length,
      width,
      height
    };
  }

  try {
    let sourceBuffer = input.buffer;
    let output;

    try {
      output = await convertToWebp(sourceBuffer);
    } catch (error) {
      if (decodedMimeType !== "image/heic") {
        throw error;
      }

      sourceBuffer = Buffer.from(
        await convertHeic({ buffer: input.buffer, format: "JPEG", quality: 0.92 })
      );
      output = await convertToWebp(sourceBuffer);
    }

    return {
      buffer: output.data,
      storedMimeType: "image/webp",
      originalSizeBytes: input.buffer.length,
      storedSizeBytes: output.data.length,
      width: output.info.width,
      height: output.info.height
    };
  } catch {
    throw new PurchasingApiError("UNSUPPORTED_IMAGE_FORMAT");
  }
}

function convertToWebp(buffer: Buffer) {
  return sharp(buffer, { failOn: "error", pages: 1 })
    .rotate()
    .resize({
      width: MAX_LONG_EDGE,
      height: MAX_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
}
