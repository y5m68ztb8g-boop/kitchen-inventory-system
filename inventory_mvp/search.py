from __future__ import annotations

import sqlite3


def search_supplier_products(
    conn: sqlite3.Connection,
    query: str,
    limit: int = 20,
) -> list[dict]:
    normalized = query.strip()
    if not normalized:
        return []

    exact_code_rows = _query_rows(
        conn,
        """
        SELECT
            sp.id AS supplier_product_id,
            s.supplier_code,
            s.supplier_name,
            sp.supplier_product_code,
            sp.supplier_product_name,
            sp.pack_size,
            sp.latest_price,
            sp.average_price,
            sp.latest_purchase_date,
            sp.purchase_count,
            0 AS rank_group
        FROM supplier_products sp
        JOIN suppliers s ON s.id = sp.supplier_id
        WHERE lower(sp.supplier_product_code) = lower(?)
        """,
        (normalized,),
    )

    fts_query = " ".join(f"{token}*" for token in normalized.split())
    fts_rows = _query_rows(
        conn,
        """
        SELECT
            sp.id AS supplier_product_id,
            s.supplier_code,
            s.supplier_name,
            sp.supplier_product_code,
            sp.supplier_product_name,
            sp.pack_size,
            sp.latest_price,
            sp.average_price,
            sp.latest_purchase_date,
            sp.purchase_count,
            1 AS rank_group
        FROM supplier_product_search fts
        JOIN supplier_products sp ON sp.id = fts.supplier_product_id
        JOIN suppliers s ON s.id = sp.supplier_id
        WHERE supplier_product_search MATCH ?
        ORDER BY rank_group, sp.latest_purchase_date DESC, sp.purchase_count DESC
        LIMIT ?
        """,
        (fts_query, limit),
    )

    seen = set()
    results = []
    for row in exact_code_rows + fts_rows:
        key = row["supplier_product_id"]
        if key in seen:
            continue
        seen.add(key)
        results.append(row)
        if len(results) >= limit:
            break
    return results


def _query_rows(
    conn: sqlite3.Connection,
    sql: str,
    params: tuple,
) -> list[dict]:
    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]
