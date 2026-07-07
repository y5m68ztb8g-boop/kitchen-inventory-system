import sqlite3
import unittest
from pathlib import Path

from inventory_mvp.api import build_search_payload, build_supplier_product_payload
from inventory_mvp.importer import import_workbook
from inventory_mvp.schema import create_schema


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx"


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = sqlite3.connect(":memory:")
        cls.conn.row_factory = sqlite3.Row
        create_schema(cls.conn)
        import_workbook(cls.conn, WORKBOOK)

    def test_search_payload_contains_ranked_results(self):
        payload = build_search_payload(self.conn, "fudge cake")

        self.assertEqual(payload["query"], "fudge cake")
        self.assertGreaterEqual(payload["count"], 1)
        self.assertIn("results", payload)
        self.assertIn("supplier_product_code", payload["results"][0])

    def test_supplier_product_payload_contains_invoice_history(self):
        row = self.conn.execute(
            """
            SELECT sp.id
            FROM supplier_products sp
            JOIN suppliers s ON s.id = sp.supplier_id
            WHERE s.supplier_code = 'BRK' AND sp.supplier_product_code = '134553'
            """
        ).fetchone()

        payload = build_supplier_product_payload(self.conn, row["id"])

        self.assertEqual(payload["supplier_product_code"], "134553")
        self.assertGreaterEqual(len(payload["invoice_history"]), 1)
        self.assertIn("latest_price", payload)


if __name__ == "__main__":
    unittest.main()
