// @vitest-environment node

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  COMPRESSION_THRESHOLD_BYTES,
  mapSharpFormatToMimeType,
  prepareWhiteboardImage
} from "../../server/purchasing/imagePreparation";
import { parseWhiteboardRecognition } from "../../server/purchasing/recognitionSchema";

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

  it("rejects content that only pretends to be an image", async () => {
    await expect(
      prepareWhiteboardImage({
        buffer: Buffer.from("not an image"),
        filename: "board.jpg",
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
