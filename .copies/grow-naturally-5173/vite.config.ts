import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { dirname, resolve } from "node:path";
import { loadEnv } from "vite";
import { createPurchasingDatabase } from "./server/purchasing/database";
import { buildCurrentInventoryEntries } from "./server/purchasing/currentInventory";
import { recognisePurchasePdf, recogniseWhiteboard } from "./server/purchasing/openaiWhiteboard";
import { installPurchasingRoutes } from "./server/purchasing/routes";
import { buildOrderingInventorySnapshot } from "./server/ordering/inventory";
import { installOrderingRoutes } from "./server/ordering/routes";
import { createBrakesQuickAddRunner } from "./server/ordering/brakesQuickAdd";
import { createWineCellarDatabase } from "./server/wine-cellar/database";
import { installWineCellarRoutes } from "./server/wine-cellar/routes";
import { createSmtpEmailSender } from "./server/ordering/emailSender";

const inventoryDatabasePath = resolve(
  process.cwd(),
  process.env.GROW_NATURALLY_INVENTORY_DB_PATH || resolve("local-data", "inventory-db.json")
);
const purchasingDatabasePath = resolve(
  process.cwd(),
  process.env.GROW_NATURALLY_PURCHASING_DB_PATH || resolve("local-data", "purchasing.sqlite")
);
const wineCellarDatabasePath = resolve(
  process.cwd(),
  process.env.GROW_NATURALLY_WINE_CELLAR_DB_PATH || resolve("local-data", "wine-cellar.sqlite")
);
const emptyInventoryDatabase = {
  deletedFreezerInventoryIds: [],
  dryStore: [],
  freezer: [],
  freezerSourceNameOverrides: {}
};

type SupabaseConfig = {
  key: string;
  recordId: string;
  table: string;
  url: string;
};

type CloudSyncStatus = {
  error: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  pending: boolean;
};

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";

    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function isAllowedExternalUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname === "www.brake.co.uk" && url.pathname === "/search";
  } catch {
    return false;
  }
}

async function readInventoryDatabase() {
  try {
    return JSON.parse(await readFile(inventoryDatabasePath, "utf8"));
  } catch {
    return emptyInventoryDatabase;
  }
}

async function writeInventoryDatabase(database: unknown) {
  await mkdir(dirname(inventoryDatabasePath), { recursive: true });
  await writeFile(inventoryDatabasePath, `${JSON.stringify(normalizeInventoryDatabase(database), null, 2)}\n`);
}

function normalizeInventoryDatabase(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return emptyInventoryDatabase;
  }

  const value = input as {
    deletedFreezerInventoryIds?: unknown;
    dryStore?: unknown;
    freezer?: unknown;
    freezerSourceNameOverrides?: unknown;
  };

  return {
    deletedFreezerInventoryIds: Array.isArray(value.deletedFreezerInventoryIds)
      ? value.deletedFreezerInventoryIds.filter((id): id is string => typeof id === "string")
      : [],
    dryStore: Array.isArray(value.dryStore) ? value.dryStore : [],
    freezer: Array.isArray(value.freezer) ? value.freezer : [],
    freezerSourceNameOverrides:
      value.freezerSourceNameOverrides &&
      typeof value.freezerSourceNameOverrides === "object" &&
      !Array.isArray(value.freezerSourceNameOverrides)
        ? Object.fromEntries(
            Object.entries(value.freezerSourceNameOverrides).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {}
  };
}

function getSupabaseConfig(env: Record<string, string>): SupabaseConfig | null {
  const url = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)?.trim();

  if (!url || !key) {
    return null;
  }

  return {
    key,
    recordId: env.SUPABASE_INVENTORY_ID?.trim() || "trial",
    table: env.SUPABASE_INVENTORY_TABLE?.trim() || "inventory_databases",
    url: url.endsWith("/") ? url.slice(0, -1) : url
  };
}

function getSupabaseHeaders(config: SupabaseConfig) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json"
  };
}

async function readCloudInventoryDatabase(config: SupabaseConfig) {
  const url = new URL(`/rest/v1/${encodeURIComponent(config.table)}`, config.url);
  url.searchParams.set("id", `eq.${config.recordId}`);
  url.searchParams.set("select", "data,updated_at");

  const response = await fetch(url, {
    headers: getSupabaseHeaders(config)
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${response.status}`);
  }

  const rows = (await response.json()) as Array<{ data?: unknown; updated_at?: string }>;
  const row = rows[0];

  return {
    database: normalizeInventoryDatabase(row?.data),
    updatedAt: row?.updated_at || null
  };
}

async function writeCloudInventoryDatabase(config: SupabaseConfig, database: unknown) {
  const normalizedDatabase = normalizeInventoryDatabase(database);
  const url = new URL(`/rest/v1/${encodeURIComponent(config.table)}`, config.url);

  const response = await fetch(url, {
    body: JSON.stringify([
      {
        data: normalizedDatabase,
        id: config.recordId,
        updated_at: new Date().toISOString()
      }
    ]),
    headers: {
      ...getSupabaseHeaders(config),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed: ${response.status}`);
  }

  return normalizedDatabase;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isE2E = process.env.GROW_NATURALLY_E2E === "1" || env.GROW_NATURALLY_E2E === "1";
  const fakeBrakesQuickAddRunner = {
    async fill(items: Array<{ itemId: string }>) {
      return items.map((item) => ({ itemId: item.itemId, status: "Added" as const, message: null }));
    }
  };
  const realBrakesQuickAddRunner = createBrakesQuickAddRunner({
    cdpPort: Number(env.GROW_NATURALLY_BRAKES_CDP_PORT) || 9333,
    profilePath: env.GROW_NATURALLY_BRAKES_PROFILE_PATH || resolve("local-data", "brakes-chrome-profile-cdp")
  });
  const supabaseConfig = isE2E ? null : getSupabaseConfig(env);
  const cloudSyncStatus: CloudSyncStatus = {
    error: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    pending: false
  };
  let cloudSyncQueue = Promise.resolve();

  function queueCloudInventorySync(database: unknown) {
    if (!supabaseConfig) {
      return;
    }

    const snapshot = normalizeInventoryDatabase(database);
    cloudSyncStatus.pending = true;
    cloudSyncStatus.lastAttemptAt = new Date().toISOString();

    cloudSyncQueue = cloudSyncQueue
      .catch(() => undefined)
      .then(async () => {
        cloudSyncStatus.pending = true;
        cloudSyncStatus.lastAttemptAt = new Date().toISOString();
        try {
          await writeCloudInventoryDatabase(supabaseConfig, snapshot);
          cloudSyncStatus.error = null;
          cloudSyncStatus.lastSuccessAt = new Date().toISOString();
        } catch (error) {
          cloudSyncStatus.error = error instanceof Error ? error.message : "Supabase automatic sync failed.";
        } finally {
          cloudSyncStatus.pending = false;
        }
      });
  }

  return {
  plugins: [
    react(),
    {
      name: "grow-naturally-external-opener",
      configureServer(server) {
        const purchasingDatabase = createPurchasingDatabase(purchasingDatabasePath);
        const wineCellarDatabase = createWineCellarDatabase(isE2E ? ":memory:" : wineCellarDatabasePath);
        installPurchasingRoutes(server, {
          database: purchasingDatabase,
          historicalCandidates: async () =>
            (await server.ssrLoadModule("/src/generated/supplierCatalogue.ts")).SUPPLIER_CATALOGUE,
          historicalInventoryEntries: async () =>
            buildCurrentInventoryEntries(
              await readInventoryDatabase(),
              (await server.ssrLoadModule("/src/generated/freezerInventory.ts")).FREEZER_INVENTORY
            ),
          model: env.OPENAI_WHITEBOARD_MODEL,
          recognise: (image) =>
            recogniseWhiteboard(image, {
              apiKey: env.OPENAI_API_KEY,
              baseURL: env.OPENAI_BASE_URL,
              model: env.OPENAI_WHITEBOARD_MODEL
            }),
          recognisePdf: (source) =>
            recognisePurchasePdf(source, {
              apiKey: env.OPENAI_API_KEY,
              baseURL: env.OPENAI_BASE_URL,
              model: env.OPENAI_WHITEBOARD_MODEL
            })
        });
        installOrderingRoutes(server, {
          brakesQuickAddRunner: isE2E ? fakeBrakesQuickAddRunner : realBrakesQuickAddRunner,
          database: purchasingDatabase,
          sendEmail: isE2E ? undefined : createSmtpEmailSender({ ...process.env, ...env }),
          historicalCandidates: async () =>
            (await server.ssrLoadModule("/src/generated/supplierCatalogue.ts")).SUPPLIER_CATALOGUE,
          orderingInventory: async () =>
            buildOrderingInventorySnapshot(
              await readInventoryDatabase(),
              (await server.ssrLoadModule("/src/generated/freezerInventory.ts")).FREEZER_INVENTORY
            )
        });
        installWineCellarRoutes(server, wineCellarDatabase);

        server.middlewares.use("/api/inventory-db", async (request, response) => {
          if (request.method === "GET") {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify(await readInventoryDatabase()));
            return;
          }

          if (request.method === "POST") {
            try {
              const body = await readRequestBody(request);
              const database = JSON.parse(body);
              await writeInventoryDatabase(database);
              queueCloudInventorySync(database);
              response.statusCode = 204;
              response.end();
            } catch {
              response.statusCode = 400;
              response.end("Invalid inventory database");
            }
            return;
          }

          response.statusCode = 405;
          response.end("Method not allowed");
        });

        server.middlewares.use("/api/cloud-inventory-db/status", async (_request, response) => {
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              configured: Boolean(supabaseConfig),
              lastAutoSync: cloudSyncStatus,
              recordId: supabaseConfig?.recordId || null,
              table: supabaseConfig?.table || "inventory_databases"
            })
          );
        });

        server.middlewares.use("/api/cloud-inventory-db", async (request, response) => {
          if (!supabaseConfig) {
            response.statusCode = 503;
            response.setHeader("Content-Type", "application/json");
            response.end(
              JSON.stringify({
                configured: false,
                error: "Supabase is not configured."
              })
            );
            return;
          }

          if (request.method === "GET") {
            try {
              const cloudDatabase = await readCloudInventoryDatabase(supabaseConfig);
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ configured: true, ...cloudDatabase }));
            } catch (error) {
              response.statusCode = 502;
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ configured: true, error: error instanceof Error ? error.message : "Supabase read failed." }));
            }
            return;
          }

          if (request.method === "POST") {
            try {
              const body = await readRequestBody(request);
              const database = await writeCloudInventoryDatabase(supabaseConfig, JSON.parse(body));
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ configured: true, database }));
            } catch (error) {
              response.statusCode = 502;
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ configured: true, error: error instanceof Error ? error.message : "Supabase write failed." }));
            }
            return;
          }

          response.statusCode = 405;
          response.end("Method not allowed");
        });

        server.middlewares.use("/api/open-external", async (request, response) => {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method not allowed");
            return;
          }

          try {
            const body = await readRequestBody(request);
            const parsed = JSON.parse(body) as { url?: string };
            const url = parsed.url || "";

            if (!isAllowedExternalUrl(url)) {
              response.statusCode = 400;
              response.end("External URL is not allowed");
              return;
            }

            execFile("open", [url], (error) => {
              if (error) {
                response.statusCode = 500;
                response.end("Could not open external browser");
                return;
              }

              response.statusCode = 204;
              response.end();
            });
          } catch {
            response.statusCode = 400;
            response.end("Invalid request");
          }
        });
      }
    }
  ],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://127.0.0.1:5173/"
      }
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: "./src/test/setup.ts",
    globals: true
  }
  };
});
