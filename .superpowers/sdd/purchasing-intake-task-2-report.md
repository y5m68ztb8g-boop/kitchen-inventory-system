# Task 2 Report: Generic Intake Persistence and Upload Validation

## Scope Delivered

- Added SQLite `purchase_intakes` and `purchase_intake_items` tables while retaining the existing `whiteboard_scans` and `whiteboard_scan_items` schema statements unchanged.
- Added typed generic intake inputs, item metadata, lifecycle statuses, draft/pending persistence, source retrieval, and ReadyForPurchase queue handoff.
- Stored the source BLOB and source audit metadata in SQLite. No browser storage code was added.
- Added multipart validation for JPG, PNG, HEIC, HEIF, WebP, PDF, XLSX, XLS, and CSV. Unsupported, empty, and over-25-MB files receive distinct purchasing API errors.
- Added the `xlsx` dependency for the next parsing task.

## Validation Rules

- Pending saves and queue handoffs reject empty item lists, duplicate or blank client IDs, blank product names, negative or non-finite quantities, invalid confidence values, and unreviewed confidence values below `0.8`.
- Handoff validates the supplied review records, then changes only the intake status, audit timestamps, and handoff timestamp. It does not create an order or change inventory.

## TDD Evidence

### RED

Command:

```sh
pnpm vitest run src/purchasing/database.test.ts src/purchasing/serverValidation.test.ts
```

Result: failed as expected before implementation. The generic intake tables were absent; `saveDraftIntake`, `savePendingIntake`, and `handOffIntakeToPurchasing` were not exported; and `intakeFiles.ts` did not exist.

### GREEN

Command:

```sh
pnpm vitest run src/purchasing/database.test.ts src/purchasing/serverValidation.test.ts
```

Result: 2 test files passed, 62 tests passed.

### Full Verification

Command:

```sh
pnpm test && pnpm build
```

Result: 7 test files passed, 147 tests passed; TypeScript and Vite production build passed.

## Commit Scope

The Task 2 commit includes only the requested persistence, validation, dependency, tests, and this report. Concurrent Task 1 changes to purchasing matching files are excluded.

## Concerns

None. File-content parsing and generic HTTP routes intentionally remain for later tasks; this task only provides the persistence and upload-validation boundary they consume.
