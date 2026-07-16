// @vitest-environment node

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import * as xlsx from "xlsx";
import { readMultipartIntakeFile } from "../../server/purchasing/intakeFiles";
import {
  COMPRESSION_THRESHOLD_BYTES,
  mapSharpFormatToMimeType,
  prepareWhiteboardImage
} from "../../server/purchasing/imagePreparation";
import { parseWhiteboardRecognition } from "../../server/purchasing/recognitionSchema";

it("runs with the shared setup in the Node environment", () => {
  expect(typeof window).toBe("undefined");
});

async function makeTestImage(format: "jpeg" | "png" | "webp") {
  const image = sharp({
    create: { width: 32, height: 32, channels: 3, background: "white" }
  });

  switch (format) {
    case "jpeg":
      return image.jpeg().toBuffer();
    case "png":
      return image.png().toBuffer();
    case "webp":
      return image.webp().toBuffer();
  }
}

async function makePdfFixture() {
  return readFile(new URL("./fixtures/valid-test.pdf", import.meta.url));
}

function makeCorruptPdfFixture() {
  return Buffer.from("%PDF-1.7\n%%EOF\n");
}

async function makeHeicFixture() {
  return readFile(new URL("./fixtures/rainbow-hevc.heic", import.meta.url));
}

function makeSpreadsheetBuffer(sheetType: "xlsx" | "xls") {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["product_name", "quantity"],
    ["Bread rolls", "1"]
  ]);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return xlsx.write(workbook, {
    type: "buffer",
    bookType: sheetType
  });
}

function makeCsvFixture() {
  return Buffer.from("product_name,quantity\nBread rolls,1\n");
}

function intakeUploadRequest(mimeType: string, value: Buffer, fieldName = "file") {
  const boundary = "intake-upload-boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="purchase-file"\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    value,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const request = Readable.from([body]) as Readable & { headers: Record<string, string> };
  request.headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
  return request as unknown as IncomingMessage;
}

describe("readMultipartIntakeFile", () => {
  it.each([
    ["image/jpeg", async () => makeTestImage("jpeg")],
    ["image/png", async () => makeTestImage("png")],
    ["image/heic", async () => makeHeicFixture()],
    ["image/heif", async () => makeHeicFixture()],
    ["image/webp", async () => makeTestImage("webp")],
    ["application/pdf", async () => makePdfFixture()],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", async () => makeSpreadsheetBuffer("xlsx")],
    ["application/vnd.ms-excel", async () => makeSpreadsheetBuffer("xls")],
    ["text/csv", async () => makeCsvFixture()]
  ])("accepts the supported intake upload %s", async (mimeType, makeBuffer) => {
    const buffer = await makeBuffer();
    const result = await readMultipartIntakeFile(intakeUploadRequest(mimeType, buffer));

    expect(result).toMatchObject({ filename: "purchase-file", mimeType });
    expect(Buffer.compare(result.buffer, buffer)).toBe(0);
  });

  it("rejects an unsupported intake upload format", async () => {
    await expect(readMultipartIntakeFile(intakeUploadRequest("image/gif", Buffer.from("gif")))).rejects.toMatchObject({
      code: "UNSUPPORTED_INTAKE_FILE"
    });
  });

  it.each([
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv"
  ])("rejects a disguised upload for allowed MIME %s", async (mimeType) => {
    await expect(
      readMultipartIntakeFile(intakeUploadRequest(mimeType, Buffer.from("not a valid file")))
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INTAKE_FILE" });
  });

  it.each(["image/heic", "image/heif"] as const)("rejects JPEG data disguised as %s upload", async (mimeType) => {
    const jpegBuffer = await makeTestImage("jpeg");
    await expect(
      readMultipartIntakeFile(intakeUploadRequest(mimeType, jpegBuffer))
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INTAKE_FILE" });
  });

  it("rejects a PDF with only a signature and no valid body", async () => {
    await expect(readMultipartIntakeFile(intakeUploadRequest("application/pdf", makeCorruptPdfFixture()))).rejects.toMatchObject(
      { code: "UNSUPPORTED_INTAKE_FILE" }
    );
  });

  it("rejects an empty intake upload", async () => {
    await expect(readMultipartIntakeFile(intakeUploadRequest("application/pdf", Buffer.alloc(0)))).rejects.toMatchObject({
      code: "EMPTY_INTAKE_FILE"
    });
  });

  it("rejects an intake upload larger than 25 MB", async () => {
    await expect(
      readMultipartIntakeFile(intakeUploadRequest("application/pdf", Buffer.alloc(25 * 1024 * 1024 + 1)))
    ).rejects.toMatchObject({ code: "INTAKE_FILE_TOO_LARGE" });
  });
});

describe("parseWhiteboardRecognition", () => {
  it("accepts the requested whiteboard response shape", () => {
    expect(
      parseWhiteboardRecognition({
        items: [
          {
            department: "Kitchen",
            raw_text: "2 chiken brest",
            product_name: "chicken breast",
            quantity: 2,
            unit: null,
            notes: null,
            confidence: 0.74
          }
        ],
        unreadable_text: [],
        general_notes: null
      }).items[0].product_name
    ).toBe("chicken breast");
  });

  it.each([
    { confidence: 1.1, name: "confidence above one" },
    { confidence: -0.1, name: "negative confidence" },
    { confidence: "high", name: "non-number confidence" }
  ])("rejects $name", ({ confidence }) => {
    expect(() =>
      parseWhiteboardRecognition({
        items: [
          {
            department: null,
            raw_text: "milk",
            product_name: "milk",
            quantity: null,
            unit: null,
            notes: null,
            confidence
          }
        ],
        unreadable_text: [],
        general_notes: null
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_AI_RESPONSE" }));
  });

  it("rejects unrecognised response fields", () => {
    expect(() =>
      parseWhiteboardRecognition({
        items: [],
        unreadable_text: ["Kitchen list"],
        general_notes: null,
        unexpected: true
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_AI_RESPONSE" }));
  });

  it("rejects unrecognised item fields", () => {
    expect(() =>
      parseWhiteboardRecognition({
        items: [
          {
            department: null,
            raw_text: "milk",
            product_name: "milk",
            quantity: null,
            unit: null,
            notes: null,
            confidence: 0.9,
            unexpected: true
          }
        ],
        unreadable_text: [],
        general_notes: null
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_AI_RESPONSE" }));
  });

  it("reports no readable text for an empty useful result", () => {
    expect(() => parseWhiteboardRecognition({ items: [], unreadable_text: [], general_notes: null })).toThrowError(
      expect.objectContaining({ code: "NO_READABLE_TEXT" })
    );
  });

  it("trims unreadable text and discards whitespace-only values", () => {
    expect(
      parseWhiteboardRecognition({
        items: [],
        unreadable_text: ["  lower-right note  ", "   "],
        general_notes: null
      }).unreadable_text
    ).toEqual(["lower-right note"]);
  });

  it("reports no readable text when unreadable text contains only whitespace", () => {
    expect(() =>
      parseWhiteboardRecognition({ items: [], unreadable_text: ["  ", "\t"], general_notes: null })
    ).toThrowError(expect.objectContaining({ code: "NO_READABLE_TEXT" }));
  });
});

describe("prepareWhiteboardImage", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const)("accepts decoded %s images", async (format, expectedMime) => {
    const buffer = await makeTestImage(format);
    const result = await prepareWhiteboardImage({
      buffer,
      filename: "board.txt",
      browserMimeType: "image/gif"
    });

    expect(result.storedMimeType).toBe(expectedMime);
    expect(result.buffer).toBe(buffer);
  });

  it("maps heif metadata to the HEIC MIME type", () => {
    expect(mapSharpFormatToMimeType("heif")).toBe("image/heic");
  });

  it("decodes a real HEVC HEIC image and converts it to WebP", async () => {
    const buffer = await readFile(new URL("./fixtures/rainbow-hevc.heic", import.meta.url));

    expect(await sharp(buffer).metadata()).toMatchObject({ compression: "hevc", format: "heif" });

    const result = await prepareWhiteboardImage({
      buffer,
      filename: "board.heif",
      browserMimeType: "image/heif"
    });

    expect(result.storedMimeType).toBe("image/webp");
    expect((await sharp(result.buffer).metadata()).format).toBe("webp");
  });

  it("rejects AVIF even though Sharp reports the HEIF container format", async () => {
    const buffer = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "white" }
    })
      .avif()
      .toBuffer();

    expect(await sharp(buffer).metadata()).toMatchObject({ compression: "av1", format: "heif" });
    await expect(
      prepareWhiteboardImage({
        buffer,
        filename: "board.heic",
        browserMimeType: "image/heic"
      })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_FORMAT" });
  });

  it("rejects content that only pretends to be an image", async () => {
    await expect(
      prepareWhiteboardImage({
        buffer: Buffer.from("not an image"),
        filename: "board.jpg",
        browserMimeType: "image/jpeg"
      })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_FORMAT" });
  });

  it("fully decodes and rejects a corrupt small image with valid metadata", async () => {
    const validJpeg = await makeTestImage("jpeg");
    const corruptJpeg = validJpeg.subarray(0, validJpeg.length - 10);

    await expect(sharp(corruptJpeg, { failOn: "error" }).metadata()).resolves.toMatchObject({
      format: "jpeg",
      height: 32,
      width: 32
    });
    await expect(
      prepareWhiteboardImage({
        buffer: corruptJpeg,
        filename: "corrupt-small.jpg",
        browserMimeType: "image/jpeg"
      })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_FORMAT" });
  });

  it("rejects uploads over 15 MB before decoding", async () => {
    await expect(
      prepareWhiteboardImage({
        buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
        filename: "large.jpg",
        browserMimeType: "image/jpeg"
      })
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  });

  it("resizes a long image and stores it as compressed WebP", async () => {
    const buffer = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "white" }
    })
      .jpeg()
      .toBuffer();
    const result = await prepareWhiteboardImage({
      buffer,
      filename: "wide.jpg",
      browserMimeType: "image/jpeg"
    });

    expect(result.storedMimeType).toBe("image/webp");
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2048);
    expect((await sharp(result.buffer).metadata()).format).toBe("webp");
  });

  it("compresses decoded images over 2 MB even when their dimensions are within the limit", async () => {
    const width = 1024;
    const height = 1024;
    const buffer = await sharp(randomBytes(width * height * 3), {
      raw: { width, height, channels: 3 }
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    expect(buffer.length).toBeGreaterThan(COMPRESSION_THRESHOLD_BYTES);

    const result = await prepareWhiteboardImage({
      buffer,
      filename: "board.png",
      browserMimeType: "image/png"
    });

    expect(result.storedMimeType).toBe("image/webp");
    expect((await sharp(result.buffer).metadata()).format).toBe("webp");
  });

  it("auto-rotates an oriented image before returning its dimensions", async () => {
    const buffer = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "white" }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await prepareWhiteboardImage({
      buffer,
      filename: "board.jpg",
      browserMimeType: "image/jpeg"
    });

    expect(result.storedMimeType).toBe("image/webp");
    expect([result.width, result.height]).toEqual([20, 40]);
  });
});
