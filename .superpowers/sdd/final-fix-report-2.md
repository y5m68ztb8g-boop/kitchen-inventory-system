# Final Whiteboard Purchasing Fix Report 2

Date: 2026-07-10

## Status

All five Important final-review findings were implemented in the purchasing experiment. Existing inventory write, edit, delete, valuation, and ordering behavior was not changed.

## Changes

1. AVIF and HEVC HEIC/HEIF
   - `prepareWhiteboardImage` now rejects Sharp metadata with `format: "heif"` and `compression: "av1"`.
   - The generated AVIF regression is rejected with `UNSUPPORTED_IMAGE_FORMAT`.
   - The genuine HEVC fixture still reports `compression: "hevc"`, passes through the existing HEIC fallback, and produces WebP.

2. Visible freezer baseline in purchasing recommendations
   - Added a server-side current-inventory composer that combines persisted dry-store/freezer rows with `FREEZER_INVENTORY`.
   - Baseline rows respect `deletedFreezerInventoryIds`, apply source-name overrides, and are omitted when a persisted freezer row already has the same `sourceItemId`.
   - Baseline supplier/product IDs are used only when both suggested codes are present; otherwise matching falls back to the normalized product name.
   - Name-only baseline stock is added to persisted supplier-ID matches, while same-name rows tied to a different supplier product remain excluded.
   - `quantityText` is converted to the first finite non-negative numeric token, with unconfirmed/non-numeric text represented as `0`.
   - The purchasing route test uses the real baseline and proves `Chicken Breast` contributes current inventory quantity `7` from `7 Cases`.

3. Recognition and confirmation validation
   - `unreadable_text` values are trimmed and whitespace-only values are discarded after strict schema parsing.
   - An itemless result with only whitespace unreadable text now raises `NO_READABLE_TEXT`.
   - Both the HTTP confirmation schema and SQLite confirmation API reject zero retained rows with `INVALID_REVIEW_DATA`, leaving the scan as `Draft` with no Pending items.

4. Recognition retry UI
   - Recognition failures return to a preview-backed state containing the same `File`, object URL, and Chinese error.
   - The preview remains visible and `重试识别` resubmits the same file directly.
   - Native file input values are cleared after selection so selecting the same file again triggers change reliably.

5. Real desktop purchasing E2E
   - Removed the purchasing suite's unconditional `390 x 844` override.
   - The same real purchasing flow now runs with each Playwright project's configured viewport.
   - The test explicitly requires desktop width at least 1000 pixels and mobile viewport exactly `390 x 844`.

## TDD Evidence

1. AVIF rejection
   - RED: focused validation resolved successfully to WebP instead of rejecting AVIF.
   - GREEN: server validation passed 20/20 at that cycle, including AVIF rejection and genuine HEVC acceptance.
2. Baseline freezer recommendations
   - RED: matching and route suites could not load the new current-inventory composition boundary.
   - GREEN: matching and route suites passed 28/28; the route response reported Chicken Breast current inventory `7`.
   - REVIEW RED/GREEN: a mixed persisted-ID plus name-only baseline case first returned `5` instead of `12`, then passed with both legitimate quantities included.
3. Whitespace recognition and empty confirmation
   - RED: four assertions failed: unreadable text stayed untrimmed, whitespace counted as readable, direct empty confirmation succeeded, and the route returned HTTP 200.
   - GREEN: validation, database, and route suites passed 54/54; empty confirmation returns HTTP 400 and preserves `Draft`.
4. Recognition retry UI
   - RED: the file input retained `C:\\fakepath\\whiteboard.jpg`, and failure removed the preview and exposed only `重新选择图片`.
   - GREEN: the UI suite passed 10/10; the same `File` was submitted on both recognition calls.
5. Desktop E2E
   - RED: desktop failed its viewport assertion with received width `390`; mobile passed.
   - GREEN: after removing the override, desktop and mobile both passed the purchasing flow.

## Required Verification

- `pnpm test`
  - Passed: 6 test files, 120 tests.
  - Final run duration: 10.31 seconds.
- `pnpm build`
  - Passed: `tsc -b` and Vite production build.
  - Vite transformed 1,603 modules and completed in 1.06 seconds.
  - Output: JS 484.32 kB (113.18 kB gzip), CSS 28.98 kB (6.24 kB gzip).
- `pnpm test:e2e:purchasing`
  - Passed: 2/2 tests in 1.9 seconds.
  - Passed projects: real desktop and mobile `390 x 844`.
  - Playwright emitted the non-failing environment warning that `NO_COLOR` is ignored because `FORCE_COLOR` is set.

## Legacy Full E2E

`pnpm test:e2e` was rerun for fresh attribution. Result: 14 passed, 8 failed in 38.1 seconds. Both purchasing projects passed. Every failure was in `e2e/home.spec.ts` and none touched purchasing code:

1. Desktop and mobile search expected missing `冷冻库 / A货架 / 1号位置` at line 18.
2. Desktop waiting-invoice flow timed out waiting for `匹配 Chicken Breast 发票` at line 41.
3. Mobile waiting-invoice flow hit two matches for `Campbell / 22CFIL5K` at line 49.
4. Mobile edit/delete flow timed out waiting for `匹配 Chicken Breast 发票` at line 70.
5. Mobile package adjustment timed out waiting for `匹配 Ice 发票` at line 113.
6. Desktop valuation flow could not find `£53.25` at line 178.
7. Mobile valuation flow found three matches for `5KG PACK CHICKEN FILLET APPROX 200G+` at line 168.

These remain legacy shared-inventory-state and stale/ambiguous-locator failures. No inventory behavior was reverted or changed to hide them.

## Concerns

- Baseline `quantityText` contains mixed free-form units and compound descriptions. The server intentionally takes only the first finite non-negative number rather than inventing conversions between cases, bags, packs, portions, or pieces.
- AVIF rejection depends on Sharp exposing AV1 as `metadata.compression === "av1"`; the focused generated AVIF test verifies that behavior against the installed Sharp 0.35.3 build.
- The broad home E2E suite still shares mutable file-backed inventory across parallel workers, so its exact legacy failure mix can vary between runs.
