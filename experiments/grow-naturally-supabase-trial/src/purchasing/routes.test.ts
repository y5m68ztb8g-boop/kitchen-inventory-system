// @vitest-environment node

import { Readable } from "node:stream";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import Database from "better-sqlite3";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPurchasingDatabase, getScanImage } from "../../server/purchasing/database";
import { prepareWhiteboardImage } from "../../server/purchasing/imagePreparation";
import { readMultipartImage } from "../../server/purchasing/multipart";
import {
  WHITEBOARD_SYSTEM_INSTRUCTION,
  recogniseWhiteboard,
  type OpenAIResponsesClient
} from "../../server/purchasing/openaiWhiteboard";
import { installPurchasingRoutes, type PurchasingRouteOptions } from "../../server/purchasing/routes";

const testKey = "task-3-test-key-must-not-leak";
const recognisedResponse = {
  items: [
    {
      department: "Kitchen",
      raw_text: "2 chiken brest",
      product_name: "chicken breast",
      quantity: 2,
      unit: "case",
      notes: null,
      confidence: 0.91
    }
  ],
  unreadable_text: ["lower-right note"],
  general_notes: "Friday delivery"
};

function createResponsesClient(outputParsed: unknown): OpenAIResponsesClient {
  return {
    responses: {
      parse: vi.fn().mockResolvedValue({ output_parsed: outputParsed })
    }
  };
}

describe("recogniseWhiteboard", () => {
  it("rejects a missing API key before creating a client", async () => {
    await expect(
      recogniseWhiteboard(
        { buffer: Buffer.from("whiteboard"), mimeType: "image/jpeg" },
        { apiKey: "", client: createResponsesClient(recognisedResponse) }
      )
    ).rejects.toMatchObject({ code: "MISSING_API_KEY" });
  });

  it("returns independently validated structured recognition data", async () => {
    const client = createResponsesClient(recognisedResponse);

    await expect(
      recogniseWhiteboard(
        { buffer: Buffer.from("whiteboard"), mimeType: "image/png" },
        { apiKey: testKey, client, model: "gpt-test" }
      )
    ).resolves.toEqual(recognisedResponse);

    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test",
        input: [
          { role: "system", content: WHITEBOARD_SYSTEM_INSTRUCTION },
          {
            role: "user",
            content: [
              { type: "input_text", text: "Read this hotel purchase whiteboard." },
              { type: "input_image", image_url: "data:image/png;base64,d2hpdGVib2FyZA==" }
            ]
          }
        ]
      })
    );
  });

  it("instructs the model not to invent while preserving raw text and uncertainty", () => {
    expect(WHITEBOARD_SYSTEM_INSTRUCTION).toContain("Never invent");
    expect(WHITEBOARD_SYSTEM_INSTRUCTION).toContain("raw_text");
    expect(WHITEBOARD_SYSTEM_INSTRUCTION).toContain("department");
    expect(WHITEBOARD_SYSTEM_INSTRUCTION).toContain("null");
    expect(WHITEBOARD_SYSTEM_INSTRUCTION).toContain("confidence");
  });

  it("converts malformed parsed output to a stable error", async () => {
    await expect(
      recogniseWhiteboard(
        { buffer: Buffer.from("whiteboard"), mimeType: "image/jpeg" },
        { apiKey: testKey, client: createResponsesClient({ items: "not an array" }) }
      )
    ).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  });

  it("maps upstream failures to a safe error without disclosing the key", async () => {
    const client: OpenAIResponsesClient = {
      responses: {
        parse: vi.fn().mockRejectedValue(new Error(`upstream rejected ${testKey}`))
      }
    };

    await expect(
      recogniseWhiteboard({ buffer: Buffer.from("whiteboard"), mimeType: "image/jpeg" }, { apiKey: testKey, client })
    ).rejects.toSatisfy((error: unknown) => {
      return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "AI_SERVICE_UNAVAILABLE" &&
        error instanceof Error &&
        !error.message.includes(testKey)
      );
    });
  });
});

function multipartRequest(parts: Array<{ filename?: string; name: string; value: Buffer | string }>) {
  const boundary = "task-three-boundary";
  const body = Buffer.concat(
    parts.flatMap((part) => {
      const header = part.filename
        ? `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
        : `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n`;
      return [Buffer.from(header), Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value), Buffer.from("\r\n")];
    })
  );
  const request = Readable.from([Buffer.concat([body, Buffer.from(`--${boundary}--\r\n`)])]) as Readable & {
    headers: Record<string, string>;
  };
  request.headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
  return request as unknown as IncomingMessage;
}

describe("readMultipartImage", () => {
  it("reads one supported image field", async () => {
    await expect(
      readMultipartImage(multipartRequest([{ name: "image", filename: "board.jpg", value: Buffer.from("image") }]))
    ).resolves.toEqual({ buffer: Buffer.from("image"), browserMimeType: "image/jpeg", filename: "board.jpg" });
  });

  it("rejects a request without an image", async () => {
    await expect(readMultipartImage(multipartRequest([{ name: "note", value: "missing" }]))).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE_FORMAT"
    });
  });

  it("rejects a second image", async () => {
    await expect(
      readMultipartImage(
        multipartRequest([
          { name: "image", filename: "one.jpg", value: Buffer.from("one") },
          { name: "image", filename: "two.jpg", value: Buffer.from("two") }
        ])
      )
    ).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_FORMAT" });
  });

  it("rejects a Busboy-truncated upload", async () => {
    await expect(
      readMultipartImage(
        multipartRequest([{ name: "image", filename: "large.jpg", value: Buffer.alloc(15 * 1024 * 1024 + 1) }])
      )
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  });
});

type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
) => void | Promise<void>;

function createTestServer(options: PurchasingRouteOptions) {
  let handler: RouteHandler | undefined;
  installPurchasingRoutes(
    {
      middlewares: {
        use(next) {
          handler = next as RouteHandler;
        }
      }
    },
    options
  );

  return createServer((request, response) => {
    if (!handler) {
      response.statusCode = 500;
      response.end();
      return;
    }
    void handler(request, response, () => {
      response.statusCode = 204;
      response.setHeader("X-Existing-Middleware", "reached");
      response.end();
    });
  });
}

async function startServer(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

const resources: Array<{ database: Database.Database; server: Server }> = [];

afterEach(async () => {
  await Promise.all(
    resources.splice(0).map(async ({ database, server }) => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      database.close();
    })
  );
});

function routeOptions() {
  const database = createPurchasingDatabase(":memory:");
  const options: PurchasingRouteOptions = {
    database,
    historicalCandidates: () => [
      {
        id: "BRK-CHICKEN",
        latestPrice: 24.5,
        latestPurchaseDate: "2026-07-01",
        packSize: "2x5kg",
        productName: "Chicken Breast",
        purchaseCount: 10,
        supplierCode: "BRK",
        supplierName: "Brakes",
        supplierProductCode: "CHICKEN-1"
      }
    ],
    historicalInventoryEntries: () => [],
    prepareImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from("compressed-image"),
      originalSizeBytes: 5,
      storedMimeType: "image/webp",
      storedSizeBytes: 16,
      width: 30,
      height: 20
    }),
    recognise: vi.fn().mockResolvedValue(recognisedResponse),
    scanId: () => "scan-test-id"
  };
  const server = createTestServer(options);
  resources.push({ database, server });
  return { baseUrl: startServer(server), database, options };
}

function uploadBody(image = Buffer.from("image"), mimeType = "image/jpeg") {
  const boundary = "route-test-boundary";
  return {
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="whiteboard.jpg"\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function realSmokeRouteOptions() {
  const database = createPurchasingDatabase(":memory:");
  const server = createTestServer({
    database,
    prepareImage: prepareWhiteboardImage,
    recognise: (image) => recogniseWhiteboard(image, { apiKey: "" })
  });
  resources.push({ database, server });
  return { baseUrl: startServer(server) };
}

describe("purchasing API routes", () => {
  it("passes unrelated paths through to existing middleware", async () => {
    const { baseUrl } = routeOptions();

    const response = await fetch(`${await baseUrl}/api/inventory-db`);

    expect(response.status).toBe(204);
    expect(response.headers.get("x-existing-middleware")).toBe("reached");
  });

  it("saves a recognised draft, serves its image, and confirms reviewed rows", async () => {
    const { baseUrl, database } = routeOptions();
    const upload = uploadBody();
    const scanResponse = await fetch(`${await baseUrl}/api/purchasing/scan-whiteboard`, {
      body: upload.body,
      headers: { "Content-Type": upload.contentType },
      method: "POST"
    });

    expect(scanResponse.status).toBe(201);
    expect(scanResponse.headers.get("content-type")).toContain("application/json");
    await expect(scanResponse.json()).resolves.toEqual({
      generalNotes: "Friday delivery",
      imageUrl: "/api/purchasing/whiteboard-scans/scan-test-id/image",
      items: recognisedResponse.items,
      scanId: "scan-test-id",
      unreadableText: ["lower-right note"]
    });
    expect(getScanImage(database, "scan-test-id")?.buffer).toEqual(Buffer.from("compressed-image"));

    const imageResponse = await fetch(`${await baseUrl}/api/purchasing/whiteboard-scans/scan-test-id/image`);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(Buffer.from("compressed-image"));

    const confirmResponse = await fetch(`${await baseUrl}/api/purchasing/whiteboard-scans/scan-test-id/confirm`, {
      body: JSON.stringify({
        items: [{ ...recognisedResponse.items[0], clientId: "client-row", manualReviewed: false }]
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(confirmResponse.status).toBe(200);
    await expect(confirmResponse.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          productName: "chicken breast",
          recommendation: expect.objectContaining({ recommendedSupplierProductId: "BRK-CHICKEN" })
        })
      ],
      scanId: "scan-test-id",
      status: "Pending"
    });
    expect(database.prepare("SELECT status FROM whiteboard_scans WHERE id = ?").get("scan-test-id")).toEqual({
      status: "Pending"
    });
  });

  it("returns missing-key and image-validation errors through the real scan route", async () => {
    const { baseUrl } = realSmokeRouteOptions();
    const endpoint = `${await baseUrl}/api/purchasing/scan-whiteboard`;
    const validPng = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" }
    })
      .png()
      .toBuffer();

    const missingKeyUpload = uploadBody(validPng, "image/png");
    const missingKeyResponse = await fetch(endpoint, {
      body: missingKeyUpload.body,
      headers: { "Content-Type": missingKeyUpload.contentType },
      method: "POST"
    });

    expect(missingKeyResponse.status).toBe(500);
    await expect(missingKeyResponse.json()).resolves.toEqual({
      error: { code: "MISSING_API_KEY", message: "服务器尚未配置 AI 识别密钥。" }
    });

    const unsupportedUpload = uploadBody(Buffer.from("not an image"));
    const unsupportedResponse = await fetch(endpoint, {
      body: unsupportedUpload.body,
      headers: { "Content-Type": unsupportedUpload.contentType },
      method: "POST"
    });

    expect(unsupportedResponse.status).toBe(415);
    await expect(unsupportedResponse.json()).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_IMAGE_FORMAT" }
    });

    const oversizedUpload = uploadBody(Buffer.alloc(15 * 1024 * 1024 + 1));
    const oversizedResponse = await fetch(endpoint, {
      body: oversizedUpload.body,
      headers: { "Content-Type": oversizedUpload.contentType },
      method: "POST"
    });

    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toMatchObject({
      error: { code: "IMAGE_TOO_LARGE" }
    });
  });

  it("returns 404 for unknown scans and 405 for unsupported methods", async () => {
    const { baseUrl } = routeOptions();

    await expect((await fetch(`${await baseUrl}/api/purchasing/whiteboard-scans/missing/image`)).status).toBe(404);
    await expect((await fetch(`${await baseUrl}/api/purchasing/scan-whiteboard`)).status).toBe(405);
    await expect((await fetch(`${await baseUrl}/api/purchasing/whiteboard-scans/missing/confirm`, { method: "POST" })).status).toBe(
      404
    );
  });
});
