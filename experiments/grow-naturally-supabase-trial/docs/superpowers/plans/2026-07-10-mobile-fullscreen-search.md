# Mobile Fullscreen Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home search into a focused full-screen mobile workspace with explicit close/back behavior, continuous searching and readable result cards, while preserving desktop behavior.

**Architecture:** Reuse the existing Home search state and result components. Add a mobile viewport signal and a history marker so opening search creates one reversible UI state; close, Escape and browser back all use one reset function. Apply the full-screen presentation only through the `max-width: 560px` stylesheet, keeping the existing desktop grid and outside-result dismissal unchanged.

**Tech Stack:** React 19, TypeScript, Vite, CSS media queries, lucide-react, Vitest, Testing Library, Playwright.

## Global Constraints

- Mobile means viewport width `<= 560px`, matching the existing CSS breakpoint.
- Mobile search opens in the current page and does not create a new route.
- Other home modules are hidden only while the mobile search layer is open.
- The layer closes only through the visible `×`, `Escape`, or browser/device Back; tapping blank content does not close it.
- Clearing either query never closes the search layer.
- Closing clears both queries, results mode, dismissed state and copied-code feedback; reopening starts clean.
- Inventory and invoice search remain as two vertically stacked inputs.
- The freezer mini-map keeps the existing rack proportions and highlighted location.
- Invoice product codes remain horizontal; action buttons must not squeeze them into vertical text.
- Desktop search behavior and layout remain unchanged.
- Do not modify inventory, Supabase, purchasing SQLite, invoice catalogue or purchasing recommendation behavior.
- Unit-test creation or material edits must be delegated first to `unit_test_spark`; that role cannot edit production code.
- Browser tests use the existing isolated port `4174` and temporary data paths.
- Do not stage the pre-existing unrelated changes in `e2e/home.spec.ts` or `e2e/purchasing.spec.ts`; create a new E2E file.

---

### Task 1: Add mobile search lifecycle and close controls

**Files:**
- Modify: `src/Home.tsx`
- Test: `src/Home.test.tsx`

**Interfaces:**
- Consumes: existing `searchOpen`, both query states, `searchMode`, `searchResultsDismissed`, `copiedSupplierCode`, and input/result refs.
- Produces: one mobile viewport state, `openSearch()`, `closeSearch()`, a visible mobile-only close button named `关闭搜索`, and history/keyboard cleanup.

- [ ] **Step 1: Delegate failing lifecycle unit tests to `unit_test_spark`**

The test agent edits only `src/Home.test.tsx` and adds a reusable `matchMedia` mock for `max-width: 560px`. Cover:

```tsx
it("keeps mobile search open when the current query is cleared", async () => {
  renderMobileHome();
  await user.click(screen.getByRole("button", { name: "搜索" }));
  const input = screen.getByPlaceholderText("输入产品名称");
  await user.type(input, "Chicken Breast");
  await user.clear(input);
  expect(screen.getByRole("button", { name: "关闭搜索" })).toBeVisible();
});

it("clears both searches after closing and reopening", async () => {
  renderMobileHome();
  await user.click(screen.getByRole("button", { name: "搜索" }));
  await user.type(screen.getByPlaceholderText("搜索发票商品 / code"), "milk");
  await user.type(screen.getByPlaceholderText("输入产品名称"), "chicken");
  await user.click(screen.getByRole("button", { name: "关闭搜索" }));
  await user.click(screen.getByRole("button", { name: "搜索" }));
  expect(screen.getByPlaceholderText("搜索发票商品 / code")).toHaveValue("");
  expect(screen.getByPlaceholderText("输入产品名称")).toHaveValue("");
});
```

Also test `Escape`, a synthetic `PopStateEvent`, focus returning to the search trigger, mobile history push only once per opening, and desktop having no visible close control.

- [ ] **Step 2: Run the focused unit tests and verify failure**

Run: `pnpm vitest run src/Home.test.tsx`

Expected: new tests fail because there is no close button, mobile history state or reset lifecycle.

- [ ] **Step 3: Add mobile viewport tracking**

In `src/Home.tsx`, use `window.matchMedia("(max-width: 560px)")`, initialize from `.matches`, and subscribe with `addEventListener("change", ...)`. Remove the listener on unmount. Keep this signal about behavior only; CSS remains responsible for visual layout.

- [ ] **Step 4: Implement one reset and close path**

Create a reset function that performs exactly:

```ts
setSearchOpen(false);
setSearchQuery("");
setInvoiceSearchQuery("");
setSearchMode("inventory");
setSearchResultsDismissed(false);
setCopiedSupplierCode("");
```

Store the search trigger in a ref and return focus with `queueMicrotask`. Mobile `openSearch()` pushes one same-URL history entry carrying `{ homeSearchOpen: true }`. A `popstate` listener calls reset without navigating again. The visible close button and `Escape` reset immediately and call `history.back()` only when this component owns the marker. Desktop `openSearch()` does not push history.

- [ ] **Step 5: Add semantic mobile controls**

Import lucide `X`. Add a heading labelled `搜索` and an icon-only button with `aria-label="关闭搜索"`, tooltip `关闭`, and a stable class such as `mobile-search-close`. Keep both hidden from desktop through CSS in Task 2. Add `home-shell-search-open` to `<main>` whenever search is open; the media query will decide whether it becomes full screen.

- [ ] **Step 6: Run focused tests and commit Task 1**

Run: `pnpm vitest run src/Home.test.tsx`

Expected: PASS.

```bash
git add src/Home.tsx src/Home.test.tsx
git diff --cached --name-only
git commit -m "feat: add mobile search lifecycle"
```

### Task 2: Add full-screen responsive layout and visual regression coverage

**Files:**
- Modify: `src/App.css`
- Create: `e2e/mobile-search.spec.ts`

**Interfaces:**
- Consumes: `home-shell-search-open`, `mobile-search-close`, current result-card classes and the existing `560px` media query.
- Produces: fixed full-screen mobile search presentation, horizontal invoice code layout and isolated desktop/mobile browser coverage.

- [ ] **Step 1: Add the mobile full-screen CSS**

Inside `@media (max-width: 560px)`, style:

```css
.home-shell-search-open {
  align-items: stretch;
  background: #fbfbfd;
  display: block;
  inset: 0;
  min-height: 100dvh;
  overflow-y: auto;
  padding: 16px;
  position: fixed;
  z-index: 50;
}

.home-shell-search-open .home-grid {
  display: block;
  width: 100%;
}

.home-shell-search-open .home-grid > :not(.home-module-search-open) {
  display: none;
}

.home-shell-search-open .home-module-search-open {
  aspect-ratio: auto;
  min-height: 230px;
  overflow: visible;
  width: 100%;
}
```

Show the mobile heading/close control only in this media query. Give the results full width beneath the search panel. Do not alter freezer grid-template areas or tracks; compact only result-card padding, gap and text sizes.

- [ ] **Step 2: Fix invoice code actions on mobile**

Within the same media query, make `.invoice-code-row` a two-column, two-row grid. Keep `Code` and the full code on row one with `white-space: nowrap` and normal wrapping disabled. Place `Open Brakes` and copy actions on row two, allowing one full-width copy button when no Brakes action exists. Do not change desktop grid columns.

- [ ] **Step 3: Add isolated mobile and desktop E2E tests**

Create `e2e/mobile-search.spec.ts`; do not edit existing dirty E2E files. Use project-name skips so each assertion runs only in its intended project.

Mobile coverage:

```ts
test("mobile search is full screen, reusable and explicitly closable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeVisible();
  await expect(page.getByRole("button", { name: "区域" })).toBeHidden();
  const product = page.getByPlaceholder("输入产品名称");
  await product.fill("Chicken Breast");
  await product.fill("");
  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeVisible();
  await product.fill("Chunky Chips");
  await page.getByRole("button", { name: "关闭搜索" }).click();
  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();
});
```

Add mobile layout assertions from one bounded `page.evaluate`: `document.body.scrollWidth <= window.innerWidth`, code text height is no more than two normal text lines, close control remains inside the viewport, and freezer-map grid-template areas before/after remain identical. Add a reopen-empty assertion and Back navigation assertion.

Desktop coverage confirms no `关闭搜索` button is visible, the other modules remain visible while search is open, and outside-result dismissal still works.

- [ ] **Step 4: Run focused browser tests**

Run: `pnpm playwright test e2e/mobile-search.spec.ts`

Expected: both the mobile and desktop tests pass against isolated port 4174.

- [ ] **Step 5: Capture mobile screenshots for visual inspection**

Use Playwright at `390x844` to capture inventory and invoice search states. Inspect that the heading/inputs are not clipped, code is horizontal, actions fit, result cards do not overlap and the freezer map retains its existing proportions.

- [ ] **Step 6: Run complete verification and commit**

Run:

```bash
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all suites pass; live inventory hash remains unchanged because Playwright uses 4174 temporary paths.

```bash
git add src/App.css e2e/mobile-search.spec.ts
git diff --cached --name-only
git commit -m "feat: add mobile fullscreen search layout"
```

