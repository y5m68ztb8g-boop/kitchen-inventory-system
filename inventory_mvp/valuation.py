def calculate_inventory_value(
    quantity_purchase_units: float | None,
    latest_price: float | None,
    average_price: float | None,
) -> dict:
    if quantity_purchase_units is None:
        return {
            "valuation_status": "needs_conversion_review",
            "price_source": None,
            "price_used": None,
            "estimated_value": None,
        }

    if latest_price is not None:
        price = latest_price
        status = "confirmed"
        source = "latest_price"
    elif average_price is not None:
        price = average_price
        status = "estimated"
        source = "average_price"
    else:
        return {
            "valuation_status": "unvalued",
            "price_source": None,
            "price_used": None,
            "estimated_value": None,
        }

    return {
        "valuation_status": status,
        "price_source": source,
        "price_used": price,
        "estimated_value": round(quantity_purchase_units * price, 2),
    }
