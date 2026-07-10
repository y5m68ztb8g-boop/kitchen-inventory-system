# Purchasing Information Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home-page AI intake tile into a multi-source information collection workspace that lets staff review, match, edit, save and hand off purchase needs to a future purchasing module.

**Architecture:** Keep the existing whiteboard scan API and audit tables intact. Add generic SQLite `purchase_intakes` and `purchase_intake_items` tables plus a server-side intake parser that normalizes camera images, uploaded images, PDFs, XLSX/XLS and CSV files into one review-item format. The React purchasing route becomes an intake hub, an editable review workspace, and a product-match picker backed by ranked historical invoice candidates.

**Tech Stack:** React 19, TypeScript, Vite middleware, better-sqlite3, Busboy, Zod, SheetJS `xlsx`, OpenAI Responses API, Vitest, Playwright, lucide-react.

## Global Constraints

- All visible intake UI and errors are Chinese; the home tile label is `AI录入`.
- The home tile uses a camera icon and opens `#purchasing`; the camera only opens after choosing `AI拍照识别录入`.
- Accepted uploads: JPG, PNG, HEIC, HEIF, WebP, PDF, XLSX, XLS and CSV; reject all other files and files larger than 25 MB.
- The browser never receives `OPENAI_API_KEY` and never calls OpenAI directly.
- Images and PDFs are sent to OpenAI only from server code; PDFs use Responses API `input_file` data with structured output.
- Excel/CSV parsing occurs on the server and never invents products or quantities.
- Confirmed intake data and original files persist in SQLite, never in browser localStorage.
- This module must not create supplier orders or alter inventory values/quantities.
- Legacy `whiteboard_scans` and `whiteboard_scan_items` remain readable and unchanged.
- Browser tests use port 4174 and temporary SQLite/JSON paths; they never reuse the live 5174 service or Supabase record.

---

### Task 1: Add ranked historical-product candidates

**Files:**
- Modify: `server/purchasing/matching.ts`
- Modify: `src/supplierProducts.ts`
- Test: `src/purchasing/matching.test.ts`

**Consumes:** `HistoricalProductCandidate`, `HistoricalInventoryEntry`, existing normalization and recommendation helpers.

**Produces:** `rankHistoricalProducts(input)` returning ranked invoice candidates with supplier card details, current inventory quantity, a numeric score and `isRecommended`; `searchSupplierProducts` keeps supporting name, supplier and supplier-code search.

- [ ] **Step 1: Write failing ranking tests**

```ts
it("ranks exact historical product matches before frequent partial matches", () => {
  const ranked = rankHistoricalProducts({
    productName: "orange juice",
    candidates: [candidate("Fresh Orange", { purchaseCount: 30 }), candidate("Orange Juice", { purchaseCount: 2 })],
    inventoryEntries: []
  });

  expect(ranked[0]).toMatchObject({ productName: "Orange Juice", isRecommended: true });
});

it("uses purchase count and recency to break equally relevant matches", () => {
  const ranked = rankHistoricalProducts({ productName: "apple juice", candidates: equalNameCandidates, inventoryEntries: [] });
  expect(ranked.map((item) => item.id)).toEqual(["recent-frequent", "old-rare"]);
});
```

- [ ] **Step 2: Run the focused tests and verify expected failure**

Run: `pnpm vitest run src/purchasing/matching.test.ts`

Expected: FAIL because `rankHistoricalProducts` is not exported.

- [ ] **Step 3: Implement one shared rank function**

```ts
export type RankedHistoricalProduct = HistoricalProductCandidate & HistoricalRecommendationFields & {
  isRecommended: boolean;
  score: number;
};

export function rankHistoricalProducts(input: HistoricalMatchInput): RankedHistoricalProduct[] {
  // Reuse normaliseProductName, semantic score, frequency bonus, recency bonus and currentInventoryQuantity.
  // Return all candidates with semantic score >= 35, sorted by score, then exact semantic score,
  // purchase count, recent date and stable id. Mark only index 0 as recommended.
}

export function recommendHistoricalProduct(input: HistoricalMatchInput) {
  const [top] = rankHistoricalProducts(input);
  return top ? recommendationFromRankedCandidate(top) : null;
}
```

- [ ] **Step 4: Make client searching rank compatible**

Keep `searchSupplierProducts(query, limit)` as the broad search function; ensure product-code matches still normalize hyphens and optional leading `F` exactly as current behavior does.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run src/purchasing/matching.test.ts`

Expected: PASS.

```bash
git add server/purchasing/matching.ts src/supplierProducts.ts src/purchasing/matching.test.ts
git commit -m "feat: rank intake product candidates"
```

### Task 2: Persist generic intake records and validate uploaded files

**Files:**
- Modify: `package.json`
- Modify: `server/purchasing/database.ts`
- Create: `server/purchasing/intakeFiles.ts`
- Create: `server/purchasing/intakeSchema.ts`
- Modify: `server/purchasing/errors.ts`
- Test: `src/purchasing/database.test.ts`
- Test: `src/purchasing/serverValidation.test.ts`

**Consumes:** better-sqlite3 database initialization and current purchase review item fields.

**Produces:** `PurchaseIntakeSource`, `PurchaseIntakeStatus`, `PurchaseIntakeItem`, `saveDraftIntake`, `savePendingIntake`, `handOffIntakeToPurchasing`, `getIntakeSource`, `readMultipartIntakeFile` and source-specific validation errors.

- [ ] **Step 1: Add failing database and validation tests**

```ts
it("stores a pending intake with an original PDF and matched invoice product", () => {
  savePendingIntake(database, intakeWith({ sourceType: "pdf", supplierProductId: "BRK-135177" }));
  expect(readIntake(database, "intake-1")).toMatchObject({ status: "Pending", sourceType: "pdf" });
});

it("moves a reviewed intake into the future purchasing queue", () => {
  handOffIntakeToPurchasing(database, { intakeId: "intake-1", items: reviewedItems });
  expect(readIntake(database, "intake-1")?.status).toBe("ReadyForPurchase");
});

it.each(["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"])(
  "accepts supported intake upload %s", async (mimeType) => {
    await expect(readMultipartIntakeFile(requestWith(mimeType))).resolves.toMatchObject({ mimeType });
  }
);
```

- [ ] **Step 2: Run the focused tests and verify expected failure**

Run: `pnpm vitest run src/purchasing/database.test.ts src/purchasing/serverValidation.test.ts`

Expected: FAIL because generic intake APIs and file support do not exist.

- [ ] **Step 3: Add `xlsx` and create the generic schema**

```ts
CREATE TABLE IF NOT EXISTS purchase_intakes (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('Draft', 'Pending', 'ReadyForPurchase', 'RecognitionFailed')),
  source_type TEXT NOT NULL CHECK (source_type IN ('camera', 'image', 'pdf', 'spreadsheet')),
  original_filename TEXT NOT NULL,
  original_mime_type TEXT NOT NULL,
  stored_mime_type TEXT NOT NULL,
  original_size_bytes INTEGER NOT NULL,
  stored_size_bytes INTEGER NOT NULL,
  source_blob BLOB NOT NULL,
  ai_model TEXT,
  unreadable_text_json TEXT NOT NULL,
  general_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  handed_off_at TEXT
);
```

Add `purchase_intake_items` with editable item fields, low-confidence review flag, matched supplier product id/code/name/price metadata and `row_order`. Keep legacy whiteboard schema statements below it unchanged.

- [ ] **Step 4: Implement validation and persistence**

```ts
export const intakeMimeTypes = new Set([
  "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
  "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel", "text/csv"
]);

export async function readMultipartIntakeFile(request: IncomingMessage): Promise<IntakeUpload> {
  // Busboy field name: file; reject unsupported types, empty files and byte length > 25 * 1024 * 1024.
}
```

`savePendingIntake` and `handOffIntakeToPurchasing` must validate non-empty product names, finite non-negative quantities, unique client IDs and manual review for confidence below 0.8. The hand-off method updates only the intake status and handoff time; it does not create an order.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/purchasing/database.test.ts src/purchasing/serverValidation.test.ts`

Expected: PASS.

```bash
git add package.json pnpm-lock.yaml server/purchasing/database.ts server/purchasing/intakeFiles.ts server/purchasing/intakeSchema.ts server/purchasing/errors.ts src/purchasing/database.test.ts src/purchasing/serverValidation.test.ts
git commit -m "feat: persist generic purchasing intakes"
```

### Task 3: Parse images, PDFs and spreadsheets through server routes

**Files:**
- Modify: `server/purchasing/openaiWhiteboard.ts`
- Create: `server/purchasing/intakeRecognition.ts`
- Modify: `server/purchasing/routes.ts`
- Modify: `vite.config.ts`
- Test: `src/purchasing/routes.test.ts`

**Consumes:** `readMultipartIntakeFile`, generic intake persistence, `whiteboardRecognitionSchema`, `rankHistoricalProducts`, `SUPPLIER_CATALOGUE` and current inventory composer.

**Produces:** `POST /api/purchasing/intakes/parse`, `GET /api/purchasing/intakes/:id/source`, `PUT /api/purchasing/intakes/:id`, `POST /api/purchasing/intakes/:id/ready-for-purchase` and `GET /api/purchasing/historical-products?query=`.

- [ ] **Step 1: Write failing route tests**

```ts
it("parses an uploaded PDF only through the server recognition adapter", async () => {
  const response = await postMultipart("/api/purchasing/intakes/parse", pdfFixture);
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ sourceType: "pdf", items: [expect.objectContaining({ product_name: "Orange Juice" })] });
});

it("converts spreadsheet rows without inventing a missing quantity", async () => {
  const result = await parseSpreadsheet(workbookWith([{ Product: "Orange juice", Qty: "" }]));
  expect(result.items[0]).toMatchObject({ product_name: "Orange juice", quantity: null, confidence: 1 });
});

it("returns the exact-match historical card first and marks it recommended", async () => {
  const response = await getJson("/api/purchasing/historical-products?query=orange%20juice");
  expect(response.items[0]).toMatchObject({ isRecommended: true, productName: "Orange Juice" });
});
```

- [ ] **Step 2: Run route tests and verify expected failure**

Run: `pnpm vitest run src/purchasing/routes.test.ts`

Expected: FAIL because generic intake endpoints and parsers are absent.

- [ ] **Step 3: Implement unified recognition**

```ts
export async function recognisePurchaseSource(source: IntakeUpload, config: RecogniseIntakeConfig): Promise<WhiteboardRecognition> {
  if (source.kind === "spreadsheet") return parseSpreadsheet(source.buffer, source.filename);
  if (source.kind === "image") return recogniseWhiteboard(await prepareWhiteboardImage(source), config);
  return recognisePurchasePdf(source, config);
}

async function recognisePurchasePdf(source: IntakeUpload, config: RecogniseIntakeConfig) {
  return client.responses.parse({
    model: config.model,
    input: [{ role: "user", content: [
      { type: "input_file", filename: source.filename, file_data: `data:application/pdf;base64,${source.buffer.toString("base64")}` },
      { type: "input_text", text: PURCHASE_DOCUMENT_INSTRUCTION }
    ] }],
    text: { format: zodTextFormat(whiteboardRecognitionSchema, "purchase_document") }
  });
}
```

`PURCHASE_DOCUMENT_INSTRUCTION` must extract only explicit purchase requests and summarize event/date/guest-count context in `general_notes`; it must not calculate quantities from an event document.

For spreadsheets, choose the first non-empty sheet; map normalized headers `department|section`, `product|item|description|name`, `quantity|qty|amount`, `unit|uom`, and `notes|note|comment`. Throw `NO_READABLE_TEXT` if no non-empty product column is found.

- [ ] **Step 4: Add routes and server wiring**

The parse route saves a `Draft` intake and returns `{ intakeId, sourceUrl, sourceType, originalFilename, items, unreadableText, generalNotes }`. The update route saves a `Pending` draft with server-validated manual matching; the ready route persists final items, recomputes matching metadata and sets `ReadyForPurchase`. Candidate search calls `rankHistoricalProducts` using the current supplier catalogue and inventory entries.

- [ ] **Step 5: Run route tests and commit**

Run: `pnpm vitest run src/purchasing/routes.test.ts`

Expected: PASS.

```bash
git add server/purchasing/openaiWhiteboard.ts server/purchasing/intakeRecognition.ts server/purchasing/routes.ts vite.config.ts src/purchasing/routes.test.ts
git commit -m "feat: parse and route purchasing intakes"
```

### Task 4: Build the AI intake hub, editing workspace and match cards

**Files:**
- Modify: `src/homeModules.ts`
- Modify: `src/copy.ts`
- Modify: `src/PurchasingPage.tsx`
- Modify: `src/PurchasingPage.css`
- Modify: `src/purchasing/api.ts`
- Modify: `src/purchasing/types.ts`
- Create: `src/purchasing/ProductMatchDialog.tsx`
- Create: `src/purchasing/ProductMatchDialog.css`
- Test: `src/Home.test.tsx`
- Test: `src/PurchasingPage.test.tsx`

**Consumes:** generic intake APIs and ranked historical-product result shape from Task 3.

**Produces:** camera-icon `AI录入` home module, two-choice intake hub, file preview, editable review rows, supplier product-card dialog, `保存草稿` and `转入采购清单` actions.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("shows the AI intake tile with a camera icon and opens the two intake choices", async () => {
  render(<App />);
  await user.click(screen.getByRole("link", { name: "AI录入" }));
  expect(screen.getByRole("button", { name: "AI拍照识别录入" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "手动上传录入" })).toBeInTheDocument();
});

it("lets a reviewer match orange juice to a recommended invoice card", async () => {
  render(<PurchasingPage />);
  await completeParseWithItem({ product_name: "orange" });
  await user.click(screen.getByRole("button", { name: "匹配发票商品 orange" }));
  expect(await screen.findByText("推荐购买")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "选择 Orange Juice" }));
  expect(screen.getByLabelText("产品名称 1")).toHaveValue("Orange Juice");
});

it("saves a draft before handing reviewed items to the purchase queue", async () => {
  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  await user.click(screen.getByRole("button", { name: "转入采购清单" }));
  expect(readyForPurchase).toHaveBeenCalledWith(expect.any(String), expect.any(Array));
});
```

- [ ] **Step 2: Run focused component tests and verify expected failure**

Run: `pnpm vitest run src/Home.test.tsx src/PurchasingPage.test.tsx`

Expected: FAIL because the hub, generic API client and match dialog do not exist.

- [ ] **Step 3: Implement route states and file selection**

```tsx
type IntakeView =
  | { kind: "hub" }
  | { kind: "preview"; file: File; sourceType: PurchaseIntakeSource; previewUrl: string | null }
  | { kind: "recognising"; file: File; sourceType: PurchaseIntakeSource; previewUrl: string | null }
  | { kind: "review"; intake: PurchaseIntakeReview }
  | { kind: "saved"; intake: PurchaseIntakeReview; status: "Pending" | "ReadyForPurchase" };
```

Use `Camera` for the home module, `Camera`, `Upload`, `FileSpreadsheet` and `FileText` from lucide-react inside the hub. The camera input uses `capture="environment"`; the manual input accepts all listed formats. Image preview shows the image; PDF/spreadsheet preview shows source filename, type and an original-source button.

- [ ] **Step 4: Implement editable rows and `ProductMatchDialog`**

```tsx
<ProductMatchDialog
  itemName={item.product_name}
  onChoose={(product) => updateItem(item.clientId, {
    product_name: product.productName,
    supplierProductId: product.id,
    matchedProduct: product
  })}
  onClear={() => updateItem(item.clientId, { supplierProductId: null, matchedProduct: null })}
/>
```

The dialog searches on text entry and renders cards with supplier, code, pack size, last price, purchase count, last purchase date and current inventory. Use a visible `推荐购买` label only for `isRecommended`. Keep selected-card highlighting; never overwrite `raw_text`.

- [ ] **Step 5: Implement draft and hand-off actions**

`保存草稿` sends the editable rows to the update endpoint and keeps the user in review. `转入采购清单` requires low-confidence manual review but allows unmatched products, then shows `已转入采购清单`; unmatched rows retain a visible `待匹配` state. Neither action opens supplier websites or creates orders.

- [ ] **Step 6: Run component tests and commit**

Run: `pnpm vitest run src/Home.test.tsx src/PurchasingPage.test.tsx`

Expected: PASS.

```bash
git add src/homeModules.ts src/copy.ts src/PurchasingPage.tsx src/PurchasingPage.css src/purchasing/api.ts src/purchasing/types.ts src/purchasing/ProductMatchDialog.tsx src/purchasing/ProductMatchDialog.css src/Home.test.tsx src/PurchasingPage.test.tsx
git commit -m "feat: add purchasing information intake workspace"
```

### Task 5: Verify multi-source intake end to end

**Files:**
- Modify: `e2e/purchasing.spec.ts`
- Modify: `e2e/home.spec.ts`
- Test: `src/purchasing/routes.test.ts`

**Consumes:** completed generic intake APIs and React review workspace.

**Produces:** desktop and mobile regression coverage for AI intake without any live inventory mutation.

- [ ] **Step 1: Add failing end-to-end scenarios**

```ts
test("mobile AI intake opens a capture choice, reviews a result and hands it off", async ({ page }) => {
  await page.goto("/#purchasing");
  await page.getByRole("button", { name: "AI拍照识别录入" }).click();
  await uploadFixture(page, "purchase-board.jpg");
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.getByRole("button", { name: "匹配发票商品 orange" }).click();
  await page.getByRole("button", { name: "选择 Orange Juice" }).click();
  await page.getByRole("button", { name: "转入采购清单" }).click();
  await expect(page.getByText("已转入采购清单")).toBeVisible();
});

test("upload mode accepts spreadsheet files and keeps unknown quantities blank", async ({ page }) => {
  await page.goto("/#purchasing");
  await page.getByRole("button", { name: "手动上传录入" }).click();
  await uploadFixture(page, "event-purchases.xlsx");
  await expect(page.getByLabel("数量 1")).toHaveValue("");
});
```

- [ ] **Step 2: Run the focused E2E tests and verify expected failure**

Run: `pnpm playwright test e2e/purchasing.spec.ts`

Expected: FAIL until the intake hub and generic routes are implemented.

- [ ] **Step 3: Add deterministic route mocks or test recognition adapters**

Use the existing test server injection approach for recognition fixtures. Do not call the live OpenAI API in any test. Ensure spreadsheet fixture creation is committed and does not require browser localStorage.

- [ ] **Step 4: Run all required verification**

Run:

```bash
pnpm test
pnpm build
pnpm playwright test e2e/purchasing.spec.ts
curl -s http://127.0.0.1:5174/api/inventory-db | jq '{freezer:(.freezer|length),dry:(.dryStore|length)}'
```

Expected: unit tests and build pass; desktop/mobile purchasing E2E pass; live inventory remains 65 freezer entries and 0 dry-store entries.

- [ ] **Step 5: Commit verification changes**

```bash
git add e2e/purchasing.spec.ts e2e/home.spec.ts src/purchasing/routes.test.ts
git commit -m "test: cover purchasing information intake"
```
