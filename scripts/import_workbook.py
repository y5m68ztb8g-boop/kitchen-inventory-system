#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inventory_mvp.importer import import_workbook
from inventory_mvp.schema import connect_database


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: import_workbook.py <workbook.xlsx> <database.sqlite>", file=sys.stderr)
        return 2

    workbook_path = Path(argv[1])
    database_path = Path(argv[2])
    database_path.parent.mkdir(parents=True, exist_ok=True)

    conn = connect_database(database_path)
    summary = import_workbook(conn, workbook_path)
    conn.close()

    print(f"suppliers: {summary.suppliers}")
    print(f"locations: {summary.locations}")
    print(f"hotel_products: {summary.hotel_products}")
    print(f"supplier_products: {summary.supplier_products}")
    print(f"invoice_headers: {summary.invoice_headers}")
    print(f"invoice_lines_imported: {summary.invoice_lines_imported}")
    print(f"invoice_lines_skipped_duplicates: {summary.invoice_lines_skipped_duplicates}")
    print(f"confirmed_links: {summary.confirmed_links}")
    print(f"match_review_queue: {summary.review_queue}")
    print(f"valuation_snapshots: {summary.valuation_snapshots}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
