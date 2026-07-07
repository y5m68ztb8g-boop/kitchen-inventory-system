#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inventory_mvp.snapshot import build_supplier_search_snapshot


def main(argv: list[str]) -> int:
    if len(argv) not in {2, 3}:
        print("Usage: export_supplier_search.py <database.sqlite> [output.json]", file=sys.stderr)
        return 2

    database_path = Path(argv[1])
    output_path = Path(argv[2]) if len(argv) == 3 else ROOT / "data" / "supplier_search.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(database_path)
    conn.row_factory = sqlite3.Row
    payload = build_supplier_search_snapshot(conn)
    conn.close()

    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    data_script_path = output_path.with_name("supplier_search_data.js")
    data_script_path.write_text(
        "window.___GROW_NATURALLY_SUPPLIER_SEARCH_DATA___ = "
        + json.dumps(payload, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {output_path}")
    print(f"wrote {data_script_path}")
    print(f"suppliers: {len(payload['suppliers'])}")
    print(f"supplier_products: {len(payload['supplier_products'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
