# Task 6 Report: Whiteboard Purchasing Verification

## Coverage

`e2e/purchasing.spec.ts` verifies the purchasing flow at 390 x 844: it opens `采购`, previews a selected PNG before recognition, receives mocked uncertain scan data, verifies the low-confidence row class, edits and manually reviews the row, confirms it, and verifies the saved `Pending` recommendation.

The saved recommendation assertions cover historical product name `Chicken Breast`, supplier `Brakes`, supplier code `BRK`, product code `CHICKEN-1`, pack size `2x5kg`, last price `£24.50`, purchase count `10`, date `2026-07-01`, and current inventory `7`. The test checks no horizontal overflow after the preview, review, and saved states.

`src/purchasing/routes.test.ts` exercises the real scan route and `prepareWhiteboardImage`. It injects `recogniseWhiteboard` with an explicitly empty API key, so it makes no OpenAI request and reads or prints no real secret. The route returns the Chinese `MISSING_API_KEY` response for a valid PNG, `UNSUPPORTED_IMAGE_FORMAT` for text image content, and `IMAGE_TOO_LARGE` for an upload larger than 15 MB.

## Final Verification

- `pnpm exec vitest run src/purchasing/routes.test.ts`: passed, 13/13 tests.
- `pnpm test:e2e:purchasing`: passed, 2/2 tests across desktop and mobile projects.
- `pnpm test`: passed, 106/106 tests across 6 files.
- `pnpm build`: passed.

## Legacy E2E Concern

`pnpm test:e2e -- e2e/purchasing.spec.ts` is parsed by the existing package script as the full 22-test E2E suite. It has unrelated failures in `e2e/home.spec.ts` for the future-feature label, home-search inventory location, and freezer product-code display. Purchasing tests were not the reported failures, and inventory/UI code was not changed.

## Re-review Fix

Added a focused assertion for the saved recommended historical product name, scoped to the recommendation details list. Re-ran the focused purchasing E2E and route Vitest coverage; the results are recorded above.
