# Purchasing Supplier Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve purchasing-history recommendations with category-specific supplier preferences, live-inventory and frequency signals, plus durable manual-match learning.

**Architecture:** Extend the shared server-side historical-product ranker with explicit match tiers and deterministic category rules. Persist manual match feedback in two new SQLite tables: one aggregate table for learned weights and one per-intake-item state table for idempotency. Both historical search and review matching continue through the existing API and UI, so no frontend layout or OpenAI prompt changes are required.

**Tech Stack:** TypeScript, Vite middleware, better-sqlite3, Zod, Vitest, Playwright.

## Global Constraints

- Product relevance remains the first gate; supplier preference and feedback never admit candidates below the existing semantic threshold.
- Higher name-match tiers always beat lower tiers.
- Within one tier, preferred supplier comes before learned feedback, current-stock presence, purchase count, recent purchase date, fine semantic score and stable ID.
- Dairy and egg products prefer `Mark Murphy (Dole Ltd)`; seafood prefers `Campbells Prime Meat Ltd`; all other categories prefer `Brakes / Sysco GB Ltd`.
- Manual feedback is recorded only by a successful draft save or ReadyForPurchase handoff, never by a temporary dialog click.
- Re-saving an unchanged intake item does not increment feedback; changing the saved match increments the new name/product combination once.
- Important data stays in SQLite, not localStorage.
- Do not modify inventory quantities, inventory values, Supabase data, invoice history, OpenAI prompts, or legacy `whiteboard_*` tables.
- Unit-test creation or material edits must be delegated first to the `unit_test_spark` role; that role must not edit production code.
- Browser verification uses port 4174 with temporary SQLite and inventory JSON paths, never the live 5174 database or Supabase record.
- The existing unrelated working-tree changes in `e2e/home.spec.ts`, `e2e/purchasing.spec.ts`, and parent directories must not be staged in feature commits.

---

### Task 1: Add deterministic supplier, inventory and frequency ranking

**Files:**
- Modify: `server/purchasing/matching.ts`
- Test: `src/purchasing/matching.test.ts`

**Interfaces:**
- Consumes: existing `HistoricalMatchInput`, candidate invoice data and current inventory entries.
- Produces: `preferredSupplierForProduct(productName: string): string`, explicit match tiers inside `rankHistoricalProducts`, and the unchanged public ranked-card response shape.

- [ ] **Step 1: Delegate failing unit tests to `unit_test_spark`**

Ask the test-only agent to add focused cases equivalent to:

```ts
it("prefers Mark Murphy for equally matched dairy products", () => {
  const ranked = rankHistoricalProducts({
    productName: "whole milk",
    candidates: [
      candidate("Whole Milk", "BRK-MILK", { supplierName: "Brakes / Sysco GB Ltd", supplierCode: "BRK" }),
      candidate("Whole Milk", "MRK-MILK", { supplierName: "Mark Murphy (Dole Ltd)", supplierCode: "MRK" })
    ],
    inventoryEntries: []
  });
  expect(ranked[0]?.supplierName).toBe("Mark Murphy (Dole Ltd)");
});

it("recommends the frequently purchased stocked Campbells haddock for a broad query", () => {
  const ranked = rankHistoricalProducts({
    productName: "haddock",
    candidates: [porticoHaddock, smokedCampbellsHaddock, frequentCampbellsHaddock],
    inventoryEntries: [
      { productName: "Smoked Haddock", quantity: 3, supplierProduct: { id: smokedCampbellsHaddock.id } },
      { productName: "Haddock 8-10oz", quantity: 2, supplierProduct: { id: frequentCampbellsHaddock.id } }
    ]
  });
  expect(ranked[0]?.supplierProductCode).toBe("28HADFZIQF");
});

it("keeps a higher match tier ahead of a preferred supplier", () => {
  const ranked = rankHistoricalProducts({
    productName: "smoked haddock",
    candidates: [exactSmokedBrakesProduct, genericCampbellsHaddock],
    inventoryEntries: []
  });
  expect(ranked[0]?.id).toBe(exactSmokedBrakesProduct.id);
});
```

Also cover seafood vocabulary, egg/dairy vocabulary, default Brakes behavior, preferred-supplier absence, positive-stock before zero-stock, and below-threshold exclusion. The agent may edit only `src/purchasing/matching.test.ts`.

- [ ] **Step 2: Run the focused test file and verify the new cases fail**

Run: `pnpm vitest run src/purchasing/matching.test.ts`

Expected: existing cases pass and new preference/haddock cases fail because the current ranker has no match tiers or supplier/stock ordering.

- [ ] **Step 3: Implement category classification and explicit tiers**

In `server/purchasing/matching.ts`, add exact supplier constants and bounded normalized keyword sets:

```ts
const MARK_MURPHY = "Mark Murphy (Dole Ltd)";
const CAMPBELLS = "Campbells Prime Meat Ltd";
const BRAKES = "Brakes / Sysco GB Ltd";

const dairyTerms = new Set([
  "egg", "milk", "cream", "butter", "cheese", "yogurt", "yoghurt", "dairy",
  "buttermilk", "cheddar", "mozzarella", "parmesan", "mascarpone", "brie",
  "feta", "halloumi"
]);
const seafoodTerms = new Set([
  "seafood", "fish", "haddock", "cod", "salmon", "seabass", "pollock", "plaice",
  "halibut", "tuna", "mackerel", "trout", "sole", "prawn", "shrimp", "scampi",
  "crab", "lobster", "mussel", "clam", "scallop", "squid", "calamari", "octopus"
]);

export function preferredSupplierForProduct(productName: string) {
  const tokens = new Set(normaliseProductName(productName).split(" ").filter(Boolean));
  if ([...tokens].some((token) => dairyTerms.has(token))) return MARK_MURPHY;
  if ([...tokens].some((token) => seafoodTerms.has(token))) return CAMPBELLS;
  return BRAKES;
}
```

Represent semantic evaluation as `{ score, tier }`, with tier `3` for exact normalized equality, `2` for the existing phrase-containment branch, and `1` for candidates that pass the existing token-overlap threshold. Keep filtering at the existing effective score threshold of `35`.

- [ ] **Step 4: Replace scalar score ordering with the approved lexicographic order**

Calculate current inventory before sorting and compare:

```ts
right.matchTier - left.matchTier ||
Number(right.preferredSupplier) - Number(left.preferredSupplier) ||
Number(right.currentInventoryQuantity > 0) - Number(left.currentInventoryQuantity > 0) ||
right.purchaseCount - left.purchaseCount ||
parseDate(right.latestPurchaseDate) - parseDate(left.latestPurchaseDate) ||
right.semanticScore - left.semanticScore ||
left.id.localeCompare(right.id)
```

Keep `score` numeric for the existing API contract using the current `semanticScore + frequencyBonus + recencyBonus` calculation; do not use it as the primary comparator. Remove internal `matchTier`, `preferredSupplier`, and `semanticScore` before returning cards.

- [ ] **Step 5: Run focused and regression tests**

Run: `pnpm vitest run src/purchasing/matching.test.ts`

Expected: PASS, including broad `haddock` -> `28HADFZIQF` and explicit `smoked haddock` relevance protection.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add server/purchasing/matching.ts src/purchasing/matching.test.ts
git diff --cached --name-only
git commit -m "feat: apply purchasing supplier preferences"
```

Expected staged names: only the two files listed above.

### Task 2: Persist idempotent manual-match feedback in SQLite

**Files:**
- Modify: `server/purchasing/intakeSchema.ts`
- Modify: `server/purchasing/database.ts`
- Modify: `server/purchasing/matching.ts`
- Test: `src/purchasing/database.test.ts`
- Test: `src/purchasing/matching.test.ts`

**Interfaces:**
- Consumes: saved `PurchaseIntakeItem.clientId`, `product_name`, and `supplierProductId`.
- Produces: `HistoricalMatchFeedback`, optional `HistoricalMatchInput.feedback`, `listMatchFeedback(database, normalisedName)`, and atomic feedback recording inside `savePendingIntake` and `handOffIntakeToPurchasing`.

- [ ] **Step 1: Delegate failing database and ranker tests to `unit_test_spark`**

The test-only agent adds cases for these contracts:

```ts
savePendingIntake(database, matchedIntake);
savePendingIntake(database, matchedIntake);
expect(readFeedback("haddock", "CMP-28HADFZIQF").confirmationCount).toBe(1);

savePendingIntake(database, matchedIntake);
savePendingIntake(database, intakeMatchedToDifferentProduct);
expect(readFeedback("haddock", "CMP-OTHER").confirmationCount).toBe(1);

const ranked = rankHistoricalProducts({
  productName: "haddock",
  candidates: equalTierSameSupplierCandidates,
  inventoryEntries: [],
  feedback: [{ supplierProductId: "CMP-CHOSEN", confirmationCount: 2, lastConfirmedAt: "2026-07-10T12:00:00.000Z" }]
});
expect(ranked[0]?.id).toBe("CMP-CHOSEN");
```

Also test handoff recording, unchanged handoff after save not double-counting, clearing a saved match then reselecting it, and feedback never admitting an unrelated candidate. The agent may edit only the two test files.

- [ ] **Step 2: Verify the delegated tests fail**

Run: `pnpm vitest run src/purchasing/database.test.ts src/purchasing/matching.test.ts`

Expected: FAIL because feedback tables, read APIs and ranking input do not exist.

- [ ] **Step 3: Add the two feedback tables**

Append to `purchaseIntakeSchema` in `server/purchasing/intakeSchema.ts`:

```sql
CREATE TABLE IF NOT EXISTS purchase_match_feedback (
  normalised_name TEXT NOT NULL,
  supplier_product_id TEXT NOT NULL,
  confirmation_count INTEGER NOT NULL CHECK (confirmation_count > 0),
  last_confirmed_at TEXT NOT NULL,
  PRIMARY KEY (normalised_name, supplier_product_id)
);

CREATE TABLE IF NOT EXISTS purchase_match_feedback_item_state (
  intake_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  normalised_name TEXT NOT NULL,
  supplier_product_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (intake_id, client_id),
  FOREIGN KEY (intake_id) REFERENCES purchase_intakes(id) ON DELETE CASCADE
);
```

- [ ] **Step 4: Implement atomic feedback recording and lookup**

In `server/purchasing/database.ts`, export:

```ts
export type StoredMatchFeedback = {
  confirmationCount: number;
  lastConfirmedAt: string;
  supplierProductId: string;
};

export function listMatchFeedback(
  database: Database.Database,
  normalisedName: string
): StoredMatchFeedback[];
```

Add an internal `recordMatchFeedback(database, intakeId, items, confirmedAt)` called inside the existing save/handoff transactions after item validation. For every current row:

1. Normalize `product_name` with `normaliseProductName`.
2. If no `supplierProductId`, delete that row's item-state record so a later deliberate re-selection can count.
3. If state already has the same normalized name and product ID, do nothing.
4. Otherwise upsert the aggregate with `confirmation_count + 1`, then upsert item state.

Delete stale item-state rows whose `client_id` is no longer present in the submitted intake. Use prepared statements and keep all changes inside the parent transaction so validation or persistence failure rolls back both intake and feedback.

- [ ] **Step 5: Feed learned weights into ranking**

Extend `HistoricalMatchInput`:

```ts
export type HistoricalMatchFeedback = {
  confirmationCount: number;
  lastConfirmedAt: string;
  supplierProductId: string;
};

export type HistoricalMatchInput = {
  candidates: HistoricalProductCandidate[];
  feedback?: HistoricalMatchFeedback[];
  inventoryEntries: HistoricalInventoryEntry[];
  productName: string;
};
```

For each already-relevant candidate, read its feedback count by product ID. Insert these comparators after preferred supplier and before stock presence:

```ts
right.feedbackCount - left.feedbackCount ||
parseDate(right.feedbackLastConfirmedAt) - parseDate(left.feedbackLastConfirmedAt)
```

Do not evaluate feedback until after semantic thresholding, and keep match tier ahead of every feedback signal.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run src/purchasing/database.test.ts src/purchasing/matching.test.ts`

Expected: PASS.

```bash
git add server/purchasing/intakeSchema.ts server/purchasing/database.ts server/purchasing/matching.ts src/purchasing/database.test.ts src/purchasing/matching.test.ts
git diff --cached --name-only
git commit -m "feat: learn from saved purchase matches"
```

### Task 3: Apply learned feedback to the historical-product API

**Files:**
- Modify: `server/purchasing/routes.ts`
- Test: `src/purchasing/routes.test.ts`

**Interfaces:**
- Consumes: `normaliseProductName`, `listMatchFeedback`, and `rankHistoricalProducts(..., feedback)` from Tasks 1-2.
- Produces: the unchanged `GET /api/purchasing/historical-products?query=` response, now ordered with persisted feedback.

- [ ] **Step 1: Delegate failing route integration tests to `unit_test_spark`**

Add a route test that starts the existing isolated in-memory server, saves an intake item matched to one of two same-tier/same-supplier historical candidates, then searches the same normalized name and expects the saved candidate first. Save the unchanged payload again and assert its database confirmation count remains `1`. Add a second assertion that a higher match tier still wins over feedback.

The agent may edit only `src/purchasing/routes.test.ts`.

- [ ] **Step 2: Run the route tests and verify failure**

Run: `pnpm vitest run src/purchasing/routes.test.ts`

Expected: FAIL because `rankedCandidateSearch` does not load SQLite feedback.

- [ ] **Step 3: Load feedback for every historical search**

At `GET /api/purchasing/historical-products`, normalize the query once, call `listMatchFeedback(options.database, normalisedQuery)`, and pass the result into `rankedCandidateSearch`. Update the helper signature:

```ts
function rankedCandidateSearch(
  query: string,
  candidates: HistoricalProductCandidate[],
  inventoryEntries: HistoricalInventoryEntry[],
  feedback: HistoricalMatchFeedback[]
)
```

Pass `feedback` only into `rankHistoricalProducts`. Keep fallback code/supplier searches after the relevant ranked candidates; fallback candidates cannot receive `isRecommended` while a relevant ranked candidate exists.

- [ ] **Step 4: Run focused API tests and commit**

Run: `pnpm vitest run src/purchasing/routes.test.ts`

Expected: PASS.

```bash
git add server/purchasing/routes.ts src/purchasing/routes.test.ts
git diff --cached --name-only
git commit -m "feat: use saved feedback in purchase search"
```

### Task 4: Verify regression safety and the real haddock result

**Files:**
- No production file changes expected.
- Do not stage existing unrelated E2E changes.

**Interfaces:**
- Consumes: all implementation from Tasks 1-3.
- Produces: verification evidence that the feature works without changing live inventory.

- [ ] **Step 1: Run the complete unit/integration suite**

Run: `pnpm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run TypeScript and production build checks**

Run: `pnpm build`

Expected: TypeScript and Vite production build pass.

- [ ] **Step 3: Run isolated browser regression tests**

Before running, confirm `playwright.config.ts` still uses port `4174` and temporary `GROW_NATURALLY_PURCHASING_DB_PATH` / inventory paths. Then run: `pnpm test:e2e`.

Expected: all Playwright tests pass and the live 5174 inventory database is unchanged.

- [ ] **Step 4: Verify the current catalogue scenario without writing live data**

Use the running server's read-only historical search:

```bash
curl -sS 'http://127.0.0.1:5174/api/purchasing/historical-products?query=haddock'
```

Expected first recommendation before manual feedback: `Campbells Prime Meat Ltd`, product code `28HADFZIQF`, purchase count `5`, current inventory `2`. Verify `smoked haddock` still recommends the smoked candidate.

- [ ] **Step 5: Inspect final scope**

Run:

```bash
git status --short
git diff --check
git log --oneline -6
```

Expected: no uncommitted production or new unit-test changes from this feature; pre-existing unrelated changes remain untouched and unstaged.
