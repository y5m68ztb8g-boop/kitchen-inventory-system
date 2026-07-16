# Ordering Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent ordering workspace that receives corrected AI-intake items, supports manual additions, groups one shared-PO list by supplier, checks existing stock, prepares Campbells/Mark Murphy email drafts, and fills Brakes Quick Add without ever submitting an order.

**Architecture:** Keep intake, inventory, and ordering responsibilities separate. New SQLite ordering tables and `/api/ordering/*` routes own batches, items, supplier status, inventory acknowledgements, email drafts, and Quick Add results; the existing intake tables only gain the terminal `AddedToOrder` status. A new React `#ordering` page consumes those APIs, while a server-only Playwright adapter controls a dedicated local Chrome profile for Brakes and stops at the cart.

**Tech Stack:** React 19, TypeScript, Vite middleware, better-sqlite3, Zod, Playwright with persistent Chrome context, Vitest, Testing Library, Playwright Test, lucide-react.

## Global Constraints

- All visible ordering UI, validation, and status messages are Chinese; supplier email subject and body are editable English.
- One purchasing batch has exactly one manually entered PO shared by Campbells, Mark Murphy, and Brakes; the system never generates a PO.
- Supplier groups are `CMP` (Campbells), `MM` (Mark Murphy), `BRK` (Brakes), and `UNMATCHED`.
- Confirmed ordering data persists in SQLite and never relies on browser `localStorage`.
- AI intake transfers only final corrected fields and marks the source intake `AddedToOrder`; the ordering page does not show source files or recognition text.
- Ordering quantities use the supplier's complete invoice pack as one unit.
- Before supplier preparation, matched inventory above `1` equivalent supplier pack requires per-item `去核查库存` or `仅补货` handling.
- Campbells and Mark Murphy produce editable email drafts only; no server or browser code sends email.
- Brakes automation may open/login and fill `https://www.brake.co.uk/cart` Quick Add only; it never checks out, selects delivery, confirms prices, or submits an order.
- Brakes stock, quantity-limit, substitute, and availability feedback remains Brakes' responsibility at final submission.
- Only the user can mark a supplier group `Ordered`, through a yes/no confirmation dialog; this action never modifies inventory.
- The application never stores Brakes or email passwords.
- Existing inventory behavior, live Supabase inventory, and legacy `whiteboard_*` tables remain unchanged.
- Automated browser tests use port `4174`, temporary SQLite/JSON paths, and a fake Quick Add runner; they never access live port `5174`, Supabase, email applications, or Brakes.
- Before creating or materially changing any unit test, delegate the test-only change to the `unit_test_spark` role; the parent agent owns production code and complete verification.

---

### Task 1: Add ordering schema and transactional batch lifecycle

**Files:**
- Create: `server/ordering/types.ts`
- Create: `server/ordering/schema.ts`
- Create: `server/ordering/database.ts`
- Modify: `server/purchasing/intakeSchema.ts`
- Modify: `server/purchasing/database.ts`
- Test: `src/ordering/database.test.ts`

**Interfaces:**
- Consumes: the existing `purchase_intakes`, `purchase_intake_items`, and `createPurchasingDatabase()` initialization path.
- Produces: `SupplierGroup`, `PurchaseBatch`, `PurchaseBatchItem`, `OrderingProfile`, `getOrCreateDraftBatch()`, `getBatchDetail()`, `addReadyIntakeToBatch()`, `addBatchItem()`, `updateBatchItem()`, `deleteBatchItem()`, `saveBatchPo()`, `getOrderingProfile()`, `saveOrderingProfile()`, `markSupplierOrdered()`.

- [ ] **Step 1: Delegate failing database tests to `unit_test_spark`**

Ask the test agent to create only `src/ordering/database.test.ts` with these cases:

```ts
it("creates ordering tables idempotently with foreign keys enabled", () => {
  const names = tableNames(createPurchasingDatabase(":memory:"));
  expect(names).toEqual(expect.arrayContaining([
    "purchase_batches",
    "purchase_batch_items",
    "purchase_batch_suppliers",
    "purchase_inventory_checks",
    "purchase_ordering_profile"
  ]));
});

it("migrates an existing intake database to AddedToOrder without losing rows", () => {
  const database = databaseWithPreOrderingIntakeSchema();
  const migrated = createPurchasingDatabase(database);
  expect(readIntakeStatus(migrated, "intake-1")).toBe("ReadyForPurchase");
  expect(migrated.pragma("foreign_key_check")).toEqual([]);
  expect(() => setIntakeStatus(migrated, "intake-1", "AddedToOrder")).not.toThrow();
});

it("moves one ready intake into the current draft batch exactly once", () => {
  const batch = getOrCreateDraftBatch(database, "2026-07-11T10:00:00.000Z");
  addReadyIntakeToBatch(database, { batchId: batch.id, intakeId: "intake-1", transferredAt: "2026-07-11T10:01:00.000Z" });
  expect(getBatchDetail(database, batch.id).items).toHaveLength(1);
  expect(readIntakeStatus(database, "intake-1")).toBe("AddedToOrder");
  expect(() => addReadyIntakeToBatch(database, { batchId: batch.id, intakeId: "intake-1" })).toThrowErrorMatchingObject({ code: "INTAKE_ALREADY_ADDED" });
});

it("shares one PO while supplier groups keep independent status", () => {
  saveBatchPo(database, "batch-1", "PO-7788");
  markSupplierOrdered(database, { batchId: "batch-1", supplierCode: "CMP", orderedAt: "2026-07-11T11:00:00.000Z" });
  expect(getBatchDetail(database, "batch-1")).toMatchObject({ poNumber: "PO-7788", status: "PartiallyOrdered" });
});

it("does not mutate inventory tables when a supplier is marked ordered", () => {
  const before = inventoryFixtureHash();
  markSupplierOrdered(database, { batchId: "batch-1", supplierCode: "BRK" });
  expect(inventoryFixtureHash()).toBe(before);
});
```

- [ ] **Step 2: Run the delegated tests and confirm the intended failure**

Run: `pnpm vitest run src/ordering/database.test.ts`

Expected: FAIL because `server/ordering/database.ts` and ordering tables do not exist.

- [ ] **Step 3: Define stable ordering domain types**

```ts
export type SupplierGroup = "CMP" | "MM" | "BRK" | "UNMATCHED";
export type PurchaseBatchStatus = "Draft" | "PartiallyOrdered" | "Ordered";
export type SupplierOrderStatus = "Pending" | "Prepared" | "Ordered";
export type BrakesItemStatus = "Pending" | "Added" | "AwaitingConfirmation" | "InvalidCode" | "Failed";

export type BrakesQuickAddInput = { itemId: string; productCode: string; quantity: number };
export type BrakesQuickAddResult = {
  itemId: string;
  status: Exclude<BrakesItemStatus, "Pending">;
  message: string | null;
};
export interface BrakesQuickAddRunner {
  fill(items: BrakesQuickAddInput[]): Promise<BrakesQuickAddResult[]>;
}

export type PurchaseBatchItem = {
  id: string;
  batchId: string;
  productName: string;
  supplierGroup: SupplierGroup;
  supplierProductId: string | null;
  supplierProductCode: string | null;
  supplierName: string | null;
  packSize: string | null;
  orderQuantity: number;
  orderUnit: string;
  lastPrice: number | null;
  purchaseCount: number | null;
  latestPurchaseDate: string | null;
  brakesStatus: BrakesItemStatus;
};

export type PurchaseBatchSupplier = {
  supplierCode: "CMP" | "MM" | "BRK";
  status: SupplierOrderStatus;
  preparedAt: string | null;
  orderedAt: string | null;
  emailDraft: { to: string; subject: string; body: string } | null;
};

export type PurchaseBatch = {
  id: string;
  poNumber: string;
  status: PurchaseBatchStatus;
  items: PurchaseBatchItem[];
  suppliers: PurchaseBatchSupplier[];
};

export type OrderingProfile = {
  purchaserName: string;
  hotelName: string;
  campbellsEmail: string;
  markMurphyEmail: string;
};
```

- [ ] **Step 4: Add the schema and intake terminal status**

`server/ordering/schema.ts` must export SQL for the five tables named in the design. Add `AddedToOrder` to both `PurchaseIntakeStatus` and the `purchase_intakes.status` CHECK constraint. Use foreign keys with `ON DELETE CASCADE` from batches to items, supplier rows, and inventory checks.

```sql
CREATE TABLE IF NOT EXISTS purchase_batches (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Draft', 'PartiallyOrdered', 'Ordered')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_ordering_profile (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  purchaser_name TEXT NOT NULL DEFAULT '',
  hotel_name TEXT NOT NULL DEFAULT '',
  campbells_email TEXT NOT NULL DEFAULT '',
  mark_murphy_email TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  row_order INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  supplier_group TEXT NOT NULL CHECK (supplier_group IN ('CMP', 'MM', 'BRK', 'UNMATCHED')),
  supplier_product_id TEXT,
  supplier_product_code TEXT,
  supplier_name TEXT,
  pack_size TEXT,
  order_quantity REAL NOT NULL CHECK (order_quantity > 0),
  order_unit TEXT NOT NULL,
  last_price REAL,
  purchase_count INTEGER,
  latest_purchase_date TEXT,
  brakes_status TEXT NOT NULL CHECK (brakes_status IN ('Pending', 'Added', 'AwaitingConfirmation', 'InvalidCode', 'Failed')),
  brakes_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_batch_suppliers (
  batch_id TEXT NOT NULL,
  supplier_code TEXT NOT NULL CHECK (supplier_code IN ('CMP', 'MM', 'BRK')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Prepared', 'Ordered')),
  email_to TEXT,
  email_subject TEXT,
  email_body TEXT,
  prepared_at TEXT,
  ordered_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, supplier_code),
  FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_inventory_checks (
  batch_id TEXT NOT NULL,
  item_id TEXT PRIMARY KEY,
  snapshot_key TEXT NOT NULL,
  equivalent_quantity REAL NOT NULL,
  locations_json TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('NeedsRecheck', 'RestockOnly')),
  confirmed_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES purchase_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES purchase_batch_items(id) ON DELETE CASCADE
);
```

Append `orderingSchema` inside `createPurchasingDatabase()` without changing legacy `whiteboard_*` table definitions.

- [ ] **Step 5: Migrate the existing intake CHECK constraint safely**

Before executing the new ordering schema, inspect `sqlite_master.sql` for `purchase_intakes`. If it does not contain `AddedToOrder`, `migratePurchaseIntakesForOrdering()` must disable foreign keys, rebuild `purchase_intakes`, `purchase_intake_items`, and `purchase_match_feedback_item_state` inside one transaction with their current columns and constraints, copy every row, drop the legacy tables, re-enable foreign keys, and reject startup if `PRAGMA foreign_key_check` returns rows. Restore `PRAGMA foreign_keys = ON` in `finally` even when migration fails.

- [ ] **Step 6: Implement transactions and state recomputation**

`addReadyIntakeToBatch()` must, in one transaction, validate `ReadyForPurchase`, copy only final product/match/order fields into `purchase_batch_items`, create non-empty supplier rows, and update the intake to `AddedToOrder`. `markSupplierOrdered()` must recompute the batch status from non-empty supplier groups and must not call inventory APIs.

- [ ] **Step 7: Run focused tests and commit**

Run: `pnpm vitest run src/ordering/database.test.ts src/purchasing/database.test.ts`

Expected: PASS.

```bash
git add server/ordering/types.ts server/ordering/schema.ts server/ordering/database.ts server/purchasing/intakeSchema.ts server/purchasing/database.ts src/ordering/database.test.ts
git commit -m "feat: persist supplier ordering batches"
```

### Task 2: Build equivalent inventory snapshots and location deep links

**Files:**
- Create: `src/inventoryQuantity.ts`
- Modify: `src/inventoryStore.ts`
- Create: `server/ordering/inventory.ts`
- Modify: `src/App.tsx`
- Modify: `src/FreezerPage.tsx`
- Modify: `src/DryStorePage.tsx`
- Test: `src/ordering/inventory.test.ts`
- Test: `src/Home.test.tsx`

**Interfaces:**
- Consumes: raw JSON inventory database, `FREEZER_INVENTORY`, supplier product IDs, current package-count behavior, freezer/dry-store location formatters.
- Produces: `calculateInventoryUnits()`, `buildOrderingInventorySnapshot()`, `inventorySnapshotKey()`, `inventoryDeepLink()`, and hash routes that accept `supplierProductId` and `location` query parameters.

- [ ] **Step 1: Delegate quantity and deep-link regression tests to `unit_test_spark`**

The agent may edit only `src/ordering/inventory.test.ts` and the relevant route assertions in `src/Home.test.tsx`:

```ts
it("converts full and loose packages into equivalent supplier packs", () => {
  const snapshot = buildOrderingInventorySnapshot(inventoryDb({ fullPackageCount: 1, loosePackageCount: 4, packSize: "8x6" }), baseline);
  expect(snapshot.get("BRK-100243")?.totalEquivalentQuantity).toBe(1.5);
});

it("keeps every location for one matched supplier product", () => {
  const item = buildOrderingInventorySnapshot(multiLocationDb, baseline).get("BRK-100243");
  expect(item?.locations).toEqual([
    expect.objectContaining({ warehouse: "freezer", locationCode: "A1" }),
    expect.objectContaining({ warehouse: "dry-store", locationCode: "C0" })
  ]);
});

it("opens the selected inventory location from an ordering deep link", async () => {
  window.location.hash = "#freezer?supplierProductId=BRK-100243&location=A1";
  render(<App />);
  expect(screen.getByRole("button", { name: "A1" })).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run src/ordering/inventory.test.ts src/Home.test.tsx`

Expected: FAIL because the shared quantity module, snapshot builder, and route query handling do not exist.

- [ ] **Step 3: Extract the existing pure quantity calculations**

Move the pure package parsing/calculation from `inventoryStore.ts` into `inventoryQuantity.ts`, then re-export it from `inventoryStore.ts` so current imports and behavior remain stable.

```ts
export type InventoryQuantityInput = {
  quantity: number;
  quantityText?: string;
  fullPackageCount?: number;
  loosePackageCount?: number;
  openPackagePercent?: number;
  supplierProduct: { packSize: string };
};

export function calculateInventoryUnits(entry: InventoryQuantityInput): number;
export function getInventoryPackageCounts(entry: InventoryQuantityInput): { fullPackageCount: number; loosePackageCount: number; unitsPerCase: number };
export function getSupplierUnitsPerCase(product: Pick<SupplierProduct, "packSize">): number;
```

- [ ] **Step 4: Build server-side inventory snapshots**

```ts
export type OrderingInventorySnapshot = {
  supplierProductId: string;
  totalEquivalentQuantity: number;
  locations: Array<{
    warehouse: "freezer" | "dry-store";
    warehouseLabel: "冷冻库" | "干货库";
    locationCode: string;
    displayQuantity: string;
    equivalentQuantity: number;
  }>;
};

export function inventorySnapshotKey(snapshot: OrderingInventorySnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
```

Use supplier-product ID matches first and existing name fallback rules second. Never write inventory from this module.

- [ ] **Step 5: Support inventory location query parameters**

Change `App.getRoute()` to split the hash at `?`. On freezer/dry-store initial render, read `location` and `supplierProductId`, activate the matching shelf filter, and visually highlight the matching row. `inventoryDeepLink()` returns links such as `#freezer?supplierProductId=BRK-100243&location=A1`; unsupported warehouses return `#ordering` without a false location.

- [ ] **Step 6: Run focused and existing inventory tests, then commit**

Run: `pnpm vitest run src/ordering/inventory.test.ts src/Home.test.tsx src/playwrightIsolation.test.ts`

Expected: PASS with unchanged existing valuation calculations.

```bash
git add src/inventoryQuantity.ts src/inventoryStore.ts server/ordering/inventory.ts src/App.tsx src/FreezerPage.tsx src/DryStorePage.tsx src/ordering/inventory.test.ts src/Home.test.tsx
git commit -m "feat: expose ordering inventory checks"
```

### Task 3: Add ordering APIs for batches, transfers, manual items, and profile

**Files:**
- Create: `server/ordering/routes.ts`
- Modify: `server/ordering/database.ts`
- Modify: `server/purchasing/errors.ts`
- Modify: `vite.config.ts`
- Create: `src/ordering/types.ts`
- Create: `src/ordering/api.ts`
- Test: `src/ordering/routes.test.ts`
- Test: `src/ordering/api.test.ts`

**Interfaces:**
- Consumes: Task 1 database functions, historical candidates, Task 2 inventory snapshots, and Vite's existing `readInventoryDatabase()` callback.
- Produces: `installOrderingRoutes()`, browser-safe response types, and client methods for current batch, transfer, CRUD, PO, and profile.

- [ ] **Step 1: Delegate failing HTTP and API-client tests to `unit_test_spark`**

Required route cases:

```ts
it("GET /api/ordering/current returns one draft batch and ready intakes", async () => {
  const response = await request("GET", "/api/ordering/current");
  expect(await response.json()).toMatchObject({ batch: { status: "Draft", supplierGroups: expect.any(Array) }, readyIntakes: [] });
});

it("POST /api/ordering/current/intakes/:id imports once and returns AddedToOrder", async () => {
  const response = await request("POST", "/api/ordering/current/intakes/intake-1");
  expect(await response.json()).toMatchObject({ intakeStatus: "AddedToOrder", batch: { items: expect.any(Array) } });
});

it("rejects client-supplied supplier snapshots that do not exist in the catalogue", async () => {
  const response = await request("POST", "/api/ordering/batches/batch-1/items", { supplierProductId: "made-up", orderQuantity: 2 });
  expect(response.statusCode).toBe(400);
});
```

Client tests must assert the exact URLs and Chinese mappings for `PO_REQUIRED`, `INVALID_ORDER_QUANTITY`, `SUPPLIER_PRODUCT_NOT_FOUND`, `INTAKE_ALREADY_ADDED`, and `ORDER_BATCH_NOT_FOUND`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/ordering/routes.test.ts src/ordering/api.test.ts`

Expected: FAIL because `/api/ordering/*` is not installed.

- [ ] **Step 3: Implement and install the route boundary**

```ts
export type OrderingRouteOptions = {
  database: Database.Database;
  historicalCandidates: () => HistoricalProductCandidate[] | Promise<HistoricalProductCandidate[]>;
  orderingInventory: () => Map<string, OrderingInventorySnapshot> | Promise<Map<string, OrderingInventorySnapshot>>;
  quickAdd?: BrakesQuickAddRunner;
};

export function installOrderingRoutes(server: OrderingMiddlewareServer, options: OrderingRouteOptions): void;
```

Install it next to `installPurchasingRoutes()` in `vite.config.ts`. Under `GROW_NATURALLY_E2E=1`, inject a fake runner in a later task; do not instantiate Chrome during route installation.

- [ ] **Step 4: Add validated endpoints**

Implement:

```text
GET    /api/ordering/current
POST   /api/ordering/current/intakes/:intakeId
PUT    /api/ordering/batches/:batchId/po
POST   /api/ordering/batches/:batchId/items
PUT    /api/ordering/batches/:batchId/items/:itemId
DELETE /api/ordering/batches/:batchId/items/:itemId
GET    /api/ordering/profile
PUT    /api/ordering/profile
```

All write payloads use strict Zod schemas. A matched item accepts only `supplierProductId` and order quantity from the browser; the server rehydrates supplier, code, pack, price, purchase count, and date from the catalogue. An unmatched item accepts product name, quantity, unit, and optional `CMP`/`MM`/`BRK`; `BRK` requires a code before preparation.

Every batch GET/write response enriches matched items from the latest `orderingInventory()` snapshot with equivalent stock quantity, all locations, and deep links. These are response fields only and are not copied back into inventory storage.

- [ ] **Step 5: Implement typed client methods**

```ts
export type CurrentOrderingResponse = {
  batch: PurchaseBatch;
  readyIntakes: Array<{ id: string; originalFilename: string; handedOffAt: string; itemCount: number }>;
};

export type AddOrderingItemInput =
  | { supplierProductId: string; orderQuantity: number }
  | { productName: string; orderQuantity: number; orderUnit: string; supplierGroup: SupplierGroup; supplierProductCode?: string };

export type UpdateOrderingItemInput = {
  productName?: string;
  orderQuantity?: number;
  orderUnit?: string;
  supplierGroup?: SupplierGroup;
  supplierProductCode?: string | null;
  supplierProductId?: string | null;
};

export function getCurrentOrderingBatch(): Promise<CurrentOrderingResponse>;
export function importReadyIntake(intakeId: string): Promise<CurrentOrderingResponse>;
export function saveBatchPo(batchId: string, poNumber: string): Promise<PurchaseBatch>;
export function addOrderingItem(batchId: string, input: AddOrderingItemInput): Promise<PurchaseBatch>;
export function updateOrderingItem(batchId: string, itemId: string, input: UpdateOrderingItemInput): Promise<PurchaseBatch>;
export function deleteOrderingItem(batchId: string, itemId: string): Promise<PurchaseBatch>;
export function getOrderingProfile(): Promise<OrderingProfile>;
export function saveOrderingProfile(input: OrderingProfile): Promise<OrderingProfile>;
```

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run src/ordering/routes.test.ts src/ordering/api.test.ts src/purchasing/routes.test.ts`

Expected: PASS; existing purchasing endpoints remain unchanged.

```bash
git add server/ordering/routes.ts server/ordering/database.ts server/purchasing/errors.ts vite.config.ts src/ordering/types.ts src/ordering/api.ts src/ordering/routes.test.ts src/ordering/api.test.ts
git commit -m "feat: expose ordering batch APIs"
```

### Task 4: Add stock-gated supplier preparation and email drafts

**Files:**
- Create: `server/ordering/emailDraft.ts`
- Modify: `server/ordering/database.ts`
- Modify: `server/ordering/routes.ts`
- Modify: `src/ordering/api.ts`
- Modify: `src/ordering/types.ts`
- Test: `src/ordering/preparation.test.ts`

**Interfaces:**
- Consumes: current batch, ordering profile, Task 2 inventory snapshot/key, and supplier group status.
- Produces: `buildSupplierEmailDraft()`, `prepareSupplierGroup()`, `recordInventoryRecheck()`, `acknowledgeRestockOnly()`, and preparation endpoints returning either inventory review or supplier payload.

- [ ] **Step 1: Delegate preparation tests to `unit_test_spark`**

```ts
it("returns one combined inventory review for every matched item above one pack", async () => {
  const response = await prepare("CMP", snapshots({ milk: 2, eggs: 1.25, cream: 0.5 }));
  expect(response).toEqual({ kind: "inventory-review-required", items: expect.arrayContaining([
    expect.objectContaining({ productName: "Milk", totalEquivalentQuantity: 2 }),
    expect.objectContaining({ productName: "Eggs", totalEquivalentQuantity: 1.25 })
  ]) });
});

it("invalidates RestockOnly when the inventory snapshot changes", async () => {
  acknowledgeRestockOnly(database, { batchId: "batch-1", itemId: "milk", snapshot: firstSnapshot });
  expect(await prepareWithSnapshot(secondSnapshot)).toMatchObject({ kind: "inventory-review-required" });
});

it("builds an editable English draft with the shared PO and supplier packs", () => {
  expect(buildSupplierEmailDraft(input)).toMatchObject({
    subject: "Order - Grow Naturally Hotel - PO PO-7788",
    body: expect.stringContaining("2 x 8x6 Orange Juice")
  });
});

it("does not expose any send-email operation", () => {
  expect(Object.keys(emailDraftModule)).not.toContain("sendEmail");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/ordering/preparation.test.ts`

Expected: FAIL because preparation and email-draft functions do not exist.

- [ ] **Step 3: Implement inventory acknowledgement semantics**

`POST /api/ordering/batches/:batchId/items/:itemId/restock-only` must read the current server snapshot itself and persist its SHA-256 key; it must not accept a browser-provided quantity or key. `prepareSupplierGroup()` rechecks current snapshots every time and returns all items above `1` whose stored key no longer matches.

The client-side `去核查库存` action calls the recheck endpoint to persist `NeedsRecheck`, then navigates to `inventoryDeepLink()`. It does not approve the item and leaves preparation blocked until inventory falls to `1` or less, or the user returns and chooses `仅补货`.

```ts
export type PreparationResult =
  | {
      kind: "inventory-review-required";
      items: Array<{
        itemId: string;
        productName: string;
        totalEquivalentQuantity: number;
        locations: OrderingInventorySnapshot["locations"];
        inventoryLink: string;
      }>;
    }
  | { kind: "email-draft"; draft: SupplierEmailDraft }
  | { kind: "brakes-ready"; items: BrakesQuickAddInput[] };

export function prepareSupplierGroup(
  database: Database.Database,
  input: {
    batchId: string;
    supplierCode: "CMP" | "MM" | "BRK";
    inventory: Map<string, OrderingInventorySnapshot>;
    preparedAt?: string;
  }
): PreparationResult;

export function acknowledgeRestockOnly(
  database: Database.Database,
  input: { batchId: string; itemId: string; snapshot: OrderingInventorySnapshot; confirmedAt?: string }
): void;

export function recordInventoryRecheck(
  database: Database.Database,
  input: { batchId: string; itemId: string; snapshot: OrderingInventorySnapshot; recordedAt?: string }
): void;
```

- [ ] **Step 4: Implement deterministic email generation**

```ts
export type SupplierEmailDraft = {
  supplierCode: "CMP" | "MM";
  to: string;
  subject: string;
  body: string;
};

export function buildSupplierEmailDraft(input: {
  supplierCode: "CMP" | "MM";
  poNumber: string;
  profile: OrderingProfile;
  items: PurchaseBatchItem[];
}): SupplierEmailDraft;
```

Body order is greeting, request sentence, one line per item (`quantity x pack product [code]`), PO line, purchaser/hotel signature. Validate non-empty PO, purchaser, hotel, recipient, products, and positive quantities before returning it.

- [ ] **Step 5: Add preparation and draft endpoints**

```text
POST /api/ordering/batches/:batchId/suppliers/:supplierCode/prepare
POST /api/ordering/batches/:batchId/items/:itemId/restock-only
POST /api/ordering/batches/:batchId/items/:itemId/recheck-inventory
PUT  /api/ordering/batches/:batchId/suppliers/:supplierCode/email-draft
```

Preparation returns `{ kind: "inventory-review-required", items }`, `{ kind: "email-draft", draft }`, or `{ kind: "brakes-ready", items }`. Saving a draft marks CMP/MM `Prepared` but never sends it.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run src/ordering/preparation.test.ts src/ordering/routes.test.ts`

Expected: PASS.

```bash
git add server/ordering/emailDraft.ts server/ordering/database.ts server/ordering/routes.ts src/ordering/api.ts src/ordering/types.ts src/ordering/preparation.test.ts
git commit -m "feat: gate supplier orders on stock review"
```

### Task 5: Build the ordering page and home entry

**Files:**
- Create: `src/OrderingPage.tsx`
- Create: `src/OrderingPage.css`
- Create: `src/ordering/InventoryReviewDialog.tsx`
- Create: `src/ordering/EmailDraftDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/homeModules.ts`
- Modify: `src/Home.tsx`
- Modify: `src/App.css`
- Modify: `src/copy.ts`
- Modify: `src/PurchasingPage.tsx`
- Modify: `src/purchasing/api.ts`
- Test: `src/OrderingPage.test.tsx`
- Test: `src/Home.test.tsx`
- Test: `src/PurchasingPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 3-4 APIs, existing `ProductMatchDialog`, existing historical-product cards, and inventory deep links.
- Produces: `#ordering` route, home tile, unified four-group list, manual add/edit, ready-intake import, PO field, stock-review dialog, and email-draft dialog.

- [ ] **Step 1: Delegate component tests to `unit_test_spark`**

Required tests:

```tsx
it("shows one PO field and four supplier groups in one list", async () => {
  render(<OrderingPage />);
  expect(await screen.findByLabelText("采购 PO 号码")).toBeInTheDocument();
  for (const name of ["Campbells", "Mark Murphy", "Brakes", "未匹配供应商"]) {
    expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
  }
});

it("adds a historical product using supplier pack quantity", async () => {
  await addHistoricalProduct("Brakes The Juice Orange", 2);
  expect(screen.getByText("12x1ltr")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: /Brakes The Juice Orange/ })).toHaveValue(2);
});

it("renders all high-stock items in one review dialog", async () => {
  await user.click(screen.getByRole("button", { name: "准备 Campbells 邮件" }));
  expect(screen.getByRole("dialog", { name: "下单前核查库存" })).toHaveTextContent("去核查库存");
  expect(screen.getAllByRole("button", { name: "仅补货" })).toHaveLength(2);
});

it("opens an editable mailto draft but never sends email", async () => {
  expect(screen.getByRole("button", { name: "打开邮件" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "发送邮件" })).not.toBeInTheDocument();
});
```

Home tests add the fifth `下单` tile with `ShoppingCart` icon and `href="#ordering"`. Purchasing tests assert that a successful handoff offers `转入下单模块`, imports once, then navigates to `#ordering`.

- [ ] **Step 2: Run component tests and verify failure**

Run: `pnpm vitest run src/OrderingPage.test.tsx src/Home.test.tsx src/PurchasingPage.test.tsx`

Expected: FAIL because the route, tile, and page do not exist.

- [ ] **Step 3: Add route, home tile, and responsive grid**

Add `ordering` to `HomeModule.id`, `copy.home.ordering`, and `App` routing. Use `ShoppingCart` from lucide-react. On wide screens, allow the five modules to shrink into an auto-fit grid; keep two columns on mobile and preserve the existing search full-screen behavior.

```css
.home-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  max-width: 840px;
}

@media (max-width: 560px) {
  .home-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [ ] **Step 4: Implement the page state and unified list**

Load `getCurrentOrderingBatch()` on mount. Render one PO field, `导入待采购项目`, `手动添加`, and four collapsible groups. Rows show product, supplier/code, pack, order quantity, last price, purchase count/date, current stock/locations, edit/rematch, and delete.

Use `ProductMatchDialog` for matched manual additions. Provide an unmatched form with product name, positive quantity, unit, and optional supplier; require a Brakes code if the manual supplier is BRK.

- [ ] **Step 5: Implement stock review and email draft UI**

The stock dialog lists all blockers from one preparation response. `去核查库存` saves the current ordering page state in SQLite (already persisted) and follows the supplied hash link. `仅补货` calls the server acknowledgement and removes only that resolved row; when all resolve, repeat prepare.

The email dialog has editable `to`, `subject`, and `body`, plus icon buttons for copy and close and text commands `保存草稿` and `打开邮件`. Build the `mailto:` URL only after saving the draft. Do not render any send command.

- [ ] **Step 6: Add ordering-profile editing**

Provide a compact settings dialog for purchaser name, hotel name, Campbells email, and Mark Murphy email. Save through SQLite API; per-draft edits do not overwrite the profile unless the user explicitly saves settings.

- [ ] **Step 7: Run tests, build, and commit**

Run: `pnpm vitest run src/OrderingPage.test.tsx src/Home.test.tsx src/PurchasingPage.test.tsx && pnpm build`

Expected: PASS and production build succeeds.

```bash
git add src/OrderingPage.tsx src/OrderingPage.css src/ordering/InventoryReviewDialog.tsx src/ordering/EmailDraftDialog.tsx src/App.tsx src/homeModules.ts src/Home.tsx src/App.css src/copy.ts src/PurchasingPage.tsx src/purchasing/api.ts src/OrderingPage.test.tsx src/Home.test.tsx src/PurchasingPage.test.tsx
git commit -m "feat: add unified supplier ordering workspace"
```

### Task 6: Implement the Brakes Quick Add adapter without checkout capability

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Create: `server/ordering/brakesQuickAdd.ts`
- Modify: `server/ordering/routes.ts`
- Modify: `server/ordering/database.ts`
- Modify: `vite.config.ts`
- Test: `src/ordering/brakesQuickAdd.test.ts`
- Test: `src/ordering/routes.test.ts`

**Interfaces:**
- Consumes: `{ itemId, productCode, quantity }[]` from prepared BRK items and a profile path outside source control.
- Produces: `BrakesQuickAddRunner.fill()`, per-item results, `POST /api/ordering/batches/:batchId/suppliers/BRK/quick-add`, and a fake E2E runner.

- [ ] **Step 1: Delegate runner contract and safety tests to `unit_test_spark`**

```ts
it("fills product code and quantity and records a visible cart confirmation", async () => {
  const result = await runner.fill([{ itemId: "chips", productCode: "135177", quantity: 2 }]);
  expect(result).toEqual([{ itemId: "chips", status: "Added", message: null }]);
  expect(fakePage.actions).toEqual(["goto-cart", "fill-code:135177", "fill-quantity:2", "click-add"]);
});

it("uses AwaitingConfirmation unless Brakes explicitly confirms or rejects the code", async () => {
  expect((await ambiguousRunner.fill(queue))[0].status).toBe("AwaitingConfirmation");
});

it("never locates or clicks checkout, delivery, price-confirmation, or place-order controls", async () => {
  await runner.fill(queue);
  expect(fakePage.forbiddenActions).toEqual([]);
});

it("retries only Pending, AwaitingConfirmation, InvalidCode, or Failed rows", async () => {
  expect(buildRetryQueue(itemsWithOneAdded).map((item) => item.itemId)).not.toContain("already-added");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/ordering/brakesQuickAdd.test.ts src/ordering/routes.test.ts`

Expected: FAIL because the Quick Add runner does not exist.

- [ ] **Step 3: Add Playwright as a direct runtime dependency and ignore the profile**

Run: `pnpm add playwright@^1.49.1`

Add `local-data/brakes-chrome-profile/` to `.gitignore`. The default path is `local-data/brakes-chrome-profile`; allow server-only override with `GROW_NATURALLY_BRAKES_PROFILE_PATH`.

- [ ] **Step 4: Implement a narrow persistent-context runner**

```ts
export function createBrakesQuickAddRunner(input: { profilePath: string }): BrakesQuickAddRunner;
```

Its `fill()` method accepts `BrakesQuickAddInput[]` and returns `BrakesQuickAddResult[]` without adding any broader browser-control methods.

Launch `chromium.launchPersistentContext(profilePath, { channel: "chrome", headless: false })` only after an explicit API request. Navigate only to `https://www.brake.co.uk/cart`. Locate Quick Add by accessible `Quick Add` text and product-code/quantity labels, with `input[name*="productCode"]` and `input[name*="quantity"]` fallbacks. After Add, classify only explicit cart-line/code visibility as `Added` and explicit invalid/not-found text as `InvalidCode`; otherwise use `AwaitingConfirmation`. A missing form becomes `Failed` with Chinese `Brakes Quick Add 页面已变化。`.

Do not implement selectors, methods, or endpoints for checkout, order submission, delivery selection, or price confirmation.

- [ ] **Step 5: Add the explicit Quick Add route and persistence**

The route must:

1. reject non-BRK supplier paths;
2. rerun Task 4 inventory checks;
3. reject missing PO/code/quantity;
4. call the injected runner only after an explicit POST;
5. persist every result transactionally;
6. mark BRK `Prepared` if at least one item is `Added` or `AwaitingConfirmation`;
7. return the refreshed batch without marking it ordered.

When `GROW_NATURALLY_E2E=1`, inject a deterministic fake runner from `vite.config.ts`; never launch Chrome in tests.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run src/ordering/brakesQuickAdd.test.ts src/ordering/routes.test.ts src/playwrightIsolation.test.ts`

Expected: PASS and the isolation test confirms E2E cannot use the real runner.

```bash
git add package.json pnpm-lock.yaml .gitignore server/ordering/brakesQuickAdd.ts server/ordering/routes.ts server/ordering/database.ts vite.config.ts src/ordering/brakesQuickAdd.test.ts src/ordering/routes.test.ts src/playwrightIsolation.test.ts
git commit -m "feat: fill Brakes Quick Add locally"
```

### Task 7: Wire Brakes progress and manual supplier completion into the UI

**Files:**
- Modify: `src/OrderingPage.tsx`
- Modify: `src/OrderingPage.css`
- Modify: `src/ordering/api.ts`
- Modify: `src/ordering/types.ts`
- Modify: `server/ordering/routes.ts`
- Test: `src/OrderingPage.test.tsx`

**Interfaces:**
- Consumes: Task 6 Quick Add endpoint and supplier status from Task 1.
- Produces: explicit `填入 Brakes 购物车`, retry, per-row status, and confirmed `标记为已下单` actions for all suppliers.

- [ ] **Step 1: Delegate final ordering interaction tests to `unit_test_spark`**

```tsx
it("shows Quick Add progress without claiming the order succeeded", async () => {
  await user.click(screen.getByRole("button", { name: "填入 Brakes 购物车" }));
  expect(await screen.findByText("已填入购物车")).toBeInTheDocument();
  expect(screen.queryByText("下单成功")).not.toBeInTheDocument();
});

it("requires yes/no confirmation before manual Ordered status", async () => {
  await user.click(screen.getByRole("button", { name: /Campbells.*标记为已下单/ }));
  const dialog = screen.getByRole("dialog", { name: "确认已下单" });
  expect(within(dialog).getByRole("button", { name: "是" })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "否" })).toBeInTheDocument();
});

it("keeps supplier groups independent and shows partial completion", async () => {
  await markOrdered("CMP");
  expect(screen.getByText("部分已下单")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Brakes.*标记为已下单/ })).toBeEnabled();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest run src/OrderingPage.test.tsx`

Expected: FAIL because Quick Add progress and manual completion are not wired.

- [ ] **Step 3: Add Quick Add client actions and status display**

Render each status exactly as `待填入`, `已填入购物车`, `等待 Brakes 确认`, `无效编码`, or `填写失败`. Disable duplicate clicks while running. The retry command calls the same endpoint; the server excludes `Added` items.

- [ ] **Step 4: Add manual completion endpoint and confirmation dialog**

```text
POST /api/ordering/batches/:batchId/suppliers/:supplierCode/mark-ordered
```

Allow only non-empty CMP/MM/BRK groups that reached `Prepared`. The dialog uses buttons `是` and `否`; `否` closes without writes. `是` records server time, refreshes group/batch status, and does not modify inventory.

- [ ] **Step 5: Run tests, build, and commit**

Run: `pnpm vitest run src/OrderingPage.test.tsx src/ordering/routes.test.ts && pnpm build`

Expected: PASS and build succeeds.

```bash
git add src/OrderingPage.tsx src/OrderingPage.css src/ordering/api.ts src/ordering/types.ts server/ordering/routes.ts src/OrderingPage.test.tsx src/ordering/routes.test.ts
git commit -m "feat: complete manual supplier order workflow"
```

### Task 8: Add isolated end-to-end coverage and perform live-data safety verification

**Files:**
- Create: `e2e/ordering.spec.ts`
- Create: `e2e/fixtures/ordering-intake.csv`
- Modify: `playwright.config.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: complete ordering UI, fake Quick Add runner, temporary SQLite and inventory JSON paths.
- Produces: desktop/mobile workflow coverage and final evidence that real inventory is unchanged.

- [ ] **Step 1: Record the live inventory hash before tests**

Run:

```bash
shasum -a 256 local-data/inventory-db.json
```

Expected: one hash saved in the task notes for final comparison.

- [ ] **Step 2: Add E2E workflow coverage**

`e2e/ordering.spec.ts` must cover:

```ts
async function createReadyIntake(page: Page) {
  await page.goto("/#purchasing");
  await page.getByRole("button", { name: "手动上传录入" }).click();
  await page.locator('input[type="file"]:not([capture])').setInputFiles("e2e/fixtures/ordering-intake.csv");
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.getByRole("button", { name: "匹配发票商品 Brakes The Juice Orange" }).click();
  await page.getByRole("button", { name: "选择 Brakes The Juice Orange" }).click();
  await page.getByRole("button", { name: "转入采购清单" }).click();
}

test("imports corrected intake and fills Brakes without submitting", async ({ page }) => {
  await createReadyIntake(page);
  await page.getByRole("button", { name: "转入下单模块" }).click();
  await page.getByLabel("采购 PO 号码").fill("PO-E2E-1");
  await expect(page.getByText("Campbells")).toBeVisible();
  await expect(page.getByText("Mark Murphy")).toBeVisible();
  await expect(page.getByText("Brakes")).toBeVisible();
  await page.getByRole("button", { name: "填入 Brakes 购物车" }).click();
  await expect(page.getByText("已填入购物车")).toBeVisible();
  await expect(page.getByText("下单成功")).toHaveCount(0);
});
```

The CSV fixture content is deterministic and requires no AI service:

```csv
product,quantity,unit
Brakes The Juice Orange,2,case
```

Also cover manual historical add, unmatched add, one combined stock-review dialog, `仅补货`, inventory deep link, email preview/copy fallback, yes/no manual completion, mobile group layout, refresh persistence, and duplicate intake prevention.

- [ ] **Step 3: Prove the test server is isolated**

Keep `GROW_NATURALLY_E2E=1`, `/tmp/grow-naturally-e2e-$$-inventory.json`, `/tmp/grow-naturally-e2e-$$-purchasing.sqlite`, port `4174`, and `reuseExistingServer: false`. Add a test-only Quick Add result fixture through server injection; do not add an environment flag that could make the browser call Brakes.

- [ ] **Step 4: Run focused E2E and inspect desktop/mobile screenshots**

Run: `pnpm playwright test e2e/ordering.spec.ts --project=desktop && pnpm playwright test e2e/ordering.spec.ts --project=mobile`

Expected: PASS. Inspect failure-free screenshots manually at `1440x900` and `390x844` using the in-app browser; verify no overlaps, clipped PO field, hidden supplier actions, or accidental checkout wording.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
pnpm test
pnpm build
pnpm test:e2e
git diff --check
```

Expected: all Vitest tests pass, TypeScript/Vite build passes, all Playwright projects pass with only documented project-specific skips, and `git diff --check` prints nothing.

- [ ] **Step 6: Compare the live inventory hash**

Run: `shasum -a 256 local-data/inventory-db.json`

Expected: exactly the same hash recorded in Step 1. Also verify no network request in E2E traces targets `brake.co.uk`, Supabase, or an email provider.

- [ ] **Step 7: Update progress and commit**

Record task completion, test counts, build result, E2E result, and identical before/after inventory hashes in `.superpowers/sdd/progress.md`.

```bash
git add e2e/ordering.spec.ts e2e/fixtures/ordering-intake.csv playwright.config.ts .superpowers/sdd/progress.md
git commit -m "test: verify isolated ordering workflow"
```

### Task 9: Final code review and branch handoff

**Files:**
- Review only: all files changed by Tasks 1-8
- Modify only if review findings require fixes

**Interfaces:**
- Consumes: complete implementation and verification evidence.
- Produces: reviewed branch ready for user acceptance, with no supplier submission side effects.

- [ ] **Step 1: Request a requirements review**

Use `superpowers:requesting-code-review` to compare the implementation against `docs/superpowers/specs/2026-07-11-ordering-module-design.md`. Require explicit review of unified PO, four groups, equivalent-stock threshold, stale `仅补货` invalidation, manual ordered state, and no automatic submission.

- [ ] **Step 2: Request a code-quality review**

Review transaction boundaries, Zod validation, retry idempotency, React async-state cleanup, mailto escaping, Playwright persistent-context lifecycle, forbidden checkout capability, and E2E isolation.

- [ ] **Step 3: Resolve findings with TDD**

For every behavior fix requiring a unit test, first delegate the failing regression test to `unit_test_spark`, verify it fails, then change production code and rerun the focused suite. Commit each coherent fix separately.

- [ ] **Step 4: Repeat final verification**

Run:

```bash
pnpm test
pnpm build
pnpm test:e2e
git diff --check
git status --short
```

Expected: all checks pass; `git status --short` shows only known pre-existing unrelated user changes plus intentional ordering work already committed.

- [ ] **Step 5: Hand off for acceptance**

Use `superpowers:finishing-a-development-branch` and provide the local system URL, the dedicated Brakes login-profile behavior, exact verification totals, and a reminder that supplier emails and Brakes checkout remain manual.
