# Final Whiteboard Purchasing Fix Report

Date: 2026-07-10

## Scope Completed

- Purchasing SQLite now creates a missing parent directory before opening a file-backed database.
- Every accepted JPEG, PNG, and WebP is fully decoded even when no conversion is otherwise needed.
- HEVC-compressed HEIC is decoded with `heic-convert` when the installed Sharp/libvips build cannot decode it, then normalized to WebP before storage and OpenAI.
- Multipart uploads accept exactly 15 MB and reject every payload over 15 MB.
- The idle mobile UI exposes both camera capture and an existing-image chooser, plus a clear `返回首页` link.
- Delete-row and view-original-image controls are titled lucide icon buttons with accessible names.
- `NO_READABLE_TEXT` and `INVALID_AI_RESPONSE` have stable Chinese client messages; rejected browser fetches are normalized to `网络连接失败，请检查网络后重试。`.
- Confirmation failures restore the same editable review rows and expose `重试保存`.
- The home E2E expectation now reflects the intentional `采购` replacement. Existing purchasing preview controls, the exact `Scan Purchase Whiteboard` button, and all mobile overflow assertions remain.
- No supplier/order actions or inventory behavior changes were added.

## HEIC Capability And Fixture

The installed Sharp 0.35.3 build reports libheif 1.23.1, but `sharp.format.heif.input.fileSuffix` contains only `.avif`. It can read metadata from the HEVC fixture and reports `{ format: "heif", compression: "hevc" }`, but direct pixel conversion fails because HEVC decoding was not built in.

Added:

- Runtime dependency: `heic-convert@2.1.0` (`heic-decode`/`libheif-js` fallback).
- Type dependency: `@types/heic-convert@2.1.1`.
- Fixture: `src/purchasing/fixtures/rainbow-hevc.heic`, a 7,080-byte HEVC Main/Main Still Picture HEIC from the upstream libheif test data.

The focused regression decodes this real HEVC fixture and verifies that the prepared output decodes as WebP.

## TDD Evidence

1. Nested database path
   - RED: focused test failed with `Cannot open database because the directory does not exist` at the `better-sqlite3` constructor.
   - GREEN: `src/purchasing/database.test.ts` passed 16/16, including cleanup of the temporary nested path.
2. Corrupt small image
   - RED: Sharp metadata accepted the truncated JPEG, and `prepareWhiteboardImage` incorrectly returned it unchanged.
   - GREEN: the full-decode path rejected it with `UNSUPPORTED_IMAGE_FORMAT`; server validation passed 19/19.
3. HEVC HEIC
   - RED: the real HEVC fixture failed with `UNSUPPORTED_IMAGE_FORMAT` after Sharp's decoder reported missing HEVC support.
   - GREEN: the fallback converted the fixture and the resulting WebP assertion passed.
4. Exact upload boundary
   - RED: exactly 15 MB was rejected because Busboy emitted its limit event at the configured limit.
   - GREEN: the focused exact-15-MB and plus-one-byte tests both passed after setting the protective cap to `MAX_UPLOAD_BYTES + 1` and checking buffered length.
5. Initial UI and icon accessibility
   - RED: tests could not find `返回首页` or `选择现有图片`, and icon buttons lacked titles/lucide SVGs.
   - GREEN: both focused UI tests passed with the exact scan button and preview actions unchanged.
6. Client errors and save retry
   - RED: four focused tests exposed missing error mappings, native `Failed to fetch`, and discarded review state.
   - GREEN: all four passed with stable messages and preserved edited rows through a failed then successful confirmation.
7. Home attribution
   - RED: desktop and mobile both failed while looking for removed `未来功能预留`.
   - GREEN: both passed after asserting the intentional `采购` link and `#purchasing` target.

## Verification

- Changed-area Vitest: `pnpm exec vitest run src/purchasing/database.test.ts src/purchasing/serverValidation.test.ts src/purchasing/routes.test.ts src/PurchasingPage.test.tsx`
  - Passed: 4 files, 58 tests.
- Full unit/integration suite: `pnpm test`
  - Passed: 6 files, 113 tests.
- Production build: `pnpm build`
  - Passed: TypeScript build and Vite build; 1,603 modules transformed.
- Purchasing E2E: `pnpm test:e2e:purchasing`
  - Passed: desktop and mobile, 2/2 tests.
  - The preview, review, and saved-state horizontal-overflow assertions remain and passed.
- Focused updated home assertion
  - Passed: desktop and mobile, 2/2 tests.
- `git diff --check`
  - Passed.

No `.env.local` contents or API keys were read or printed.

## Legacy Full E2E Attribution

`pnpm test:e2e` ran 22 project/test combinations and returned 13 passed, 9 failed. Purchasing passed in desktop and mobile. The intentional home-module replacement also passed in desktop and mobile; none of the remaining failures are caused by that replacement.

Two isolated legacy test cases remain genuine baseline failures, each reproduced in desktop and mobile:

1. `search module returns locations and stock by product name`
   - Missing expected text: `冷冻库 / A货架 / 1号位置` at `e2e/home.spec.ts:18`.
2. `freezer entry matches an Excel invoice product and updates valuation`
   - The old exact-text locator for `5KG PACK CHICKEN FILLET APPROX 200G+` is not unique after saving. In the isolated rerun it resolved to 4 elements on desktop and 5 on mobile at `e2e/home.spec.ts:168`.

The full parallel run also produced five shared-inventory-state timeout failures while waiting for existing match buttons: desktop Chunky Chips, desktop edit/delete, mobile Chicken Breast matching, mobile edit/delete, and mobile Ice package adjustment. These did not reproduce as purchasing failures and are separate from the intentional home-module change. The previously reported freezer product-code assertion did not fail in this run; the isolated freezer-map test passed 2/2.

## Concerns

- `heic-convert` uses a WebAssembly/pure-JavaScript libheif decoder and performs substantial conversion work synchronously inside its promise. It is the smallest reliable fallback for this trial server, but high-concurrency production use should move HEIC conversion to worker threads or a job queue.
- The legacy E2E suite shares a mutable file-backed inventory database across parallel workers, so its aggregate failure count is timing/state dependent. No inventory behavior was changed to hide those failures.
