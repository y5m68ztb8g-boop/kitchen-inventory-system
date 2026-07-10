// @vitest-environment node

import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import Database from "better-sqlite3";
import sharp from "sharp";
import * as xlsx from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPurchasingDatabase, getIntakeSource, getScanImage } from "../../server/purchasing/database";
import { buildCurrentInventoryEntries } from "../../server/purchasing/currentInventory";
import { MAX_UPLOAD_BYTES, prepareWhiteboardImage } from "../../server/purchasing/imagePreparation";
import { readMultipartImage } from "../../server/purchasing/multipart";
import {
  PURCHASE_DOCUMENT_INSTRUCTION,
  WHITEBOARD_SYSTEM_INSTRUCTION,
  recogniseWhiteboard,
  recognisePurchasePdf,
  type OpenAIResponsesClient
} from "../../server/purchasing/openaiWhiteboard";
import { installPurchasingRoutes, type PurchasingRouteOptions } from "../../server/purchasing/routes";
import { FREEZER_INVENTORY } from "../generated/freezerInventory";

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

  it("accepts a local OpenAI base URL for server-side temporary tests", async () => {
    const client = createResponsesClient(recognisedResponse);
    const clientFactory = vi.fn(() => client);
    const fetch = vi.fn(() => {
      throw new Error("unexpected network access");
    });
    vi.stubGlobal("fetch", fetch);

    try {
      await expect(
        recogniseWhiteboard(
          { buffer: Buffer.from("whiteboard"), mimeType: "image/png" },
          {
            apiKey: testKey,
            model: "gpt-test",
            baseURL: "http://127.0.0.1:1234/v1",
            clientFactory
          }
        )
      ).resolves.toEqual(recognisedResponse);

      expect(clientFactory).toHaveBeenCalledWith({
        apiKey: testKey,
        baseURL: "http://127.0.0.1:1234/v1"
      });
      expect(fetch).not.toHaveBeenCalled();

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
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("recognisePurchasePdf", () => {
  it("calls Responses API with input_file, input_text, and structured text format", async () => {
    const client = createResponsesClient(recognisedResponse);
    const source = {
      buffer: Buffer.from("pdf-bytes"),
      filename: "trial-invoice.pdf",
      mimeType: "application/pdf"
    };

    await expect(recognisePurchasePdf(source, { apiKey: testKey, client, model: "gpt-test" })).resolves.toEqual(
      recognisedResponse
    );

    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test",
        text: { format: expect.any(Object) },
        input: [
          {
            role: "user",
            content: expect.arrayContaining([
              {
                type: "input_file",
                filename: "trial-invoice.pdf",
                file_data: `data:application/pdf;base64,${source.buffer.toString("base64")}`
              },
              { type: "input_text", text: PURCHASE_DOCUMENT_INSTRUCTION }
            ])
          }
        ]
      })
    );
  });

  it("does not leak API key or invoke network when upstream parse rejects", async () => {
    const fetch = vi.fn(() => {
      throw new Error("unexpected network access");
    });
    vi.stubGlobal("fetch", fetch);
    const client = {
      responses: {
        parse: vi.fn().mockRejectedValue(new Error(`upstream rejected ${testKey}`))
      }
    };

    try {
      await expect(recognisePurchasePdf({ buffer: Buffer.from("pdf"), filename: "event.pdf", mimeType: "application/pdf" }, {
        apiKey: testKey,
        client
      })).rejects.toSatisfy((error: unknown) => {
        return (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "AI_SERVICE_UNAVAILABLE" &&
          error instanceof Error &&
          !error.message.includes(testKey)
        );
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(client.responses.parse).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("accepts an image of exactly 15 MB", async () => {
    const image = Buffer.alloc(MAX_UPLOAD_BYTES);

    const result = await readMultipartImage(
      multipartRequest([{ name: "image", filename: "boundary.jpg", value: image }])
    );

    expect(result.buffer.length).toBe(MAX_UPLOAD_BYTES);
    expect(result.buffer.equals(image)).toBe(true);
  });

  it("rejects a Busboy-truncated upload", async () => {
    await expect(
      readMultipartImage(
        multipartRequest([{ name: "image", filename: "large.jpg", value: Buffer.alloc(MAX_UPLOAD_BYTES + 1) }])
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

function makeRouteOptions(overrides: Partial<PurchasingRouteOptions> = {}) {
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
    historicalInventoryEntries: () =>
      buildCurrentInventoryEntries(
        { deletedFreezerInventoryIds: [], dryStore: [], freezer: [] },
        FREEZER_INVENTORY
      ),
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
  Object.assign(options, overrides);
  return { database, options };
}

function routeOptions(overrides: Partial<PurchasingRouteOptions> = {}) {
  const { database, options } = makeRouteOptions(overrides);
  const server = createTestServer(options);
  resources.push({ database, server });
  return { baseUrl: startServer(server), database, options };
}

function invokePurchasingRoute(route: {
  method: string;
  url: string;
  options: Partial<PurchasingRouteOptions>;
}) {
  const { database, options } = makeRouteOptions(route.options);
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

  if (!handler) {
    throw new Error("Failed to install purchasing handler for route test.");
  }
  const installedHandler = handler;

  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    chunks: [] as Buffer[],
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = String(value);
    },
    end(chunk?: string | Buffer | ArrayBufferView) {
      if (chunk) {
        this.chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : typeof chunk === "string"
              ? Buffer.from(chunk)
              : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        );
      }
    }
  } as {
    statusCode: number;
    headers: Record<string, string>;
    chunks: Array<Buffer>;
    setHeader: (name: string, value: string | number) => void;
    end: (chunk?: string | Buffer | ArrayBufferView) => void;
  };

  const request = {
    method: route.method,
    url: route.url
  } as IncomingMessage;

  return {
    handler: installedHandler,
    request,
    response,
    database,
    options,
    readJson: async () => {
      await installedHandler(request, response as unknown as ServerResponse, () => {
        response.statusCode = 204;
      });
      return JSON.parse(Buffer.concat(response.chunks).toString("utf8"));
    },
    readStatus: async () => {
      await installedHandler(request, response as unknown as ServerResponse, () => {
        response.statusCode = 204;
      });
      return response;
    }
  };
}

function uploadBody(
  image = Buffer.from("image"),
  mimeType = "image/jpeg",
  fieldName = "image",
  filename = `${fieldName}.jpg`
) {
  const boundary = "route-test-boundary";
  return {
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function spreadsheetBuffer(sheetType: "xlsx" | "xls", includeLeadingEmptySheet = false) {
  const workbook = xlsx.utils.book_new();
  if (includeLeadingEmptySheet) {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([[]]), "Ignored");
  }
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["section", "description", "quantity", "unit", "notes"],
    ["kitchen", "Orange juice", "", "L", "local stock"]
  ]);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Data");
  return xlsx.write(workbook, { type: "buffer", bookType: sheetType });
}

type HistoricalCandidatesResponse = {
  candidates?: Array<Record<string, unknown>> | undefined;
  items?: Array<Record<string, unknown>> | undefined;
  query?: string;
};

function parseHistoricalCandidates(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }
  const objectPayload = payload as HistoricalCandidatesResponse;
  return Array.isArray(objectPayload?.candidates)
    ? objectPayload.candidates
    : Array.isArray(objectPayload?.items)
      ? objectPayload.items
      : [];
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

  it("POST /api/purchasing/intakes/parse saves PDF input as a draft intake via server recognition", async () => {
    const parseSpy = vi.fn().mockResolvedValue({
      items: [
        {
          department: "Bar",
          raw_text: "5 bottles orange juice",
          product_name: "Orange juice",
          quantity: 5,
          unit: "bottle",
          notes: "seasonal",
          confidence: 0.99
        }
      ],
      unreadable_text: [],
      general_notes: "Friday event"
    });
    const { baseUrl, database, options } = routeOptions({ recognise: parseSpy });
    const pdfFixture = await readFile(new URL("./fixtures/valid-test.pdf", import.meta.url));
    const upload = uploadBody(pdfFixture, "application/pdf", "file", "weekend-event.pdf");

    const response = await fetch(`${await baseUrl}/api/purchasing/intakes/parse`, {
      body: upload.body,
      headers: { "Content-Type": upload.contentType },
      method: "POST"
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      intakeId: string;
      sourceUrl: string;
      sourceType: string;
      originalFilename: string;
      items: Array<{ product_name: string; quantity: number | null }>;
      unreadableText: string[];
      generalNotes: string | null;
    };

    expect(payload.sourceType).toBe("pdf");
    expect(payload.originalFilename).toBe("weekend-event.pdf");
    expect(payload.sourceUrl).toBe(`/api/purchasing/intakes/${payload.intakeId}/source`);
    expect(payload.items).toEqual([
      {
        department: "Bar",
        raw_text: "5 bottles orange juice",
        product_name: "Orange juice",
        quantity: 5,
        unit: "bottle",
        notes: "seasonal",
        confidence: 0.99
      }
    ]);
    expect(payload.unreadableText).toEqual([]);
    expect(payload.generalNotes).toBe("Friday event");

    expect(options.recognise).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT status, source_type, original_filename FROM purchase_intakes WHERE id = ?").get(payload.intakeId)).toEqual({
      status: "Draft",
      source_type: "pdf",
      original_filename: "weekend-event.pdf"
    });
    expect(getIntakeSource(database, payload.intakeId)).not.toBeNull();
  });

  it.each([
    ["xlsx", async () => spreadsheetBuffer("xlsx", true)],
    ["xls", async () => spreadsheetBuffer("xls", true)],
    [
      "csv",
      () => readFile(new URL("./fixtures/parse-spreadsheet-alias.csv", import.meta.url))
    ]
  ] as const)("parseSpreadsheet accepts aliases and keeps empty quantity as null for %s", async (_type, makeBuffer) => {
    const { baseUrl } = routeOptions();
    const buffer = await makeBuffer();
    const upload = uploadBody(buffer, _type === "csv" ? "text/csv" : _type === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel", "file", "spreadsheet." + _type);

    const response = await fetch(`${await baseUrl}/api/purchasing/intakes/parse`, {
      body: upload.body,
      headers: { "Content-Type": upload.contentType },
      method: "POST"
    });

    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items[0]).toMatchObject({ product_name: "Orange juice", quantity: null });
  });

  it("parseSpreadsheet fails with NO_READABLE_TEXT when there is no product header", async () => {
    const { baseUrl } = routeOptions();
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet([["sku", "qty"], ["OJO-1", "8"]]);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Data");
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    const upload = uploadBody(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "file", "no-product-header.xlsx");

    const response = await fetch(`${await baseUrl}/api/purchasing/intakes/parse`, {
      body: upload.body,
      headers: { "Content-Type": upload.contentType },
      method: "POST"
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NO_READABLE_TEXT" } });
  });

  it("supports intake source retrieval and lifecycle updates", async () => {
    const intakeRecognition = {
      items: [
        {
          department: "Bar",
          raw_text: "5 bottles orange juice",
          product_name: "Orange juice",
          quantity: 5,
          unit: "bottle",
          notes: null,
          confidence: 0.99
        }
      ],
      unreadable_text: [],
      general_notes: "Friday event"
    };
    const { baseUrl, database } = routeOptions({
      recognise: vi.fn().mockResolvedValue(intakeRecognition)
    });
    const parseUpload = uploadBody(await readFile(new URL("./fixtures/valid-test.pdf", import.meta.url)), "application/pdf", "file", "event.pdf");
    const parseResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/parse`, {
      body: parseUpload.body,
      headers: { "Content-Type": parseUpload.contentType },
      method: "POST"
    });
    const parsePayload = (await parseResponse.json()) as { intakeId: string };

    expect(database.prepare("SELECT status FROM purchase_intakes WHERE id = ?").get(parsePayload.intakeId)).toEqual({
      status: "Draft"
    });

    const sourceResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/${parsePayload.intakeId}/source`);
    expect(sourceResponse.status).toBe(200);
    expect(sourceResponse.headers.get("content-type")).toBe("application/pdf");

    const putResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/${parsePayload.intakeId}`, {
      body: JSON.stringify({
        items: [
          {
            clientId: "pending-row",
            confidence: 0.99,
            department: "Bar",
            manualReviewed: true,
            notes: null,
            product_name: "Orange juice",
            quantity: 5,
            raw_text: "5 bottles orange juice",
            unit: "bottle"
          }
        ]
      }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });

    expect(putResponse.status).toBe(200);
    expect(database.prepare("SELECT status FROM purchase_intakes WHERE id = ?").get(parsePayload.intakeId)).toEqual({
      status: "Pending"
    });

    const readyResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/${parsePayload.intakeId}/ready-for-purchase`, {
      body: JSON.stringify({
        items: [
          {
            clientId: "pending-row",
            confidence: 0.99,
            department: "Bar",
            manualReviewed: true,
            notes: null,
            product_name: "Orange juice",
            quantity: 5,
            raw_text: "5 bottles orange juice",
            unit: "bottle"
          }
        ]
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect([200, 204]).toContain(readyResponse.status);
    if (readyResponse.status === 200) {
      await expect(readyResponse.json()).resolves.toMatchObject({
        intakeId: parsePayload.intakeId,
        status: "ReadyForPurchase"
      });
    }
    expect(database.prepare("SELECT status FROM purchase_intakes WHERE id = ?").get(parsePayload.intakeId)).toEqual({
      status: "ReadyForPurchase"
    });
    expect(
      (
        database.prepare("SELECT COUNT(*) AS count FROM purchase_intake_items WHERE intake_id = ?").get(parsePayload.intakeId) as {
          count: number;
        }
      ).count
    ).toBe(1);
  });

  it("returns INTAKE_NOT_FOUND for missing intake resources", async () => {
    const { baseUrl } = routeOptions();
    const missingIntakeId = "missing-intake";

    const sourceResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/${missingIntakeId}/source`);
    expect(sourceResponse.status).toBe(404);
    await expect(sourceResponse.json()).resolves.toMatchObject({ error: { code: "INTAKE_NOT_FOUND" } });

    const putResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/${missingIntakeId}`, {
      body: JSON.stringify({ items: [] }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });
    expect(putResponse.status).toBe(404);
    await expect(putResponse.json()).resolves.toMatchObject({ error: { code: "INTAKE_NOT_FOUND" } });

    const readyResponse = await fetch(`${await baseUrl}/api/purchasing/intakes/${missingIntakeId}/ready-for-purchase`, {
      body: JSON.stringify({ items: [] }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(readyResponse.status).toBe(404);
    await expect(readyResponse.json()).resolves.toMatchObject({ error: { code: "INTAKE_NOT_FOUND" } });
  });

  it("returns ranked historical candidates with isRecommended and card completion fields", async () => {
    const { baseUrl } = routeOptions({
      historicalCandidates: () => [
        {
          id: "BRK-ORANGE",
          latestPrice: 17.25,
          latestPurchaseDate: "2026-07-01",
          packSize: "4x2.5L",
          productName: "Orange Juice",
          purchaseCount: 19,
          supplierCode: "BRK",
          supplierName: "Brakes",
          supplierProductCode: "OJ-1"
        },
        {
          id: "BRK-JUICE",
          latestPrice: 14.5,
          latestPurchaseDate: "2025-11-02",
          packSize: "2x5L",
          productName: "Apple Juice",
          purchaseCount: 2,
          supplierCode: "BRK",
          supplierName: "Brakes",
          supplierProductCode: "AP-1"
        }
      ],
      historicalInventoryEntries: () => [{ productName: "Orange Juice", quantity: 7, supplierProduct: { id: "BRK-ORANGE" } }]
    });
    const response = await fetch(
      `${await baseUrl}/api/purchasing/historical-products?query=${encodeURIComponent("orange juice")}`
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const candidates = parseHistoricalCandidates(payload);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toMatchObject({
      id: "BRK-ORANGE",
      isRecommended: true,
      productName: "Orange Juice",
      latestPrice: 17.25,
      latestPurchaseDate: "2026-07-01",
      packSize: "4x2.5L",
      purchaseCount: 19,
      supplierCode: "BRK",
      supplierName: "Brakes",
      supplierProductCode: "OJ-1",
      currentInventoryQuantity: 7,
      recommendedLastPrice: 17.25,
      recommendedLastPurchaseDate: "2026-07-01",
      recommendedPackSize: "4x2.5L",
      recommendedProductCode: "OJ-1",
      recommendedProductName: "Orange Juice",
      recommendedPurchaseCount: 19,
      recommendedSupplierCode: "BRK",
      recommendedSupplierName: "Brakes",
      recommendedSupplierProductId: "BRK-ORANGE"
    });
    expect(candidates[1]).toMatchObject({ id: "BRK-JUICE" });
  });

  it("supports supplier code search for historical-products with complete candidate and recommendation fields", async () => {
    const route = invokePurchasingRoute({
      method: "GET",
      url: "/api/purchasing/historical-products?query=BRK",
      options: {
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
        ]
      }
    });
    try {
      const payload = await route.readJson();
      expect(route.response.statusCode).toBe(200);
      const candidates = parseHistoricalCandidates(payload);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        id: "BRK-CHICKEN",
        isRecommended: true,
        productName: "Chicken Breast",
        latestPrice: 24.5,
        latestPurchaseDate: "2026-07-01",
        packSize: "2x5kg",
        purchaseCount: 10,
        supplierCode: "BRK",
        supplierName: "Brakes",
        supplierProductCode: "CHICKEN-1",
        currentInventoryQuantity: 7,
        recommendedLastPrice: 24.5,
        recommendedLastPurchaseDate: "2026-07-01",
        recommendedPackSize: "2x5kg",
        recommendedProductCode: "CHICKEN-1",
        recommendedProductName: "Chicken Breast",
        recommendedPurchaseCount: 10,
        recommendedSupplierCode: "BRK",
        recommendedSupplierName: "Brakes",
        recommendedSupplierProductId: "BRK-CHICKEN"
      });
    } finally {
      route.database.close();
    }
  });

  it("supports supplier name search for historical-products with complete candidate and recommendation fields", async () => {
    const route = invokePurchasingRoute({
      method: "GET",
      url: "/api/purchasing/historical-products?query=Brakes",
      options: {
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
        ]
      }
    });
    try {
      const payload = await route.readJson();
      expect(route.response.statusCode).toBe(200);
      const candidates = parseHistoricalCandidates(payload);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        id: "BRK-CHICKEN",
        isRecommended: true,
        productName: "Chicken Breast",
        latestPrice: 24.5,
        latestPurchaseDate: "2026-07-01",
        packSize: "2x5kg",
        purchaseCount: 10,
        supplierCode: "BRK",
        supplierName: "Brakes",
        supplierProductCode: "CHICKEN-1",
        currentInventoryQuantity: 7,
        recommendedLastPrice: 24.5,
        recommendedLastPurchaseDate: "2026-07-01",
        recommendedPackSize: "2x5kg",
        recommendedProductCode: "CHICKEN-1",
        recommendedProductName: "Chicken Breast",
        recommendedPurchaseCount: 10,
        recommendedSupplierCode: "BRK",
        recommendedSupplierName: "Brakes",
        recommendedSupplierProductId: "BRK-CHICKEN"
      });
    } finally {
      route.database.close();
    }
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
          clientId: "client-row",
          productName: "chicken breast",
          recommendation: expect.objectContaining({
            currentInventoryQuantity: 7,
            recommendedSupplierProductId: "BRK-CHICKEN"
          })
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

  it("rejects confirmation with no retained items without creating a Pending scan", async () => {
    const { baseUrl, database } = routeOptions();
    const upload = uploadBody();
    await fetch(`${await baseUrl}/api/purchasing/scan-whiteboard`, {
      body: upload.body,
      headers: { "Content-Type": upload.contentType },
      method: "POST"
    });

    const response = await fetch(
      `${await baseUrl}/api/purchasing/whiteboard-scans/scan-test-id/confirm`,
      {
        body: JSON.stringify({ items: [] }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REVIEW_DATA" } });
    expect(database.prepare("SELECT status FROM whiteboard_scans WHERE id = ?").get("scan-test-id")).toEqual({
      status: "Draft"
    });
  });

  it("rejects duplicate client IDs with INVALID_REVIEW_DATA", async () => {
    const { baseUrl, database } = routeOptions();
    const upload = uploadBody();
    await fetch(`${await baseUrl}/api/purchasing/scan-whiteboard`, {
      body: upload.body,
      headers: { "Content-Type": upload.contentType },
      method: "POST"
    });

    const duplicateClientId = "purchase-row-1";
    const response = await fetch(
      `${await baseUrl}/api/purchasing/whiteboard-scans/scan-test-id/confirm`,
      {
        body: JSON.stringify({
          items: [
            { ...recognisedResponse.items[0], clientId: duplicateClientId, manualReviewed: false },
            {
              ...recognisedResponse.items[0],
              clientId: duplicateClientId,
              product_name: "milk"
            }
          ]
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REVIEW_DATA" } });
    expect(database.prepare("SELECT COUNT(*) AS count FROM whiteboard_scan_items").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT status FROM whiteboard_scans WHERE id = ?").get("scan-test-id")).toEqual({
      status: "Draft"
    });
  });
});
