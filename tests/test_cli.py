import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
WORKBOOK = ROOT / "Grow_Naturally_Kitchen_Inventory_v10_Matching_and_Valuation.xlsx"


class CliTests(unittest.TestCase):
    def test_import_and_inspect_scripts_create_readable_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "grow_naturally.sqlite"

            import_result = subprocess.run(
                [PYTHON, str(ROOT / "scripts" / "import_workbook.py"), str(WORKBOOK), str(db_path)],
                check=False,
                text=True,
                capture_output=True,
            )
            self.assertEqual(import_result.returncode, 0, import_result.stderr)
            self.assertTrue(db_path.exists())

            conn = sqlite3.connect(db_path)
            self.assertEqual(
                conn.execute("SELECT COUNT(*) FROM supplier_products").fetchone()[0],
                357,
            )

            inspect_result = subprocess.run(
                [PYTHON, str(ROOT / "scripts" / "inspect_database.py"), str(db_path)],
                check=False,
                text=True,
                capture_output=True,
            )
            self.assertEqual(inspect_result.returncode, 0, inspect_result.stderr)
            self.assertIn("supplier_products: 357", inspect_result.stdout)
            self.assertIn("match_review_queue: 87", inspect_result.stdout)


if __name__ == "__main__":
    unittest.main()
