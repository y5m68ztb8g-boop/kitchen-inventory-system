# Task 6 Report: Whiteboard Purchasing Verification

## Scope

- Preserved `e2e/purchasing.spec.ts`, which provides the requested 390 x 844 mobile purchasing flow.
- No production changes were needed: the completed Tasks 1-5 implementation satisfied the E2E flow without a defect-driven fix.

## Purchasing E2E Coverage

`e2e/purchasing.spec.ts` verifies that a user can:

- Open `采购` at a 390 x 844 viewport.
- Choose a PNG and see its preview before recognition is requested.
- Receive mocked scan data with an uncertain item.
- Edit the product name, complete the required manual-review checkbox, and submit the confirmation request.
- Receive a mocked confirmation response and see `Pending` plus the supplier recommendation.
- Keep `document.documentElement.scrollWidth <= window.innerWidth`.

Focused result: `pnpm exec playwright test e2e/purchasing.spec.ts --project=mobile --workers=1 --reporter=line` passed (1/1).

## Endpoint Smoke Checks

Started Vite on `127.0.0.1:5183` with `OPENAI_API_KEY` explicitly set to an empty value; no secret value was read or printed.

- Valid generated PNG returned `MISSING_API_KEY`.
- Text bytes submitted as `image/jpeg` returned `UNSUPPORTED_IMAGE_FORMAT`.
- A 15 MB plus one byte upload returned `IMAGE_TOO_LARGE`.

## Browser Checks

Used the in-app browser at 390 x 844 and 1440 x 900.

- Purchasing camera/upload controls render on both viewports with no horizontal overflow.
- Home, freezer, and dry-store pages render at both viewports with no horizontal overflow.
- The focused E2E flow covers the preview, low-confidence review, editable fields, saved recommendation, and confirmation states.

## Verification

- `pnpm test`: passed, 106 tests across 6 files.
- `pnpm build`: passed.
- Focused purchasing E2E: passed, 1/1 mobile test.

## Existing Regression Concern

The requested script `pnpm test:e2e -- e2e/purchasing.spec.ts` is interpreted by the current package script as the full E2E suite, not a focused file selection. Existing `e2e/home.spec.ts` assertions fail before any Task 6 change, including missing `未来功能预留`, home search inventory, and freezer product-code expectations. These are unrelated inventory regressions and were not modified under this task's scope.

## Review Fixes

- Added a real HTTP route smoke test in `src/purchasing/routes.test.ts`. It injects `recogniseWhiteboard` with an explicitly empty API key and uses `prepareWhiteboardImage`, so no OpenAI request or environment secret access occurs. The scan route returns `MISSING_API_KEY` with the Chinese message for a valid PNG, `UNSUPPORTED_IMAGE_FORMAT` for text image content, and `IMAGE_TOO_LARGE` for a file exceeding 15 MB.
- Added `test:e2e:purchasing` to `package.json` for the focused Playwright specification.
- Expanded the purchasing E2E flow to assert the low-confidence row class, all requested recommendation values, and no horizontal overflow after preview, review, and saved states.

## Review Verification

- `pnpm exec vitest run src/purchasing/routes.test.ts`: passed, 13 tests.
- `pnpm test:e2e:purchasing`: passed, 2 tests (desktop and mobile projects).
- `pnpm test`: passed, 106 tests across 6 files.
- `pnpm build`: passed.
- `pnpm test:e2e -- e2e/purchasing.spec.ts`: the existing script still invokes all 22 E2E tests. It failed in unrelated `e2e/home.spec.ts` cases: home module future-feature label, home search inventory location, and freezer product-code display. Purchasing tests were not the reported failures.
