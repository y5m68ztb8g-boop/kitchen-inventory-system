from __future__ import annotations

import sqlite3

from inventory_mvp.search import get_supplier_product_details, search_supplier_products


def build_search_payload(
    conn: sqlite3.Connection,
    query: str,
    supplier_code: str | None = None,
    limit: int = 20,
) -> dict:
    results = search_supplier_products(conn, query, supplier_code=supplier_code, limit=limit)
    return {
        "query": query,
        "supplier_code": supplier_code,
        "count": len(results),
        "results": [normalize_product_summary(row) | {"detail_url": f"/api/supplier-products/{row['supplier_product_id']}"} for row in results],
    }


def build_supplier_product_payload(conn: sqlite3.Connection, supplier_product_id: int) -> dict | None:
    details = get_supplier_product_details(conn, supplier_product_id)
    if details is None:
        return None
    return normalize_product_detail(details)


def normalize_product_summary(row: dict) -> dict:
    return {
        "supplier_product_id": row["supplier_product_id"],
        "supplier_code": row["supplier_code"],
        "supplier_name": row["supplier_name"],
        "supplier_product_code": row["supplier_product_code"],
        "supplier_product_name": row["supplier_product_name"],
        "pack_size": row["pack_size"],
        "latest_price": row["latest_price"],
        "average_price": row["average_price"],
        "latest_purchase_date": row["latest_purchase_date"],
        "purchase_count": row["purchase_count"],
    }


def normalize_product_detail(details: dict) -> dict:
    payload = normalize_product_summary(details)
    payload["purchase_unit"] = details.get("purchase_unit")
    payload["vat_rate"] = details.get("vat_rate")
    payload["invoice_history"] = details.get("invoice_history", [])
    return payload
