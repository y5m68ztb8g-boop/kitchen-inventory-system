import sqlite3
import unittest

from inventory_mvp.schema import create_schema


class SchemaTests(unittest.TestCase):
    def test_schema_creates_core_tables_and_enables_foreign_keys(self):
        conn = sqlite3.connect(":memory:")

        create_schema(conn)

        foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        self.assertEqual(foreign_keys, 1)

        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
            )
        }
        expected = {
            "suppliers",
            "locations",
            "hotel_products",
            "supplier_products",
            "product_supplier_links",
            "invoice_headers",
            "invoice_lines",
            "inventory_balances",
            "inventory_transactions",
            "unit_conversions",
            "match_review_queue",
            "valuation_snapshots",
            "import_batches",
            "supplier_product_search",
        }
        self.assertTrue(expected.issubset(tables))

    def test_supplier_product_code_is_unique_per_supplier(self):
        conn = sqlite3.connect(":memory:")
        create_schema(conn)

        conn.execute(
            "INSERT INTO suppliers (supplier_code, supplier_name) VALUES (?, ?)",
            ("BRK", "Brakes"),
        )
        supplier_id = conn.execute("SELECT id FROM suppliers").fetchone()[0]
        conn.execute(
            """
            INSERT INTO supplier_products
                (supplier_id, supplier_product_code, supplier_product_name)
            VALUES (?, ?, ?)
            """,
            (supplier_id, "F41554", "Chocolate Fudge Cake"),
        )

        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO supplier_products
                    (supplier_id, supplier_product_code, supplier_product_name)
                VALUES (?, ?, ?)
                """,
                (supplier_id, "F41554", "Chocolate Fudge Cake Duplicate"),
            )


if __name__ == "__main__":
    unittest.main()
