import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { FREEZER_INVENTORY } from "../generated/freezerInventory";

describe("ordering inventory deep links", () => {
  it("highlights the pending freezer baseline row from a freezer deep link", () => {
    const pendingItem = FREEZER_INVENTORY.find(
      (item) => item.suggestedSupplierCode && item.suggestedSupplierProductCode
    );
    if (!pendingItem) {
      throw new Error("No pending freezer baseline item with supplier code exists in fixtures.");
    }

    const supplierProductId = `${pendingItem.suggestedSupplierCode}-${pendingItem.suggestedSupplierProductCode}`;
    window.location.hash = `#freezer?supplierProductId=${supplierProductId}&location=${pendingItem.locationCode}`;
    render(<App />);

    const pendingRow = screen.getByRole("row", { name: new RegExp(pendingItem.productName) });
    expect(
      pendingRow.getAttribute("aria-current") === "true" || pendingRow.classList.contains("inventory-table-row-highlighted")
    ).toBe(true);
  });
});
