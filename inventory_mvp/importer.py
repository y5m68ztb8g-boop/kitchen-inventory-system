from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
import sqlite3
from typing import Any

import openpyxl


@dataclass(frozen=True)
class ImportSummary:
    suppliers: int
    locations: int
    hotel_products: int
    supplier_products: int
    invoice_headers: int
    invoice_lines_imported: int
    invoice_lines_skipped_duplicates: int
    confirmed_links: int
    review_queue: int
    valuation_snapshots: int


def import_workbook(conn: sqlite3.Connection, workbook_path: str | Path) -> ImportSummary:
    workbook_path = Path(workbook_path)
    wb = openpyxl.load_workbook(workbook_path, data_only=True)
    conn.execute(
        "INSERT INTO import_batches (source_workbook, status) VALUES (?, ?)",
        (str(workbook_path), "started"),
    )

    supplier_ids = _import_suppliers(conn, _rows(wb, "Suppliers"))
    location_ids = _import_locations(conn, _rows(wb, "Locations"))
    hotel_product_ids = _import_hotel_products(conn, _rows(wb, "Products"), location_ids)
    supplier_product_ids: dict[tuple[str, str], int] = {}

    invoice_header_ids = _import_invoice_headers(conn, wb, supplier_ids)
    imported_lines, skipped_duplicates = _import_invoice_lines(
        conn, wb, supplier_ids, supplier_product_ids, invoice_header_ids, hotel_product_ids
    )
    _import_catalogues(conn, wb, supplier_ids, supplier_product_ids)
    _rebuild_search_index(conn)
    confirmed_links, review_count = _import_matching(
        conn, _rows(wb, "Product_Matching"), hotel_product_ids, supplier_product_ids
    )
    valuation_count = _import_valuations(
        conn, _rows(wb, "Freezer_Valuation"), hotel_product_ids, location_ids, supplier_product_ids
    )

    conn.execute(
        """
        UPDATE import_batches
        SET status = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT MAX(id) FROM import_batches)
        """,
        ("completed",),
    )
    conn.commit()

    return ImportSummary(
        suppliers=_count(conn, "suppliers"),
        locations=_count(conn, "locations"),
        hotel_products=_count(conn, "hotel_products"),
        supplier_products=_count(conn, "supplier_products"),
        invoice_headers=_count(conn, "invoice_headers"),
        invoice_lines_imported=imported_lines,
        invoice_lines_skipped_duplicates=skipped_duplicates,
        confirmed_links=confirmed_links,
        review_queue=review_count,
        valuation_snapshots=valuation_count,
    )


def _rows(wb: openpyxl.Workbook, sheet_name: str) -> list[dict[str, Any]]:
    ws = wb[sheet_name]
    values = list(ws.iter_rows(values_only=True))
    headers = [str(value).strip() if value is not None else "" for value in values[0]]
    rows = []
    for raw in values[1:]:
        if any(value is not None for value in raw):
            rows.append(dict(zip(headers, raw)))
    return rows


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _date_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def _active_flag(status: Any) -> int:
    return 0 if str(status or "").strip().lower() in {"inactive", "disabled"} else 1


def _count(conn: sqlite3.Connection, table: str) -> int:
    return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def _import_suppliers(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> dict[str, int]:
    ids = {}
    for row in rows:
        code = _clean_text(row.get("Supplier Code"))
        name = _clean_text(row.get("Supplier Name"))
        if not code or not name:
            continue
        conn.execute(
            """
            INSERT INTO suppliers
                (supplier_code, supplier_name, primary_use, active, notes)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(supplier_code) DO UPDATE SET
                supplier_name = excluded.supplier_name,
                primary_use = excluded.primary_use,
                active = excluded.active,
                notes = excluded.notes
            """,
            (
                code,
                name,
                _clean_text(row.get("Primary Use")),
                _active_flag(row.get("Status")),
                _clean_text(row.get("Notes")),
            ),
        )
        ids[code] = conn.execute(
            "SELECT id FROM suppliers WHERE supplier_code = ?", (code,)
        ).fetchone()[0]
    return ids


def _import_locations(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> dict[str, int]:
    ids = {}
    for row in rows:
        code = _clean_text(row.get("LocationCode"))
        if not code:
            continue
        conn.execute(
            """
            INSERT INTO locations
                (display_code, warehouse, location_type, description, notes)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(display_code) DO UPDATE SET
                warehouse = excluded.warehouse,
                location_type = excluded.location_type,
                description = excluded.description,
                notes = excluded.notes
            """,
            (
                code,
                _clean_text(row.get("Warehouse")),
                _clean_text(row.get("Type")),
                _clean_text(row.get("Description")),
                _clean_text(row.get("Notes")),
            ),
        )
        ids[code] = conn.execute(
            "SELECT id FROM locations WHERE display_code = ?", (code,)
        ).fetchone()[0]
    return ids


def _import_hotel_products(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    location_ids: dict[str, int],
) -> dict[str, int]:
    ids = {}
    for row in rows:
        legacy_id = _clean_text(row.get("Internal Product ID"))
        name = _clean_text(row.get("Product Name"))
        if not legacy_id or not name:
            continue
        location_code = _clean_text(row.get("Default Location"))
        conn.execute(
            """
            INSERT INTO hotel_products
                (legacy_product_id, display_name, category, item_type,
                 default_location_id, purchase_unit, usage_unit, minimum_stock, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(legacy_product_id) DO UPDATE SET
                display_name = excluded.display_name,
                category = excluded.category,
                item_type = excluded.item_type,
                default_location_id = excluded.default_location_id,
                purchase_unit = excluded.purchase_unit,
                usage_unit = excluded.usage_unit,
                minimum_stock = excluded.minimum_stock,
                notes = excluded.notes,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                legacy_id,
                name,
                _clean_text(row.get("Category")),
                _clean_text(row.get("Item Type")),
                location_ids.get(location_code),
                _clean_text(row.get("Purchase Unit")),
                _clean_text(row.get("Usage Unit")),
                row.get("Minimum Stock"),
                _clean_text(row.get("Notes")),
            ),
        )
        product_id = conn.execute(
            "SELECT id FROM hotel_products WHERE legacy_product_id = ?", (legacy_id,)
        ).fetchone()[0]
        ids[legacy_id] = product_id
        if row.get("Pack Size"):
            conn.execute(
                """
                INSERT INTO unit_conversions
                    (hotel_product_id, from_unit, to_unit, status, source_note)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    product_id,
                    _clean_text(row.get("Purchase Unit")),
                    _clean_text(row.get("Usage Unit")),
                    "unreviewed",
                    _clean_text(row.get("Pack Size")),
                ),
            )
    return ids


def _import_invoice_headers(
    conn: sqlite3.Connection,
    wb: openpyxl.Workbook,
    supplier_ids: dict[str, int],
) -> dict[tuple[str, str | None, str | None], int]:
    sheet_suppliers = {
        "Invoice_Summary": "BRK",
        "MM_Invoice_Summary": "MM",
        "CMP_Invoice_Summary": "CMP",
    }
    ids = {}
    for sheet, supplier_code in sheet_suppliers.items():
        supplier_id = supplier_ids[supplier_code]
        for row in _rows(wb, sheet):
            invoice_number = _clean_text(row.get("Invoice Number"))
            source_file = _clean_text(row.get("Source File"))
            conn.execute(
                """
                INSERT OR IGNORE INTO invoice_headers
                    (supplier_id, invoice_number, invoice_date, document_type,
                     invoice_total, source_file, extraction_status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    supplier_id,
                    invoice_number,
                    _date_text(row.get("Invoice Date")),
                    _clean_text(row.get("Document Type")),
                    row.get("Invoice Total (£)"),
                    source_file,
                    _clean_text(row.get("Extraction Status")),
                ),
            )
            header_id = conn.execute(
                """
                SELECT id FROM invoice_headers
                WHERE supplier_id = ?
                  AND (invoice_number IS ? OR invoice_number = ?)
                  AND (source_file IS ? OR source_file = ?)
                ORDER BY id DESC
                LIMIT 1
                """,
                (supplier_id, invoice_number, invoice_number, source_file, source_file),
            ).fetchone()[0]
            ids[(supplier_code, invoice_number, source_file)] = header_id
    return ids


def _upsert_supplier_product(
    conn: sqlite3.Connection,
    supplier_ids: dict[str, int],
    cache: dict[tuple[str, str], int],
    supplier_code: str | None,
    product_code: str | None,
    name: str | None = None,
    pack_size: str | None = None,
) -> int | None:
    if not supplier_code or not product_code or supplier_code not in supplier_ids:
        return None
    key = (supplier_code, product_code)
    supplier_id = supplier_ids[supplier_code]
    conn.execute(
        """
        INSERT INTO supplier_products
            (supplier_id, supplier_product_code, supplier_product_name, pack_size)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(supplier_id, supplier_product_code) DO UPDATE SET
            supplier_product_name = COALESCE(excluded.supplier_product_name, supplier_products.supplier_product_name),
            pack_size = COALESCE(excluded.pack_size, supplier_products.pack_size)
        """,
        (supplier_id, product_code, name, pack_size),
    )
    product_id = conn.execute(
        """
        SELECT id FROM supplier_products
        WHERE supplier_id = ? AND supplier_product_code = ?
        """,
        (supplier_id, product_code),
    ).fetchone()[0]
    cache[key] = product_id
    return product_id


def _import_invoice_lines(
    conn: sqlite3.Connection,
    wb: openpyxl.Workbook,
    supplier_ids: dict[str, int],
    supplier_product_ids: dict[tuple[str, str], int],
    invoice_header_ids: dict[tuple[str, str | None, str | None], int],
    hotel_product_ids: dict[str, int],
) -> tuple[int, int]:
    sheet_names = ["Invoice_Lines", "MM_Invoice_Lines", "CMP_Invoice_Lines"]
    seen = set()
    imported = 0
    skipped = 0
    for sheet in sheet_names:
        for row in _rows(wb, sheet):
            supplier_code = _clean_text(row.get("Supplier Code"))
            invoice_number = _clean_text(row.get("Invoice Number"))
            product_code = _clean_text(row.get("Supplier Product Code"))
            description = _clean_text(row.get("Product Description"))
            pack_size = _clean_text(row.get("Pack Size"))
            source_file = _clean_text(row.get("Source File"))
            dedupe_key = (
                supplier_code,
                invoice_number,
                product_code,
                description,
                row.get("Quantity"),
                row.get("Unit Price (£)"),
                row.get("Line Value (£)"),
            )
            if dedupe_key in seen:
                skipped += 1
                continue
            seen.add(dedupe_key)

            supplier_product_id = _upsert_supplier_product(
                conn, supplier_ids, supplier_product_ids, supplier_code, product_code, description, pack_size
            )
            header_id = invoice_header_ids.get((supplier_code, invoice_number, source_file))
            matched_legacy_id = _clean_text(row.get("Matched Internal Product ID"))
            conn.execute(
                """
                INSERT INTO invoice_lines
                    (invoice_header_id, supplier_product_id, raw_supplier_product_code,
                     raw_product_description, raw_pack_size, quantity, unit_price,
                     vat_rate, line_value, matched_hotel_product_id, source_file)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    header_id,
                    supplier_product_id,
                    product_code,
                    description,
                    pack_size,
                    row.get("Quantity"),
                    row.get("Unit Price (£)"),
                    row.get("VAT Rate"),
                    row.get("Line Value (£)"),
                    hotel_product_ids.get(matched_legacy_id),
                    source_file,
                ),
            )
            imported += 1
    return imported, skipped


def _import_catalogues(
    conn: sqlite3.Connection,
    wb: openpyxl.Workbook,
    supplier_ids: dict[str, int],
    supplier_product_ids: dict[tuple[str, str], int],
) -> None:
    for sheet in ["Brakes_Catalogue", "MM_Catalogue", "CMP_Catalogue"]:
        for row in _rows(wb, sheet):
            supplier_code = _clean_text(row.get("Supplier Code"))
            product_code = _clean_text(row.get("Supplier Product Code"))
            supplier_product_id = _upsert_supplier_product(
                conn,
                supplier_ids,
                supplier_product_ids,
                supplier_code,
                product_code,
                _clean_text(row.get("Latest Product Description")),
                _clean_text(row.get("Latest Pack Size")),
            )
            if supplier_product_id is None:
                continue
            conn.execute(
                """
                UPDATE supplier_products
                SET supplier_product_name = ?,
                    pack_size = ?,
                    latest_price = ?,
                    average_price = ?,
                    latest_purchase_date = ?,
                    purchase_count = ?,
                    vat_rate = ?
                WHERE id = ?
                """,
                (
                    _clean_text(row.get("Latest Product Description")),
                    _clean_text(row.get("Latest Pack Size")),
                    row.get("Latest Unit Price (£)"),
                    row.get("Average Unit Price (£)"),
                    _date_text(row.get("Latest Purchase Date")),
                    row.get("Purchase Line Count") or 0,
                    row.get("VAT Rate"),
                    supplier_product_id,
                ),
            )


def _import_matching(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    hotel_product_ids: dict[str, int],
    supplier_product_ids: dict[tuple[str, str], int],
) -> tuple[int, int]:
    confirmed = 0
    review = 0
    for row in rows:
        legacy_id = _clean_text(row.get("Internal Product ID"))
        hotel_product_id = hotel_product_ids.get(legacy_id)
        if hotel_product_id is None:
            continue
        supplier_code = _clean_text(row.get("Matched Supplier"))
        product_code = _clean_text(row.get("Matched Supplier Product Code"))
        supplier_product_id = supplier_product_ids.get((supplier_code, product_code))
        match_status = _clean_text(row.get("Match Status"))
        confidence = row.get("Confidence %")

        if match_status == "Exact supplier-code match" and supplier_product_id is not None:
            conn.execute(
                """
                INSERT OR IGNORE INTO product_supplier_links
                    (hotel_product_id, supplier_product_id, preferred, match_status, match_confidence)
                VALUES (?, ?, ?, ?, ?)
                """,
                (hotel_product_id, supplier_product_id, 1, match_status, confidence),
            )
            confirmed += conn.total_changes > 0
        else:
            conn.execute(
                """
                INSERT INTO match_review_queue
                    (hotel_product_id, proposed_supplier_product_id, proposed_supplier_code,
                     proposed_supplier_product_code, proposed_description, second_best_text,
                     confidence, match_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    hotel_product_id,
                    supplier_product_id,
                    supplier_code,
                    product_code,
                    _clean_text(row.get("Supplier Product Description")),
                    _clean_text(row.get("Second-best Candidate")),
                    confidence,
                    match_status,
                ),
            )
            review += 1
    confirmed = _count(conn, "product_supplier_links")
    return confirmed, review


def _import_valuations(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    hotel_product_ids: dict[str, int],
    location_ids: dict[str, int],
    supplier_product_ids: dict[tuple[str, str], int],
) -> int:
    count = 0
    for row in rows:
        legacy_id = _clean_text(row.get("Internal Product ID"))
        supplier_code = _clean_text(row.get("Supplier"))
        product_code = _clean_text(row.get("Supplier Product Code"))
        conversion_status = _clean_text(row.get("Quantity Conversion Status"))
        if conversion_status == "Not safely convertible":
            valuation_status = "needs_conversion_review"
        elif conversion_status == "Direct quantity":
            valuation_status = "confirmed"
        else:
            valuation_status = "estimated"
        conn.execute(
            """
            INSERT INTO valuation_snapshots
                (hotel_product_id, location_id, supplier_product_id, raw_stock_text,
                 qty_purchase_units, price_used, price_source, estimated_value,
                 valuation_status, conversion_status, match_basis)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hotel_product_ids.get(legacy_id),
                location_ids.get(_clean_text(row.get("Location"))),
                supplier_product_ids.get((supplier_code, product_code)),
                _clean_text(row.get("Current Stock Text")),
                row.get("Qty in Purchase Units"),
                row.get("Latest Unit Price (£)"),
                "latest_price" if row.get("Latest Unit Price (£)") is not None else None,
                row.get("Estimated Stock Value (£)"),
                valuation_status,
                conversion_status,
                _clean_text(row.get("Match Basis")),
            ),
        )
        count += 1
    return count


def _rebuild_search_index(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM supplier_product_search")
    rows = conn.execute(
        """
        SELECT
            sp.id,
            s.supplier_code,
            s.supplier_name,
            sp.supplier_product_code,
            sp.supplier_product_name,
            sp.pack_size,
            COALESCE(GROUP_CONCAT(DISTINCT il.raw_product_description), '') AS invoice_descriptions
        FROM supplier_products sp
        JOIN suppliers s ON s.id = sp.supplier_id
        LEFT JOIN invoice_lines il ON il.supplier_product_id = sp.id
        GROUP BY sp.id
        """
    ).fetchall()
    conn.executemany(
        """
        INSERT INTO supplier_product_search
            (supplier_product_id, supplier_code, supplier_name, supplier_product_code,
             supplier_product_name, pack_size, invoice_descriptions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [tuple(row) for row in rows],
    )
