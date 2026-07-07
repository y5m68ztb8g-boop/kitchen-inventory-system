# Grow Naturally Inventory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the SQLite data foundation and workbook import path for the Grow Naturally kitchen inventory MVP.

**Architecture:** Use a local SQLite database with a focused Python import package. Keep Excel as an initial source only, use review tables for uncertain matches/conversions, and populate SQLite FTS5 for future supplier product search.

**Tech Stack:** Python 3, SQLite, openpyxl, unittest, SQLite FTS5.

## Global Constraints

- Do not modify the source workbook.
- Do not build the full application UI in this phase.
- Do not confirm ambiguous supplier matches automatically.
- Do not guess quantity conversions for valuation.
- Preserve invoice source file traceability.
- Use hidden internal product IDs in the database; staff-facing flows should use product names, locations, quantities, and supplier names.

---

## File Structure

- Create `inventory_mvp/__init__.py`: package marker.
- Create `inventory_mvp/schema.py`: SQLite schema creation and FTS setup.
- Create `inventory_mvp/importer.py`: workbook import orchestration.
- Create `inventory_mvp/search.py`: supplier product search queries.
- Create `inventory_mvp/valuation.py`: conservative valuation helpers.
- Create `scripts/import_workbook.py`: CLI entry point for importing the workbook.
- Create `scripts/inspect_database.py`: CLI for summary metrics after import.
- Create `tests/test_schema.py`: schema creation tests.
- Create `tests/test_importer.py`: workbook import and data-quality tests.
- Create `tests/test_search.py`: search behavior tests.
- Create `tests/test_valuation.py`: valuation safety tests.
- Create `data/.gitkeep`: placeholder for generated local SQLite files.

## Task 1: Schema Foundation

**Files:**
- Create: `inventory_mvp/schema.py`
- Create: `tests/test_schema.py`

**Interfaces:**
- Produces: `create_schema(conn: sqlite3.Connection) -> None`
- Produces: `connect_database(path: str | Path) -> sqlite3.Connection`

- [ ] Step 1: Write failing schema tests.
- [ ] Step 2: Run `python3 -m unittest tests.test_schema -v` and verify failure because `inventory_mvp.schema` does not exist.
- [ ] Step 3: Implement schema creation with foreign keys, unique constraints, indexes, and FTS5 table.
- [ ] Step 4: Run `python3 -m unittest tests.test_schema -v` and verify pass.

## Task 2: Workbook Import

**Files:**
- Create: `inventory_mvp/importer.py`
- Create: `tests/test_importer.py`

**Interfaces:**
- Consumes: `create_schema(conn)`
- Produces: `import_workbook(conn: sqlite3.Connection, workbook_path: str | Path) -> ImportSummary`
- Produces: `ImportSummary` dataclass with supplier, location, hotel product, supplier product, invoice header, invoice line, confirmed link, review queue, and valuation counts.

- [ ] Step 1: Write failing tests against the real workbook for core counts and review behavior.
- [ ] Step 2: Run `python3 -m unittest tests.test_importer -v` and verify failure because importer is missing.
- [ ] Step 3: Implement suppliers, locations, products, invoice headers, invoice lines, catalogue rollups, matching review, and valuation snapshot imports.
- [ ] Step 4: Run importer tests and fix only implementation issues.

## Task 3: Search

**Files:**
- Create: `inventory_mvp/search.py`
- Create: `tests/test_search.py`

**Interfaces:**
- Consumes: imported SQLite database.
- Produces: `search_supplier_products(conn: sqlite3.Connection, query: str, limit: int = 20) -> list[dict]`

- [ ] Step 1: Write failing tests for exact code search and keyword search.
- [ ] Step 2: Run `python3 -m unittest tests.test_search -v` and verify failure.
- [ ] Step 3: Implement FTS population and search ranking.
- [ ] Step 4: Run search tests and verify pass.

## Task 4: Valuation Safety

**Files:**
- Create: `inventory_mvp/valuation.py`
- Create: `tests/test_valuation.py`

**Interfaces:**
- Produces: `calculate_inventory_value(quantity_purchase_units: float | None, latest_price: float | None, average_price: float | None) -> dict`
- Produces: `valuation_status` values: `confirmed`, `estimated`, `unvalued`, `needs_conversion_review`

- [ ] Step 1: Write failing tests for latest price, average fallback, missing price, and unsafe conversion.
- [ ] Step 2: Run `python3 -m unittest tests.test_valuation -v` and verify failure.
- [ ] Step 3: Implement minimal valuation helpers.
- [ ] Step 4: Run valuation tests and verify pass.

## Task 5: CLI Tools

**Files:**
- Create: `scripts/import_workbook.py`
- Create: `scripts/inspect_database.py`

**Interfaces:**
- `python3 scripts/import_workbook.py Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx data/grow_naturally.sqlite`
- `python3 scripts/inspect_database.py data/grow_naturally.sqlite`

- [ ] Step 1: Write CLI smoke tests or use existing importer tests to cover callable behavior.
- [ ] Step 2: Implement import CLI.
- [ ] Step 3: Implement inspect CLI showing key counts and review counts.
- [ ] Step 4: Run full test suite and then run both CLI commands against the real workbook.

## Task 6: Final Verification

**Files:**
- Modify as needed from previous tasks.

- [ ] Run `python3 -m unittest discover -v`.
- [ ] Run workbook import into `data/grow_naturally.sqlite`.
- [ ] Run database inspection and compare counts against known workbook profile.
- [ ] Confirm source workbook timestamp and size are unchanged.
- [ ] Report generated files, verification results, and known remaining review items.

## Plan Self Review

The plan is focused on the approved next step: data foundation, not the full application. Every task has a concrete test cycle. The plan avoids placeholders and uses stable interfaces that can support a later API/UI layer.
