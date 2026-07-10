# Task 2 Report: SQLite Scan Repository and Historical Matching

## Implementation Summary

- Added a separate `better-sqlite3` purchasing repository with the approved `whiteboard_scans` and `whiteboard_scan_items` tables.
- Enabled foreign keys and idempotent schema initialization.
- Added draft scan persistence and binary image retrieval by scan ID.
- Added transactional confirmation that replaces scan rows, persists recommendations, and marks confirmed scans/items `Pending`.
- Added review validation for trimmed product names, nullable non-negative finite quantities, confidence bounds, and explicit manual review below `0.8` confidence.
- Added deterministic historical matching with Unicode/English-name normalization, bounded aliases, semantic gating, capped frequency and recency bonuses, and stable final tie-breaking.
- Added current inventory aggregation by supplier-product ID first and normalized product name only when no ID match exists.

## TDD Evidence

### RED: Database Repository

Tests were added before `server/purchasing/database.ts`.

Command:

```bash
pnpm test -- src/purchasing/database.test.ts
```

Result: exit `1`; `src/purchasing/database.test.ts` failed to load because `../../server/purchasing/database` did not exist. Vitest reported `1` failed file, `2` existing files passed, and `59` existing tests passed.

### GREEN: Database Repository

Command:

```bash
pnpm exec vitest run src/purchasing/database.test.ts
```

Result: exit `0`; `1` test file passed and `8` tests passed.

### RED: Historical Matching

Tests were added before `server/purchasing/matching.ts`.

Command:

```bash
pnpm test -- src/purchasing/matching.test.ts
```

Result: exit `1`; `src/purchasing/matching.test.ts` failed to load because `../../server/purchasing/matching` did not exist. Vitest reported `1` failed file, `3` existing files passed, and `67` existing tests passed.

### GREEN: Task 2 Focused Tests

Command:

```bash
pnpm exec vitest run src/purchasing/database.test.ts src/purchasing/matching.test.ts
```

Result: exit `0`; `2` test files passed and `21` tests passed (`8` database, `13` matching).

## Exact Final Results

### Full Suite

Command:

```bash
pnpm test
```

Result: exit `0`; `4` test files passed and `80` tests passed. Duration: `9.63s`.

### Production Build

Command:

```bash
pnpm build
```

Result: exit `0`; `tsc -b` completed, Vite transformed `1600` modules, and the production build completed in `1.05s`.

### Additional Verification

- `git diff --check` exited `0` before the final report and commit.
- The first build attempt correctly exposed declaration-emit and old-target compatibility errors in the new modules. The SQLite factory now has an explicit exported return type, and name normalization/Set traversal use syntax compatible with the existing standalone Node TypeScript project. A focused `pnpm exec tsc -b` then exited `0` before the final build.

## Files Changed

- `experiments/grow-naturally-supabase-trial/server/purchasing/database.ts`
- `experiments/grow-naturally-supabase-trial/server/purchasing/matching.ts`
- `experiments/grow-naturally-supabase-trial/src/purchasing/database.test.ts`
- `experiments/grow-naturally-supabase-trial/src/purchasing/matching.test.ts`
- `.superpowers/sdd/task-2-report.md`

## Self-Review

- The schema contains exactly the two approved purchasing tables and does not touch inventory persistence or Supabase behavior.
- Scan item replacement, insertion, and scan status update execute inside one `better-sqlite3` transaction.
- Invalid low-confidence review data is validated before any write; tests confirm zero item rows and unchanged `Draft` scan status/`confirmed_at`.
- Every persisted recommendation field from the design is represented and tested.
- Matching filters out candidates below the semantic threshold before applying purchase frequency or recency, preventing strong history from rescuing unrelated names.
- Frequency uses capped `Math.log1p`; recency is bounded and relative to the newest semantically eligible candidate; final sorting is deterministic.
- Inventory ID matches exclude name-only rows; normalized-name fallback runs only when there are no ID matches.
- No inventory feature file, package script, Supabase file, or UI file was modified.

## Concerns

None.
