import {
  loadDeletedInventoryItemIds,
  loadInventoryEntries,
  loadSourceProductNameOverrides,
  saveDeletedInventoryItemIds,
  saveInventoryEntries,
  saveSourceProductNameOverrides,
  type InventoryEntry
} from "./inventoryStore";

export type InventoryDatabase = {
  deletedFreezerInventoryIds: string[];
  dryStore: InventoryEntry[];
  freezer: InventoryEntry[];
  freezerSourceNameOverrides: Record<string, string>;
};

const emptyDatabase: InventoryDatabase = {
  deletedFreezerInventoryIds: [],
  dryStore: [],
  freezer: [],
  freezerSourceNameOverrides: {}
};

export function loadLocalInventoryDatabase(): InventoryDatabase {
  return {
    deletedFreezerInventoryIds: loadDeletedInventoryItemIds(),
    dryStore: loadInventoryEntries("dry-store"),
    freezer: loadInventoryEntries("freezer"),
    freezerSourceNameOverrides: loadSourceProductNameOverrides()
  };
}

export function saveLocalInventoryDatabase(database: InventoryDatabase) {
  saveInventoryEntries(database.freezer, "freezer", { persistRemote: false });
  saveInventoryEntries(database.dryStore, "dry-store", { persistRemote: false });
  saveDeletedInventoryItemIds(database.deletedFreezerInventoryIds, { persistRemote: false });
  saveSourceProductNameOverrides(database.freezerSourceNameOverrides, { persistRemote: false });
}

export function shouldSyncInventoryDatabaseFromServer() {
  const mode = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE;

  return mode !== "test";
}

export async function syncInventoryDatabaseFromServer() {
  if (!shouldSyncInventoryDatabaseFromServer()) {
    return loadLocalInventoryDatabase();
  }

  try {
    const localDatabase = loadLocalInventoryDatabase();
    const response = await window.fetch("/api/inventory-db");
    if (!response.ok) {
      return localDatabase;
    }

    const serverDatabase = normalizeInventoryDatabase(await response.json());
    if (isInventoryDatabaseEmpty(serverDatabase)) {
      await saveInventoryDatabaseToServer(localDatabase);
      return localDatabase;
    }

    saveLocalInventoryDatabase(serverDatabase);
    return serverDatabase;
  } catch {
    return loadLocalInventoryDatabase();
  }
}

export function persistLocalInventoryDatabase() {
  void saveInventoryDatabaseToServer(loadLocalInventoryDatabase());
}

export async function persistInventoryDatabase(database: InventoryDatabase) {
  await saveInventoryDatabaseToServer(database);
}

async function saveInventoryDatabaseToServer(database: InventoryDatabase) {
  await window.fetch("/api/inventory-db", {
    body: JSON.stringify(database),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
}

function isInventoryDatabaseEmpty(database: InventoryDatabase) {
  return (
    database.freezer.length === 0 &&
    database.dryStore.length === 0 &&
    database.deletedFreezerInventoryIds.length === 0 &&
    Object.keys(database.freezerSourceNameOverrides).length === 0
  );
}

function normalizeInventoryDatabase(input: unknown): InventoryDatabase {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return emptyDatabase;
  }

  const value = input as Partial<InventoryDatabase>;

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
