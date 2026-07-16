from __future__ import annotations

import unittest
from pathlib import Path
from zipfile import ZipFile

from import_mark_murphy_invoices import parse_mark_murphy_pdf


ZIP_PATH = Path.home() / "Downloads" / "Mark+Murphy+2-6.zip"


class MarkMurphyInvoiceImportTest(unittest.TestCase):
    def test_parses_weight_column_invoice_lines(self) -> None:
        with ZipFile(ZIP_PATH) as archive:
            source_file = "Mark Murphy 2-6/5 Mark Murphy/5.18  151.55 Invoice 4291675.pdf"
            lines = parse_mark_murphy_pdf(source_file, archive.read(source_file))

        self.assertEqual(len(lines), 10)
        self.assertEqual(lines[0].invoice_number, "4291675")
        self.assertEqual(lines[0].supplier_product_code, "3997")
        self.assertEqual(lines[0].product_description, "ASPARAGUS LARGE x 250G")
        self.assertEqual(lines[0].quantity, 3)
        self.assertEqual(lines[0].unit_price, 3.35)
        self.assertEqual(lines[0].line_value, 10.05)
        self.assertTrue(any(line.supplier_product_code == "5530" for line in lines))

    def test_keeps_old_quantity_only_invoice_lines_working(self) -> None:
        with ZipFile(ZIP_PATH) as archive:
            source_file = "Mark Murphy 2-6/3 Mark  M/3.14 231.98 Invoice 3996081.pdf"
            lines = parse_mark_murphy_pdf(source_file, archive.read(source_file))

        self.assertEqual(len(lines), 10)
        milk = [line for line in lines if line.supplier_product_code == "5035"]
        self.assertEqual(len(milk), 1)
        self.assertEqual(milk[0].product_description, "MILK SEMI SKIMMED 2L")
        self.assertEqual(milk[0].quantity, 4)


if __name__ == "__main__":
    unittest.main()
