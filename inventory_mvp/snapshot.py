from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import sqlite3


def build_supplier_search_snapshot(conn: sqlite3.Connection) -> dict:
    suppliers = _query_rows(
        conn,
        """
        SELECT supplier_code, supplier_name, active
        FROM suppliers
        ORDER BY supplier_name ASC, supplier_code ASC
        """,
        (),
    )
    products = _query_rows(
        conn,
        """
        SELECT
            sp.id AS supplier_product_id,
            s.supplier_code,
            s.supplier_name,
            sp.supplier_product_code,
            sp.supplier_product_name,
            sp.pack_size,
            sp.purchase_unit,
            sp.latest_price,
            sp.average_price,
            sp.vat_rate,
            sp.latest_purchase_date,
            sp.purchase_count,
            sp.active
        FROM supplier_products sp
        JOIN suppliers s ON s.id = sp.supplier_id
        ORDER BY sp.latest_purchase_date DESC, sp.purchase_count DESC, sp.supplier_product_name ASC
        """,
        (),
    )
    history_rows = _query_rows(
        conn,
        """
        SELECT
            il.supplier_product_id,
            ih.invoice_date,
            ih.invoice_number,
            ih.document_type,
            ih.source_file,
            il.quantity,
            il.unit_price,
            il.line_value,
            il.raw_pack_size,
            il.raw_product_description
        FROM invoice_lines il
        JOIN invoice_headers ih ON ih.id = il.invoice_header_id
        WHERE il.supplier_product_id IS NOT NULL
        ORDER BY il.supplier_product_id ASC, ih.invoice_date DESC, ih.invoice_number DESC, il.id DESC
        """,
        (),
    )

    history_map: dict[int, list[dict]] = defaultdict(list)
    for row in history_rows:
        supplier_product_id = row.pop("supplier_product_id")
        history_map[supplier_product_id].append(row)

    supplier_lookup = {row["supplier_code"]: row for row in suppliers}
    payload_products = []
    for row in products:
        history = history_map.get(row["supplier_product_id"], [])
        blob_parts = [
            row["supplier_code"],
            row["supplier_name"],
            row["supplier_product_code"],
            row["supplier_product_name"],
            row["pack_size"],
            row["purchase_unit"],
        ]
        for item in history:
            blob_parts.append(item.get("raw_product_description"))
            blob_parts.append(item.get("raw_pack_size"))
            blob_parts.append(item.get("invoice_number"))
        search_text = " ".join(part for part in blob_parts if part)
        payload_row = dict(row)
        payload_row["invoice_history"] = history
        payload_row["search_text"] = search_text.lower()
        payload_products.append(payload_row)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "suppliers": list(supplier_lookup.values()),
        "supplier_products": payload_products,
    }


def _query_rows(conn: sqlite3.Connection, sql: str, params: tuple) -> list[dict]:
    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]
