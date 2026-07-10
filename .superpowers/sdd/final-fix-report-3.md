# Final Purchasing Item ID Fix Report 3

Date: 2026-07-10

## Status

Resolved the final Important purchasing finding: fallback client row IDs can now recur in separate scans without colliding in SQLite. Inventory behavior was not modified.

## Changes

1. `confirmWhiteboardScan` persists each item under the server-scoped ID `${scanId}:${clientId}`.
2. `clientId` remains unchanged in the HTTP confirmation response for UI reconciliation.
3. Duplicate `clientId` values in one confirmation are rejected before the database transaction with `INVALID_REVIEW_DATA`.
4. Database expectations now assert the scoped IDs, including a regression where `scan-1` and `scan-2` both save `purchase-row-1` successfully.
5. Route coverage asserts the confirmation response includes the original `clientId` and duplicate IDs receive HTTP 400 with `INVALID_REVIEW_DATA`.

## TDD Evidence

- RED: after adding the scoped-ID and duplicate-validation database tests, the focused run failed four assertions. Existing rows persisted as unscoped IDs, two scans using `purchase-row-1` raised `UNIQUE constraint failed: whiteboard_scan_items.id`, and duplicate IDs produced the raw SQLite constraint error instead of `INVALID_REVIEW_DATA`.
- GREEN: the minimal database implementation changed the persisted ID to `${scanId}:${clientId}` and validates a per-confirmation `Set` of client IDs. Focused database and route coverage then passed 35/35 tests.

## Verification

- `pnpm vitest run src/purchasing/database.test.ts src/purchasing/routes.test.ts`: passed, 35 tests.
- `pnpm test`: passed, 6 files and 123 tests.
- `pnpm build`: passed (`tsc -b` and Vite production build).
- `pnpm test:e2e:purchasing`: passed, 2/2 desktop and mobile tests.

## Concerns

- The persisted ID format intentionally uses `:` as a deterministic scope delimiter. The application treats it as an opaque primary key; the client IDs used by the UI and generated scan IDs do not depend on parsing this value.
- No inventory source, behavior, or tests were changed.
