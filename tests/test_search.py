import sqlite3
import unittest
from pathlib import Path

from inventory_mvp.importer import import_workbook
from inventory_mvp.schema import create_schema
from inventory_mvp.search import search_supplier_products


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx"


class SearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.conn = sqlite3.connect(":memory:")
        cls.conn.row_factory = sqlite3.Row
        create_schema(cls.conn)
        import_workbook(cls.conn, WORKBOOK)

    def test_exact_supplier_product_code_search_ranks_first(self):
        results = search_supplier_products(self.conn, "134553")

        self.assertGreaterEqual(len(results), 1)
        self.assertEqual(results[0]["supplier_code"], "BRK")
        self.assertEqual(results[0]["supplier_product_code"], "134553")
        self.assertEqual(results[0]["supplier_product_name"], "Gluten Free Turkey Roulade")

    def test_keyword_search_finds_invoice_product_description(self):
        results = search_supplier_products(self.conn, "chicken fillet")

        codes = {row["supplier_product_code"] for row in results}
        self.assertIn("22CFIL4", codes)
        self.assertIn("22CFIL5K", codes)


if __name__ == "__main__":
    unittest.main()
