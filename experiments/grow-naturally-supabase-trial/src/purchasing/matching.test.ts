// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildCurrentInventoryEntries } from "../../server/purchasing/currentInventory";
import {
  normaliseProductName,
  rankHistoricalProducts,
  recommendHistoricalProduct
} from "../../server/purchasing/matching";

function candidate(
  productName: string,
  supplierProductCode: string,
  overrides: Partial<{
    id: string;
    latestPrice: number;
    latestPurchaseDate: string;
    packSize: string;
    purchaseCount: number;
    supplierCode: string;
    supplierName: string;
  }> = {}
) {
  return {
    id: overrides.id ?? `BRK-${supplierProductCode}`,
    latestPrice: overrides.latestPrice ?? 10,
    latestPurchaseDate: overrides.latestPurchaseDate ?? "2026-01-01",
    packSize: overrides.packSize ?? "1x5kg",
    productName,
    purchaseCount: overrides.purchaseCount ?? 1,
    supplierCode: overrides.supplierCode ?? "BRK",
    supplierName: overrides.supplierName ?? "Brakes",
    supplierProductCode
  };
}

describe("normaliseProductName", () => {
  it("normalises Unicode, punctuation, whitespace, and simple English plurals", () => {
    expect(normaliseProductName("  Café  CHICKEN-Breasts!!! ")).toBe("cafe chicken breast");
  });

  it.each([
    ["chunky chips", "chunky fries"],
    ["seeded rolls", "seeded buns"],
    ["roast potatoes", "roast spuds"],
    ["diet soft drinks", "diet soda"],
    ["washing up liquid", "dish soap"]
  ])("maps the bounded alias pair %s and %s together", (left, right) => {
    expect(normaliseProductName(left)).toBe(normaliseProductName(right));
  });
});

describe("recommendHistoricalProduct", () => {
  it("ranks exact normalised names above frequency-only candidates", () => {
    const frequentTurkey = candidate("Turkey Escalopes", "TURKEY-1", { purchaseCount: 10000 });
    const recentExactChicken = candidate("Chicken Breast", "CHICKEN-1", {
      latestPurchaseDate: "2026-07-01",
      purchaseCount: 1
    });

    const result = recommendHistoricalProduct({
      candidates: [frequentTurkey, recentExactChicken],
      inventoryEntries: [],
      productName: "Chicken Breasts"
    });

    expect(result?.recommendedProductCode).toBe("CHICKEN-1");
  });

  it("uses aliases for chips and fries", () => {
    const chunkyFries = candidate("Chunky Fries", "135177");

    const result = recommendHistoricalProduct({
      candidates: [chunkyFries],
      inventoryEntries: [],
      productName: "chunky chips"
    });

    expect(result?.recommendedProductCode).toBe("135177");
  });

  it("uses purchase frequency then recent date as bounded tie breakers", () => {
    const lowFrequency = candidate("Garden Peas", "LOW-FREQUENCY", {
      latestPurchaseDate: "2026-07-09",
      purchaseCount: 1
    });
    const highFrequencyOld = candidate("Garden Peas", "HIGH-FREQUENCY", {
      latestPurchaseDate: "2020-01-01",
      purchaseCount: 100
    });
    const equallyFrequentRecent = candidate("Garden Peas", "RECENT-FREQUENT", {
      latestPurchaseDate: "2026-07-01",
      purchaseCount: 100
    });

    expect(
      recommendHistoricalProduct({
        candidates: [lowFrequency, highFrequencyOld],
        inventoryEntries: [],
        productName: "garden pea"
      })?.recommendedProductCode
    ).toBe("HIGH-FREQUENCY");
    expect(
      recommendHistoricalProduct({
        candidates: [highFrequencyOld, equallyFrequentRecent],
        inventoryEntries: [],
        productName: "garden pea"
      })?.recommendedProductCode
    ).toBe("RECENT-FREQUENT");
  });

  it("returns no recommendation for an unrelated weak candidate", () => {
    expect(
      recommendHistoricalProduct({
        candidates: [candidate("Washing Up Liquid", "SOAP-1", { purchaseCount: 5000 })],
        inventoryEntries: [],
        productName: "chicken breast"
      })
    ).toBeNull();
  });

  it("returns the persisted recommendation fields", () => {
    const result = recommendHistoricalProduct({
      candidates: [
        candidate("Chunky Fries", "135177", {
          id: "BRK-135177",
          latestPrice: 18.75,
          latestPurchaseDate: "2026-07-02",
          packSize: "4x2.5kg",
          purchaseCount: 23
        })
      ],
      inventoryEntries: [],
      productName: "chunky chips"
    });

    expect(result).toEqual({
      currentInventoryQuantity: 0,
      recommendedLastPrice: 18.75,
      recommendedLastPurchaseDate: "2026-07-02",
      recommendedPackSize: "4x2.5kg",
      recommendedProductCode: "135177",
      recommendedProductName: "Chunky Fries",
      recommendedPurchaseCount: 23,
      recommendedSupplierCode: "BRK",
      recommendedSupplierName: "Brakes",
      recommendedSupplierProductId: "BRK-135177"
    });
  });

  it("aggregates inventory by supplier-product ID before name fallback", () => {
    const matched = candidate("Skin On Fries", "FRIES-1", { id: "BRK-FRIES-1" });

    const result = recommendHistoricalProduct({
      candidates: [matched],
      inventoryEntries: [
        { productName: "Other label", quantity: 2, supplierProduct: { id: "BRK-FRIES-1" } },
        { productName: "Skin On Fries", quantity: 3, supplierProduct: { id: "BRK-FRIES-1" } },
        { productName: "Skin On Fries", quantity: 7 },
        { productName: "Skin On Fries", quantity: 100, supplierProduct: { id: "OTHER-ID" } }
      ],
      productName: "skin on chips"
    });

    expect(result?.currentInventoryQuantity).toBe(12);
  });

  it("falls back to normalised inventory names when no supplier-product ID matches", () => {
    const matched = candidate("Seeded Bun", "BUN-1", { id: "BRK-BUN-1" });

    const result = recommendHistoricalProduct({
      candidates: [matched],
      inventoryEntries: [
        { productName: "Seeded rolls", quantity: 4, supplierProduct: { id: "OTHER-ID" } },
        { productName: "Plain rolls", quantity: 8, supplierProduct: { id: "ANOTHER-ID" } }
      ],
      productName: "seeded buns"
    });

    expect(result?.currentInventoryQuantity).toBe(4);
  });
});

describe("rankHistoricalProducts", () => {
  it("excludes candidates below the semantic relevance threshold", () => {
    const ranked = rankHistoricalProducts({
      productName: "orange juice",
      candidates: [candidate("Washing Up Liquid", "SOAP-1", { purchaseCount: 5000 })],
      inventoryEntries: []
    });

    expect(ranked).toEqual([]);
  });

  it("returns the complete ranked contract with a numeric score", () => {
    const ranked = rankHistoricalProducts({
      productName: "orange juice",
      candidates: [
        candidate("Orange Juice", "ORANGE-1", {
          id: "BRK-ORANGE-1",
          latestPrice: 18.75,
          latestPurchaseDate: "2026-07-02",
          packSize: "4x2.5L",
          purchaseCount: 23,
          supplierCode: "BRK",
          supplierName: "Brakes"
        })
      ],
      inventoryEntries: []
    });

    expect(ranked[0]).toMatchObject({
      id: "BRK-ORANGE-1",
      latestPrice: 18.75,
      latestPurchaseDate: "2026-07-02",
      packSize: "4x2.5L",
      productName: "Orange Juice",
      purchaseCount: 23,
      supplierCode: "BRK",
      supplierName: "Brakes",
      supplierProductCode: "ORANGE-1",
      currentInventoryQuantity: 0,
      recommendedLastPrice: 18.75,
      recommendedLastPurchaseDate: "2026-07-02",
      recommendedPackSize: "4x2.5L",
      recommendedProductCode: "ORANGE-1",
      recommendedProductName: "Orange Juice",
      recommendedPurchaseCount: 23,
      recommendedSupplierCode: "BRK",
      recommendedSupplierName: "Brakes",
      recommendedSupplierProductId: "BRK-ORANGE-1",
      isRecommended: true
    });
    expect(ranked[0]?.score).toEqual(expect.any(Number));
    expect(Number.isFinite(ranked[0]?.score)).toBe(true);
  });

  it("marks exactly one recommendation across multiple ranked candidates", () => {
    const ranked = rankHistoricalProducts({
      productName: "apple juice",
      candidates: [
        candidate("Apple Juice", "APPLE-1", { id: "apple-1" }),
        candidate("Apple Juice", "APPLE-2", { id: "apple-2" }),
        candidate("Fresh Apple Juice", "APPLE-3", { id: "apple-3" })
      ],
      inventoryEntries: []
    });

    expect(ranked.filter((item) => item.isRecommended)).toHaveLength(1);
    expect(ranked[0]?.isRecommended).toBe(true);
    expect(ranked.slice(1).every((item) => !item.isRecommended)).toBe(true);
  });

  it("propagates current inventory quantity for each ranked candidate", () => {
    const ranked = rankHistoricalProducts({
      productName: "apple juice",
      candidates: [
        candidate("Apple Juice", "APPLE-1", { id: "apple-1" }),
        candidate("Apple Juice", "APPLE-2", { id: "apple-2" })
      ],
      inventoryEntries: [
        { productName: "Apple Juice", quantity: 4, supplierProduct: { id: "apple-1" } },
        { productName: "Apple Juice", quantity: 6, supplierProduct: { id: "apple-2" } },
        { productName: "Apple Juice", quantity: 3 }
      ]
    });

    expect(ranked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "apple-1", currentInventoryQuantity: 7 }),
        expect.objectContaining({ id: "apple-2", currentInventoryQuantity: 9 })
      ])
    );
  });

  it("uses stable ID as the final tie breaker", () => {
    const ranked = rankHistoricalProducts({
      productName: "apple juice",
      candidates: [
        candidate("Apple Juice", "APPLE-Z", {
          id: "z-id",
          latestPurchaseDate: "2026-01-01",
          purchaseCount: 10
        }),
        candidate("Apple Juice", "APPLE-A", {
          id: "a-id",
          latestPurchaseDate: "2026-01-01",
          purchaseCount: 10
        })
      ],
      inventoryEntries: []
    });

    expect(ranked.map((item) => item.id)).toEqual(["a-id", "z-id"]);
  });

  it("ranks exact historical product matches before frequent partial matches", () => {
    const ranked = rankHistoricalProducts({
      productName: "orange juice",
      candidates: [
        candidate("Fresh Orange Juice", "FRESH-ORANGE", { purchaseCount: 30 }),
        candidate("Orange Juice", "ORANGE-JUICE", { purchaseCount: 2 })
      ],
      inventoryEntries: []
    });

    expect(ranked[0]).toMatchObject({ productName: "Orange Juice", isRecommended: true });
  });

  it("uses purchase count and recency to break equally relevant matches", () => {
    const ranked = rankHistoricalProducts({
      productName: "apple juice",
      candidates: [
        candidate("Apple Juice", "RECENT-FREQUENT", {
          id: "recent-frequent",
          latestPurchaseDate: "2026-07-01",
          purchaseCount: 10
        }),
        candidate("Apple Juice", "OLD-RARE", {
          id: "old-rare",
          latestPurchaseDate: "2020-01-01",
          purchaseCount: 1
        })
      ],
      inventoryEntries: []
    });

    expect(ranked.map((item) => item.id)).toEqual(["recent-frequent", "old-rare"]);
  });
});

describe("buildCurrentInventoryEntries", () => {
  it("includes numeric baseline quantities while respecting deleted and represented source rows", () => {
    const entries = buildCurrentInventoryEntries(
      {
        deletedFreezerInventoryIds: ["CK003"],
        dryStore: [],
        freezer: [
          {
            productName: "Balmoral Chicken updated",
            quantity: 3,
            sourceItemId: "CK002",
            supplierProduct: { id: "BRK-BALMORAL" }
          }
        ]
      },
      [
        {
          id: "CK001",
          productName: "Chicken Breast",
          quantityText: "7 Cases",
          recordedSupplierCode: "",
          suggestedSupplierCode: "",
          suggestedSupplierProductCode: ""
        },
        {
          id: "CK002",
          productName: "Balmoral Chicken",
          quantityText: "1 Case",
          recordedSupplierCode: "",
          suggestedSupplierCode: "BRK",
          suggestedSupplierProductCode: "BALMORAL"
        },
        {
          id: "CK003",
          productName: "Chicken Curry",
          quantityText: "Quantity not confirmed",
          recordedSupplierCode: "",
          suggestedSupplierCode: "",
          suggestedSupplierProductCode: ""
        }
      ]
    );

    expect(entries).toEqual([
      {
        productName: "Balmoral Chicken updated",
        quantity: 3,
        supplierProduct: { id: "BRK-BALMORAL" }
      },
      { productName: "Chicken Breast", quantity: 7 }
    ]);
  });
});
