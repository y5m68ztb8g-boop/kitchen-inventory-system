import sqlite3
import unittest
from pathlib import Path

from inventory_mvp.importer import import_workbook
from inventory_mvp.schema import create_schema


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx"


class ImporterTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        create_schema(self.conn)

    def test_imports_core_workbook_counts(self):
        summary = import_workbook(self.conn, WORKBOOK)

        self.assertEqual(summary.suppliers, 3)
        self.assertEqual(summary.locations, 23)
        self.assertEqual(summary.hotel_products, 89)
        self.assertEqual(summary.supplier_products, 357)
        self.assertEqual(summary.invoice_headers, 229)
        self.assertEqual(summary.invoice_lines_imported, 1242)
        self.assertEqual(summary.invoice_lines_skipped_duplicates, 32)

    def test_imports_only_exact_supplier_code_matches_as_confirmed_links(self):
        summary = import_workbook(self.conn, WORKBOOK)

        self.assertEqual(summary.confirmed_links, 2)
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM product_supplier_links").fetchone()[0],
            2,
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM match_review_queue").fetchone()[0],
            87,
        )

    def test_preserves_unsafe_valuation_rows_for_review(self):
        import_workbook(self.conn, WORKBOOK)

        needs_review = self.conn.execute(
            """
            SELECT COUNT(*)
            FROM valuation_snapshots
            WHERE valuation_status = 'needs_conversion_review'
            """
        ).fetchone()[0]
        confirmed = self.conn.execute(
            """
            SELECT COUNT(*)
            FROM valuation_snapshots
            WHERE valuation_status IN ('confirmed', 'estimated')
            """
        ).fetchone()[0]

        self.assertEqual(needs_review, 6)
        self.assertEqual(confirmed, 9)


if __name__ == "__main__":
    unittest.main()
