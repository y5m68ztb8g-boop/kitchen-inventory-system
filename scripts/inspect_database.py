#!/usr/bin/env python3
from pathlib import Path
import sqlite3
import sys


TABLES = [
    "suppliers",
    "locations",
    "hotel_products",
    "supplier_products",
    "invoice_headers",
    "invoice_lines",
    "product_supplier_links",
    "match_review_queue",
    "valuation_snapshots",
]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: inspect_database.py <database.sqlite>", file=sys.stderr)
        return 2

    database_path = Path(argv[1])
    conn = sqlite3.connect(database_path)

    for table in TABLES:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table}: {count}")

    unsafe = conn.execute(
        """
        SELECT COUNT(*)
        FROM valuation_snapshots
        WHERE valuation_status = 'needs_conversion_review'
        """
    ).fetchone()[0]
    print(f"needs_conversion_review: {unsafe}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
