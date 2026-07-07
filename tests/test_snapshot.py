import sqlite3
import unittest
from pathlib import Path

from inventory_mvp.importer import import_workbook
from inventory_mvp.schema import create_schema
from inventory_mvp.snapshot import build_supplier_search_snapshot


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx"


class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = sqlite3.connect(":memory:")
        cls.conn.row_factory = sqlite3.Row
        create_schema(cls.conn)
        import_workbook(cls.conn, WORKBOOK)

    def test_snapshot_contains_products_and_history(self):
        payload = build_supplier_search_snapshot(self.conn)

        self.assertGreaterEqual(len(payload["suppliers"]), 1)
        self.assertGreaterEqual(len(payload["supplier_products"]), 1)
        product = next(
            row for row in payload["supplier_products"] if row["supplier_product_code"] == "134553"
        )
        self.assertGreaterEqual(len(product["invoice_history"]), 1)
        self.assertIn("turkey roulade", product["search_text"])


if __name__ == "__main__":
    unittest.main()
