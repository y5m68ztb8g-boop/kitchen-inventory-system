# Grow Naturally Inventory MVP Design

## Goal

Build the first usable kitchen inventory foundation for Grow Naturally: import the current Excel workbook into SQLite, preserve supplier invoice history, support supplier product search, and keep uncertain product matches and unit conversions out of confirmed inventory value until reviewed.

## Scope

This phase implements the data foundation and import path first. The full application UI is intentionally deferred until the database, import quality, search model, and valuation rules are reliable.

In scope:

- SQLite schema for suppliers, supplier products, invoices, hotel products, locations, inventory balances, links, match review, conversions, and valuation snapshots.
- Workbook import from `Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx`.
- Deduplication of supplier products and duplicate invoice files.
- Search-ready data using SQLite FTS5.
- Review queues for ambiguous product matches and unsafe conversions.
- Automated tests for import, dedupe, search, and valuation safety.

Out of scope for this phase:

- Full Next.js or FastAPI application UI.
- PDF invoice parsing.
- Purchase ordering, POS integration, menu stock deduction, complex permissions, barcode scanning, and non-kitchen inventory.

## Architecture

The MVP uses a local SQLite database as the runtime store. Excel is treated only as an initial import source and audit reference, never as the live database.

The import layer is a small Python package. It reads workbook sheets, normalizes rows, writes into SQLite, and records questionable data in review tables rather than silently confirming it. Search is backed by SQLite FTS5 so supplier product autocomplete can later be exposed through an API without changing the data model.

## Data Model

Core tables:

- `suppliers`: one row per supplier, keyed by short supplier code such as `BRK`, `MM`, `CMP`.
- `locations`: freezer and storage location codes such as `A1`, `B0`, `D4`, `P1`.
- `hotel_products`: internal hotel-managed products with hidden database IDs and legacy Excel product IDs.
- `supplier_products`: unique supplier catalogue items, unique by `(supplier_id, supplier_product_code)`.
- `product_supplier_links`: confirmed links between hotel products and supplier products.
- `invoice_headers`: invoice-level metadata, including source file and extraction status.
- `invoice_lines`: invoice product rows, linked to supplier products when possible.
- `inventory_balances`: current counted stock, including raw stock text when not safely parsed.
- `inventory_transactions`: future transaction history for counts, goods-in, stock-out, waste, adjustment, and transfer.

Review and support tables:

- `unit_conversions`: explicit conversion factors with status and source notes.
- `match_review_queue`: proposed product matches that require review.
- `valuation_snapshots`: calculated or skipped valuation results at a point in time.
- `import_batches`: import run metadata.

## Import Rules

The importer reads the workbook sheets as follows:

- `Suppliers` imports directly into `suppliers`.
- `Locations` imports directly into `locations`.
- `Products` imports into `hotel_products`; stock text in notes is kept as raw inventory context.
- `Invoice_Summary`, `MM_Invoice_Summary`, and `CMP_Invoice_Summary` import into `invoice_headers`.
- `Invoice_Lines`, `MM_Invoice_Lines`, and `CMP_Invoice_Lines` import into `invoice_lines` and upsert `supplier_products`.
- `Brakes_Catalogue`, `MM_Catalogue`, and `CMP_Catalogue` update supplier product latest price, average price, latest purchase date, purchase count, pack size, and VAT rate.
- `Product_Matching` imports exact supplier-code matches as confirmed links only when supplier and code resolve cleanly. Other statuses go to `match_review_queue`.
- `Freezer_Valuation` imports to `valuation_snapshots`; it does not overwrite source-of-truth inventory balances.
- `Invoice_Pilot`, `Data_Audit`, `Import_Progress`, and `Freezer_Dashboard` are audit/reporting sheets and are not source-of-truth imports.

## Data Quality Policy

Duplicate invoice headers are allowed only when they represent distinct source files. A normalized invoice identity is still maintained so repeated source PDFs do not inflate supplier product price history.

Duplicate invoice lines are deduped by supplier, invoice number, supplier product code, description, quantity, unit price, line value, and source context. Duplicates from repeated Brakes PDFs are skipped for price rollups.

Ambiguous matches are never confirmed automatically. Low-confidence matches, equal-score second candidates, and missing supplier-code matches stay in `match_review_queue`.

Unsafe unit conversions are never guessed. If quantity cannot be converted to purchase units using a direct unit match or confirmed conversion factor, the valuation status is `needs_conversion_review` and the product is excluded from confirmed value totals.

## Search Design

Supplier product search will use SQLite FTS5 over:

- supplier name
- supplier product code
- supplier product name
- pack size
- invoice raw product descriptions

Ranking rules for the later API:

1. Exact supplier product code match.
2. Exact product name match.
3. Product name prefix match.
4. All keywords present.
5. FTS fuzzy relevance.
6. More recent purchase date.
7. Higher purchase count.

## Testing Strategy

Tests are written before production code.

Required test coverage:

- Schema can be created from scratch.
- Workbook import creates expected suppliers, locations, hotel products, supplier products, invoice headers, and invoice lines.
- Supplier products are unique by supplier and supplier product code.
- Duplicate invoice source rows do not inflate deduped invoice line counts.
- Exact supplier-code matches can create confirmed links.
- Ambiguous suggested matches are written to review queue.
- Search finds supplier products by code, name, supplier, pack size, and invoice description.
- Valuation refuses unsafe conversions and excludes them from confirmed totals.

## Acceptance Criteria

- A fresh SQLite database can be created reproducibly.
- The workbook imports without modifying the workbook.
- Counts and quality metrics are reported after import.
- Search data is populated and queryable.
- Review tables contain uncertain matches and conversions.
- Tests pass using the bundled Python runtime.

## Self Review

No placeholders remain. The design keeps the first implementation focused on the data foundation and does not attempt the full application UI. The import rules explicitly separate source-of-truth data from audit/generated workbook sheets, and the valuation policy matches the product specification requirement to avoid guessing conversions.
