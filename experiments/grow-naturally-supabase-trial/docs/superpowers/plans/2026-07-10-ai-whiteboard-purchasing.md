# AI Whiteboard Purchasing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-friendly AI whiteboard scanner to the existing purchasing area, persist confirmed requests and audit images in SQLite, and show invoice-history recommendations without changing inventory behavior.

**Architecture:** The existing React application gains a `#purchasing` route and uses the empty home module as its entry. A focused `server/purchasing` backend is mounted through the existing Vite middleware, calls the OpenAI Responses API only on the server, and writes to a separate `local-data/purchasing.sqlite` database. Matching reads the existing generated supplier catalogue and inventory JSON without modifying either source.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest, Testing Library, OpenAI Node SDK, Zod, Sharp, Busboy, better-sqlite3, lucide-react.

## Global Constraints

- Add the feature to `/Users/xue/Documents/Codex/自然生长/experiments/grow-naturally-supabase-trial`; do not create a separate application.
- Occupy the existing empty home module and open `#purchasing`.
- Do not modify or remove existing inventory behavior, inventory JSON persistence, or Supabase synchronization.
- Keep the exact button text `Scan Purchase Whiteboard`; all other new interface text is Chinese.
- The browser must never call OpenAI directly.
- Read the OpenAI API key only from `OPENAI_API_KEY`; never return, log, commit, or expose it through a `VITE_` variable.
- Accept JPG, PNG, HEIC, HEIF, and WebP; reject uploads over 15 MB.
- Compress images over 2 MB or 2048 pixels on the longest side; convert HEIC/HEIF to WebP before storage and recognition.
- Use the Responses API with image input and strict structured output.
- Require explicit manual review for every retained row below `0.8` confidence.
- Confirmed scan items have status `Pending`; do not create orders or contact suppliers.
- Persist confirmed results and audit images in SQLite, never in browser localStorage.
- Write a failing automated test before each production behavior.

---

### Task 1: Shared Types, Structured Response Validation, and Image Preparation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.node.json`
- Create: `src/purchasing/types.ts`
- Create: `server/purchasing/errors.ts`
- Create: `server/purchasing/recognitionSchema.ts`
- Create: `server/purchasing/imagePreparation.ts`
- Create: `src/purchasing/serverValidation.test.ts`

**Interfaces:**
- Produces: `WhiteboardRecognition`, `WhiteboardReviewItem`, `PurchasingApiError`, `parseWhiteboardRecognition(value)`, and `prepareWhiteboardImage(input)`.
- Consumes: no prior task interfaces.

- [ ] **Step 1: Install server dependencies and include server TypeScript**

Run:

```bash
pnpm add openai zod sharp busboy better-sqlite3
pnpm add -D @types/busboy @types/better-sqlite3
```

Update `tsconfig.node.json` so `include` contains both `vite.config.ts` and `server/**/*.ts`.

- [ ] **Step 2: Write failing response-validation tests**

Create `src/purchasing/serverValidation.test.ts` with `// @vitest-environment node` and assertions equivalent to:

```ts
it("accepts the requested whiteboard response shape", () => {
  expect(parseWhiteboardRecognition({
    items: [{
      department: "Kitchen",
      raw_text: "2 chiken brest",
      product_name: "chicken breast",
      quantity: 2,
      unit: null,
      notes: null,
      confidence: 0.74
    }],
    unreadable_text: [],
    general_notes: null
  }).items[0].product_name).toBe("chicken breast");
});

it.each([
  { confidence: 1.1, name: "confidence above one" },
  { confidence: -0.1, name: "negative confidence" },
  { confidence: "high", name: "non-number confidence" }
])("rejects $name", ({ confidence }) => {
  expect(() => parseWhiteboardRecognition({
    items: [{ department: null, raw_text: "milk", product_name: "milk", quantity: null, unit: null, notes: null, confidence }],
    unreadable_text: [], general_notes: null
  })).toThrowError(expect.objectContaining({ code: "INVALID_AI_RESPONSE" }));
});

it("reports no readable text for an empty useful result", () => {
  expect(() => parseWhiteboardRecognition({ items: [], unreadable_text: [], general_notes: null }))
    .toThrowError(expect.objectContaining({ code: "NO_READABLE_TEXT" }));
});
```

- [ ] **Step 3: Run the validation tests and verify RED**

Run: `pnpm test -- src/purchasing/serverValidation.test.ts`

Expected: FAIL because the purchasing validation modules do not exist.

- [ ] **Step 4: Implement shared types, stable errors, and strict Zod parsing**

Define the client-safe types in `src/purchasing/types.ts`:

```ts
export type WhiteboardRecognitionItem = {
  department: string | null;
  raw_text: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  confidence: number;
};

export type WhiteboardRecognition = {
  items: WhiteboardRecognitionItem[];
  unreadable_text: string[];
  general_notes: string | null;
};

export type WhiteboardReviewItem = WhiteboardRecognitionItem & {
  clientId: string;
  manualReviewed: boolean;
};
```

Define `PurchasingApiError` with `code`, safe Chinese `message`, and HTTP `status`. Define `whiteboardRecognitionSchema` with Zod, `.min(0).max(1)` for confidence, nullable fields exactly as specified, and `.strict()` objects. `parseWhiteboardRecognition` must convert malformed values to `INVALID_AI_RESPONSE` and an empty useful result to `NO_READABLE_TEXT`.

- [ ] **Step 5: Write failing image-preparation tests**

Extend the same test file. Generate real JPEG, PNG, and WebP buffers with Sharp, then assert:

```ts
it.each([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"]
])("accepts decoded %s images", async (format, expectedMime) => {
  const buffer = await makeTestImage(format);
  const result = await prepareWhiteboardImage({ buffer, filename: `board.${format}`, browserMimeType: "application/octet-stream" });
  expect(result.storedMimeType).toBe(expectedMime);
});

it("rejects content that only pretends to be an image", async () => {
  await expect(prepareWhiteboardImage({ buffer: Buffer.from("not an image"), filename: "board.jpg", browserMimeType: "image/jpeg" }))
    .rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE_FORMAT" });
});

it("rejects uploads over 15 MB before decoding", async () => {
  await expect(prepareWhiteboardImage({ buffer: Buffer.alloc(15 * 1024 * 1024 + 1), filename: "large.jpg", browserMimeType: "image/jpeg" }))
    .rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
});

it("resizes a long image and stores it as compressed WebP", async () => {
  const buffer = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "white" } }).jpeg().toBuffer();
  const result = await prepareWhiteboardImage({ buffer, filename: "wide.jpg", browserMimeType: "image/jpeg" });
  expect(result.storedMimeType).toBe("image/webp");
  expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2048);
});
```

Also test the pure Sharp-format mapper accepts `heif` as `image/heic`; HEIC/HEIF is always converted to WebP before output.

- [ ] **Step 6: Run image tests and verify RED**

Run: `pnpm test -- src/purchasing/serverValidation.test.ts`

Expected: FAIL because `prepareWhiteboardImage` is missing.

- [ ] **Step 7: Implement decoded format validation and compression**

Implement these constants and result fields in `imagePreparation.ts`:

```ts
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024;
export const MAX_LONG_EDGE = 2048;

export type PreparedWhiteboardImage = {
  buffer: Buffer;
  storedMimeType: "image/jpeg" | "image/png" | "image/webp";
  originalSizeBytes: number;
  storedSizeBytes: number;
  width: number;
  height: number;
};
```

Use `sharp(buffer, { failOn: "error", pages: 1 }).metadata()` as the authority instead of filename or browser MIME. Allow only `jpeg`, `png`, `webp`, and `heif`. Auto-rotate. Convert `heif`, images over 2 MB, or images with a long edge over 2048 to WebP quality 82 with `fit: "inside"` and `withoutEnlargement: true`; otherwise retain JPEG, PNG, or WebP bytes.

- [ ] **Step 8: Run Task 1 tests and TypeScript checks**

Run:

```bash
pnpm test -- src/purchasing/serverValidation.test.ts
pnpm build
```

Expected: validation tests PASS and the build succeeds.

- [ ] **Step 9: Commit Task 1**

Commit only Task 1 files with message `feat: validate whiteboard scan input`.

---

### Task 2: SQLite Scan Repository and Historical Matching

**Files:**
- Create: `server/purchasing/database.ts`
- Create: `server/purchasing/matching.ts`
- Create: `src/purchasing/database.test.ts`
- Create: `src/purchasing/matching.test.ts`

**Interfaces:**
- Consumes: `WhiteboardRecognitionItem`, `WhiteboardReviewItem`, and `PurchasingApiError` from Task 1.
- Produces: `createPurchasingDatabase(path)`, `saveDraftScan(database, input)`, `getScanImage(database, scanId)`, `confirmWhiteboardScan(database, input)`, `normaliseProductName(value)`, and `recommendHistoricalProduct(input)`.

- [ ] **Step 1: Write failing schema and database-saving tests**

Create Node-environment tests using `better-sqlite3` with `:memory:`. Assert that initialization creates `whiteboard_scans` and `whiteboard_scan_items`, can run twice, enables foreign keys, saves a draft image, and returns the image by ID.

Test confirmation with one normal row and one reviewed low-confidence row. Assert both receive status `Pending`, the scan status becomes `Pending`, and recommendations persist. Add a failing case where confidence `0.79` and `manualReviewed: false` throws `INVALID_REVIEW_DATA` without inserting rows.

- [ ] **Step 2: Run database tests and verify RED**

Run: `pnpm test -- src/purchasing/database.test.ts`

Expected: FAIL because the database module does not exist.

- [ ] **Step 3: Implement the idempotent schema and transaction**

Create exactly the two tables from the approved design. Add constraints:

```sql
CHECK (status IN ('Draft', 'Pending', 'RecognitionFailed'))
CHECK (confidence >= 0 AND confidence <= 1)
CHECK (manual_reviewed IN (0, 1))
FOREIGN KEY (scan_id) REFERENCES whiteboard_scans(id) ON DELETE CASCADE
```

`confirmWhiteboardScan` must validate non-empty trimmed product names, finite non-negative quantities or null, confidence range, and explicit low-confidence review. Use one `database.transaction()` to delete existing rows for the scan, insert final rows, and update the scan status and `confirmed_at`.

- [ ] **Step 4: Run database tests and verify GREEN**

Run: `pnpm test -- src/purchasing/database.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing matching tests**

Use small in-memory candidate lists. Assert:

```ts
it("ranks exact normalised names above frequency-only candidates", () => {
  const result = recommendHistoricalProduct({
    productName: "Chicken Breasts",
    candidates: [frequentTurkey, recentExactChicken],
    inventoryEntries: []
  });
  expect(result?.recommendedProductCode).toBe("CHICKEN-1");
});

it("uses aliases for chips and fries", () => {
  const result = recommendHistoricalProduct({
    productName: "chunky chips",
    candidates: [chunkyFries],
    inventoryEntries: []
  });
  expect(result?.recommendedProductCode).toBe("135177");
});

it("uses purchase frequency then recent date as bounded tie breakers", () => {
  expect(recommendHistoricalProduct(tiedNameCandidates)?.recommendedProductCode).toBe("RECENT-FREQUENT");
});

it("returns no recommendation for an unrelated weak candidate", () => {
  expect(recommendHistoricalProduct(unrelatedCandidate)).toBeNull();
});
```

Also assert current inventory quantity aggregates by supplier-product ID before name fallback.

- [ ] **Step 6: Run matching tests and verify RED**

Run: `pnpm test -- src/purchasing/matching.test.ts`

Expected: FAIL because matching functions do not exist.

- [ ] **Step 7: Implement deterministic matching**

Normalise Unicode, lowercase, punctuation, whitespace, simple English plurals, and the bounded alias groups `chips/fries`, `rolls/buns`, `potatoes/spuds`, `soft drinks/soda`, and `washing up liquid/dish soap`. Score exact normalised equality, phrase containment, and token overlap first. Add only capped `Math.log1p(purchaseCount)` frequency and bounded date-recency bonuses. Require a minimum semantic name score before returning a candidate.

Return the exact persisted recommendation fields from the design plus `currentInventoryQuantity`.

- [ ] **Step 8: Run Task 2 tests**

Run:

```bash
pnpm test -- src/purchasing/database.test.ts src/purchasing/matching.test.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Commit Task 2 files with message `feat: persist and match purchase scans`.

---

### Task 3: OpenAI Responses Adapter and Purchasing API Routes

**Files:**
- Create: `server/purchasing/openaiWhiteboard.ts`
- Create: `server/purchasing/multipart.ts`
- Create: `server/purchasing/routes.ts`
- Create: `src/purchasing/routes.test.ts`
- Modify: `vite.config.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: Task 1 validation/image APIs and Task 2 database/matching APIs.
- Produces: `recogniseWhiteboard(image, config)`, `readMultipartImage(request)`, and `installPurchasingRoutes(server, options)` implementing the three approved endpoints.

- [ ] **Step 1: Write failing OpenAI adapter and safe-error tests**

Test dependency-injected OpenAI clients so no test reaches the network. Assert missing `OPENAI_API_KEY` throws `MISSING_API_KEY`, a valid mocked `responses.parse` result returns recognised data, malformed output becomes `INVALID_AI_RESPONSE`, and an upstream rejection becomes `AI_SERVICE_UNAVAILABLE` without including the fake key in the message.

Assert the adapter sends an `input_image` data URL and a system instruction containing the non-invention, raw-text preservation, department, null-quantity, and confidence rules.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `pnpm test -- src/purchasing/routes.test.ts`

Expected: FAIL because the adapter and route modules do not exist.

- [ ] **Step 3: Implement the Responses API adapter**

Instantiate `OpenAI` only inside backend code. Use:

```ts
await client.responses.parse({
  model: process.env.OPENAI_WHITEBOARD_MODEL || "gpt-5.4-mini",
  input: [
    { role: "system", content: WHITEBOARD_SYSTEM_INSTRUCTION },
    { role: "user", content: [
      { type: "input_text", text: "Read this hotel purchase whiteboard." },
      { type: "input_image", image_url: `data:${mimeType};base64,${buffer.toString("base64")}` }
    ] }
  ],
  text: { format: zodTextFormat(whiteboardRecognitionSchema, "whiteboard_purchase_list") }
});
```

Validate `output_parsed` again with `parseWhiteboardRecognition`. Never print the request, key, image, base64, or authorization headers.

- [ ] **Step 4: Write failing multipart and route-service tests**

Test `readMultipartImage` with supported single-file upload, missing image, a second image, and Busboy's truncated flag. Test route service functions for successful draft saving, image retrieval, confirmation, and Chinese error JSON:

```json
{ "error": { "code": "MISSING_API_KEY", "message": "服务器尚未配置 AI 识别密钥。" } }
```

- [ ] **Step 5: Run route tests and verify RED**

Run: `pnpm test -- src/purchasing/routes.test.ts`

Expected: FAIL on missing multipart and route behavior.

- [ ] **Step 6: Implement multipart parsing and routes**

Use Busboy with `files: 1`, `fileSize: 15 * 1024 * 1024`, and `fields: 0`. Implement:

- `POST /api/purchasing/scan-whiteboard`
- `GET /api/purchasing/whiteboard-scans/:scanId/image`
- `POST /api/purchasing/whiteboard-scans/:scanId/confirm`

Return JSON with explicit content types. Return `405` for wrong methods, `404` for unknown scans, and the stable design error codes. Parse confirmation JSON with a 1 MB body limit. Create the real database at `resolve(process.cwd(), "local-data", "purchasing.sqlite")`.

Mount the routes from the existing `configureServer` block without changing existing inventory, Supabase, or external-browser middleware.

Append only safe placeholders to `.env.local.example`:

```dotenv
OPENAI_API_KEY=
OPENAI_WHITEBOARD_MODEL=gpt-5.4-mini
```

- [ ] **Step 7: Run Task 3 tests and build**

Run:

```bash
pnpm test -- src/purchasing/routes.test.ts
pnpm build
```

Expected: PASS. Confirm `dist` contains no literal value from `OPENAI_API_KEY` by searching for a test sentinel only, never by printing the real environment file.

- [ ] **Step 8: Commit Task 3**

Commit Task 3 files with message `feat: add whiteboard purchasing API`.

---

### Task 4: Mobile Capture, Preview, Editable Review, and Save Results UI

**Files:**
- Create: `src/purchasing/api.ts`
- Create: `src/PurchasingPage.tsx`
- Create: `src/PurchasingPage.css`
- Create: `src/PurchasingPage.test.tsx`

**Interfaces:**
- Consumes: the Task 1 client-safe types and Task 3 HTTP endpoints.
- Produces: `PurchasingPage`, `scanWhiteboard(file)`, and `confirmWhiteboardScan(scanId, items)`.

- [ ] **Step 1: Write failing capture and preview tests**

Render `PurchasingPage`. Assert the exact `Scan Purchase Whiteboard` button exists, a rear-camera input has `accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif"` and `capture="environment"`, and a separate chooser has the same accepted formats without `capture`.

Select a JPG `File`, mock `URL.createObjectURL`, and assert the preview plus `重新拍照`, `选择其他图片`, and `开始识别` appear before `fetch` is called.

- [ ] **Step 2: Run preview tests and verify RED**

Run: `pnpm test -- src/PurchasingPage.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement idle and preview states**

Use hidden file inputs controlled by large touch-friendly buttons. Keep the selected `File` and object URL in React state only. Revoke old object URLs on replacement and unmount. Disable duplicate actions while recognising or saving.

- [ ] **Step 4: Write failing review-editor tests**

Mock `scanWhiteboard` response with two rows, one at `0.79`. Assert the review screen can:

- Edit department, product name, quantity, unit, and notes.
- Delete the wrong row.
- Add a blank row with confidence `1` and `manualReviewed: true`.
- Open a dialog showing the stored scan image URL.
- Highlight the `0.79` row and block confirmation until `已人工核对` is checked.
- Send edited rows, including `manualReviewed`, to the confirm endpoint.

- [ ] **Step 5: Run editor tests and verify RED**

Run: `pnpm test -- src/PurchasingPage.test.tsx`

Expected: FAIL on review behavior.

- [ ] **Step 6: Implement recognition, editable review, and confirmation**

`api.ts` must use `FormData` for scanning and JSON for confirmation, convert non-2xx error envelopes to Chinese UI errors, and never import OpenAI.

`PurchasingPage` uses a clear state union: `idle`, `preview`, `recognising`, `review`, `saving`, `saved`, and `error`. Render semantic labels for every input. Use `inputMode="decimal"` and `type="number"` for quantity. Low-confidence rows get the class `purchase-review-row-low-confidence` and an explicit checkbox.

- [ ] **Step 7: Write failing saved-recommendation tests**

Mock confirmation output and assert each saved row displays:

- Recommended historical product
- Supplier
- Supplier product code
- Pack size
- Last purchase price
- Purchase count
- Last purchase date
- Current inventory quantity
- `Pending`

Assert a null recommendation displays `未找到可靠的历史匹配`.

- [ ] **Step 8: Implement saved recommendation display**

Use compact field groups rather than nested cards. Format price with GBP and preserve supplier codes as plain copyable text. Do not display or implement order, send, or add-to-basket actions.

- [ ] **Step 9: Add responsive styling and run Task 4 tests**

Use desktop table columns and switch each row to a single-column labelled grid below 760 px. Ensure buttons are at least 44 px high, text wraps, images keep `object-fit: contain`, and no horizontal viewport overflow exists at 390 px.

Run:

```bash
pnpm test -- src/PurchasingPage.test.tsx
pnpm build
```

Expected: PASS.

- [ ] **Step 10: Commit Task 4**

Commit Task 4 files with message `feat: add purchasing whiteboard review UI`.

---

### Task 5: Home Module and Route Integration

**Files:**
- Modify: `src/homeModules.ts`
- Modify: `src/copy.ts`
- Modify: `src/Home.tsx`
- Modify: `src/App.tsx`
- Modify: `src/Home.test.tsx`

**Interfaces:**
- Consumes: `PurchasingPage` from Task 4.
- Produces: a visible `采购` home module linked to `#purchasing` and a working application route.

- [ ] **Step 1: Write failing home-entry and route tests**

Change the existing future-module assertion to require a link named `采购`. Add English copy assertion `Purchasing`. Click the link through `App` and assert the `采购白板识别` heading and `Scan Purchase Whiteboard` button render while inventory links still work.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `pnpm test -- src/Home.test.tsx`

Expected: FAIL because the future module is still empty and the route is missing.

- [ ] **Step 3: Implement the home module and route**

Replace the `future` module ID with `purchasing`, use lucide `ClipboardList`, set Chinese label `采购`, English label `Purchasing`, and href `#purchasing`. Import and render `PurchasingPage` from `App.tsx` for route `purchasing`.

Keep the existing four-module order so purchasing occupies the bottom-left position. Do not change search, area, valuation, or inventory routes.

- [ ] **Step 4: Run integration and regression tests**

Run:

```bash
pnpm test -- src/Home.test.tsx src/PurchasingPage.test.tsx
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

Commit Task 5 files with message `feat: connect purchasing module to home`.

---

### Task 6: Full Regression, Endpoint Smoke Tests, and Browser Verification

**Files:**
- Create: `e2e/purchasing.spec.ts`
- Modify only if verification exposes a defect: files from Tasks 1-5 and their covering tests.

**Interfaces:**
- Consumes: the complete feature.
- Produces: repeatable browser coverage and verified preservation of inventory behavior.

- [ ] **Step 1: Write a failing Playwright purchasing flow**

Intercept `/api/purchasing/scan-whiteboard` and confirmation responses. Test a 390 x 844 mobile viewport: open `采购`, choose an image, preview before recognition, review an uncertain row, edit it, confirm it, and see `Pending` plus recommendation details. Assert `document.documentElement.scrollWidth <= window.innerWidth`.

- [ ] **Step 2: Run the E2E test and verify RED**

Run: `pnpm test:e2e -- e2e/purchasing.spec.ts`

Expected: FAIL until selectors or integration details are complete.

- [ ] **Step 3: Make only defect-driven integration fixes**

For each observed defect, first add or tighten the covering Vitest or Playwright assertion, verify it fails for the observed reason, then make the smallest production change that passes it. Do not refactor unrelated inventory code.

- [ ] **Step 4: Run all automated verification**

Run:

```bash
pnpm test
pnpm build
pnpm test:e2e -- e2e/purchasing.spec.ts
```

Expected: all existing and new tests PASS; TypeScript and Vite build PASS.

- [ ] **Step 5: Run local endpoint smoke checks without exposing secrets**

Start the dev server on an unused port. With no key in a temporary test environment, upload a valid small image and assert `MISSING_API_KEY`. Confirm unsupported text content returns `UNSUPPORTED_IMAGE_FORMAT` and an oversized upload returns `IMAGE_TOO_LARGE`. Check only whether `OPENAI_API_KEY` is present; never print its value.

- [ ] **Step 6: Verify desktop and mobile browser layouts**

Use the in-app browser at 1440 x 900 and 390 x 844. Verify the home module, camera/upload controls, preview proportions, low-confidence warning, editable controls, source-image dialog, saved recommendations, and absence of overlap or horizontal overflow. Also open freezer and dry-store pages to verify their existing tables and controls still render.

- [ ] **Step 7: Commit Task 6**

Commit the E2E test and any test-backed fixes with message `test: verify whiteboard purchasing flow`.

## Plan Self-Review

- Every approved functional requirement maps to Tasks 1-6.
- The OpenAI key has one server-only source and no browser path.
- The SQLite tables and confirmation transaction are defined before route and UI work.
- Image, parser, database, matching, UI, integration, E2E, build, and existing regression coverage are explicit.
- No step changes the inventory persistence model or creates supplier actions.
- Task interfaces use the same snake_case recognition fields and persisted recommendation fields throughout.

