# Task 1 Report: Ranked Historical-Product Candidates

## Scope

Completed Task 1 in `/Users/xue/Documents/Codex/自然生长/experiments/grow-naturally-supabase-trial`.

- `server/purchasing/matching.ts` exports `rankHistoricalProducts(input)`.
- Ranked candidates retain supplier/product card data, recommendation fields, current inventory quantity, a numeric score, and a single `isRecommended` result.
- Ranking uses only historical invoice data: semantic relevance, bounded purchase-frequency and recency bonuses, followed by deterministic semantic, purchase-count, date, and id tie-breakers.
- `recommendHistoricalProduct` delegates to the shared ranker.
- No inventory data is written or mutated. No OpenAI calls are made.
- `src/supplierProducts.ts` was reviewed but did not require an edit: its hyphen-normalized, optional-leading-`F` supplier-product-code search behavior remains unchanged and is covered by the existing `Home.test.tsx` regression test.

## Interrupted State and TDD Evidence

The expected RED state from the brief was unavailable before this task resumed. The interrupted worktree already contained both the `rankHistoricalProducts` export/implementation and the two specified ranking tests. Running the focused command before any edits produced 16 passing tests, including both newly added ranking tests.

I reviewed the ranking contract for missing required behavior. The existing implementation already provides all required ranked-card fields, finite numeric scores, semantic threshold filtering, deterministic ordering, exactly one recommendation, and non-mutating inventory lookup. Therefore no additional missing behavior existed for which a new failing test could truthfully be added before changing production code.

## Verification

- Focused: `pnpm vitest run src/purchasing/matching.test.ts` - 16 passed.
- Full: `pnpm test` - 126 passed across 7 test files.

## Files Committed

- `server/purchasing/matching.ts`
- `src/purchasing/matching.test.ts`

## Review Fix: Ranking Contract Regression Coverage

Added focused regression tests in `src/purchasing/matching.test.ts` for the review finding:

- Exclusion of candidates below the semantic threshold.
- Complete ranked fields, including a finite numeric `score`.
- Exactly one `isRecommended` candidate across multiple results.
- Current-inventory quantity propagation per candidate.
- Stable ID as the final tie-break.

Verification output:

```text
$ pnpm vitest run src/purchasing/matching.test.ts
Test Files  1 passed (1)
Tests  21 passed (21)

$ pnpm test
Test Files  7 passed (7)
Tests  152 passed (152)
```
