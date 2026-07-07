import unittest

from inventory_mvp.valuation import calculate_inventory_value


class ValuationTests(unittest.TestCase):
    def test_uses_latest_price_when_available(self):
        result = calculate_inventory_value(3, latest_price=10.0, average_price=8.0)

        self.assertEqual(result["valuation_status"], "confirmed")
        self.assertEqual(result["price_source"], "latest_price")
        self.assertEqual(result["estimated_value"], 30.0)

    def test_uses_average_price_when_latest_missing(self):
        result = calculate_inventory_value(2, latest_price=None, average_price=7.5)

        self.assertEqual(result["valuation_status"], "estimated")
        self.assertEqual(result["price_source"], "average_price")
        self.assertEqual(result["estimated_value"], 15.0)

    def test_marks_missing_price_as_unvalued(self):
        result = calculate_inventory_value(2, latest_price=None, average_price=None)

        self.assertEqual(result["valuation_status"], "unvalued")
        self.assertIsNone(result["estimated_value"])

    def test_refuses_missing_converted_quantity(self):
        result = calculate_inventory_value(None, latest_price=10.0, average_price=8.0)

        self.assertEqual(result["valuation_status"], "needs_conversion_review")
        self.assertIsNone(result["estimated_value"])


if __name__ == "__main__":
    unittest.main()
