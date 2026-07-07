from __future__ import annotations

import sqlite3


def search_supplier_products(
    conn: sqlite3.Connection,
    query: str,
    supplier_code: str | None = None,
    limit: int = 20,
) -> list[dict]:
    normalized = query.strip()
    if not normalized:
        return list_recent_supplier_products(conn, supplier_code=supplier_code, limit=limit)

    supplier_clause = ""
    params: list = [normalized]
    if supplier_code:
        supplier_clause = " AND lower(s.supplier_code) = lower(?)"
        params.append(supplier_code)

    exact_code_rows = _query_rows(
        conn,
        f"""
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
        WHERE lower(sp.supplier_product_code) = lower(?){supplier_clause}
        """,
        tuple(params),
    )

    fts_query = " ".join(f"{token}*" for token in normalized.split())
    fts_params: list = [fts_query]
    supplier_join_clause = ""
    supplier_where_clause = ""
    if supplier_code:
        supplier_where_clause = " AND lower(s.supplier_code) = lower(?)"
        fts_params.append(supplier_code)
    fts_rows = _query_rows(
        conn,
        f"""
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
        WHERE supplier_product_search MATCH ?{supplier_where_clause}
        ORDER BY rank_group, sp.latest_purchase_date DESC, sp.purchase_count DESC
        LIMIT ?
        """,
        tuple(fts_params + [limit]),
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


def list_recent_supplier_products(
    conn: sqlite3.Connection,
    supplier_code: str | None = None,
    limit: int = 20,
) -> list[dict]:
    params: list = []
    supplier_clause = ""
    if supplier_code:
        supplier_clause = "WHERE lower(s.supplier_code) = lower(?)"
        params.append(supplier_code)

    rows = _query_rows(
        conn,
        f"""
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
        FROM supplier_products sp
        JOIN suppliers s ON s.id = sp.supplier_id
        {supplier_clause}
        ORDER BY sp.latest_purchase_date DESC, sp.purchase_count DESC, sp.supplier_product_name ASC
        LIMIT ?
        """,
        tuple(params + [limit]),
    )
    return rows


def get_supplier_product_details(
    conn: sqlite3.Connection,
    supplier_product_id: int,
) -> dict | None:
    product = conn.execute(
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
            sp.purchase_count
        FROM supplier_products sp
        JOIN suppliers s ON s.id = sp.supplier_id
        WHERE sp.id = ?
        """,
        (supplier_product_id,),
    ).fetchone()
    if product is None:
        return None

    history_rows = _query_rows(
        conn,
        """
        SELECT
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
        WHERE il.supplier_product_id = ?
        ORDER BY ih.invoice_date DESC, ih.invoice_number DESC, il.id DESC
        """,
        (supplier_product_id,),
    )

    result = dict(product)
    result["invoice_history"] = history_rows
    return result


def _query_rows(
    conn: sqlite3.Connection,
    sql: str,
    params: tuple,
) -> list[dict]:
    cursor = conn.execute(sql, params)
    return [dict(row) for row in cursor.fetchall()]
