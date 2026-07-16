import { useEffect, useState } from "react";

import { getCopy } from "./copy";
import { calculateInventoryTotal, formatCurrency, loadInventoryEntries } from "./inventoryStore";
import { calculateInventorySummary, type WineCellarSnapshot } from "./modules/wine-cellar";

type ValuationScope = "all" | "freezer" | "chiller" | "dry-store" | "drinks";

type ValuationPageProps = {
  scope?: ValuationScope;
};

const valuationLabels: Record<ValuationScope, string> = {
  all: "产品库存总金额",
  chiller: "冷藏库库存金额",
  drinks: "酒水库库存金额",
  "dry-store": "干货库库存金额",
  freezer: "冷冻库库存金额"
};

export function ValuationPage({ scope = "all" }: ValuationPageProps) {
  const copy = getCopy();
  const [wineCellarSnapshot, setWineCellarSnapshot] = useState<WineCellarSnapshot | null>(null);
  const freezerEntries = loadInventoryEntries();
  const dryStoreEntries = loadInventoryEntries("dry-store");
  const freezerTotal = calculateInventoryTotal(freezerEntries);
  const dryStoreTotal = calculateInventoryTotal(dryStoreEntries);
  const wineSummary = wineCellarSnapshot ? calculateInventorySummary(wineCellarSnapshot) : null;

  useEffect(() => {
    if (typeof fetch !== "function") return;
    let active = true;
    const request = fetch("/api/wine-cellar/snapshot?hotelId=tintohotel&areaId=drinks");
    if (!request || typeof request.then !== "function") return;
    void request
      .then(async (response) => response.ok ? response.json() as Promise<{ snapshot?: WineCellarSnapshot }> : null)
      .then((payload) => {
        if (active && payload?.snapshot) setWineCellarSnapshot(payload.snapshot);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const total =
    scope === "all"
      ? freezerTotal + dryStoreTotal + (wineSummary?.totalValue || 0)
      : scope === "freezer"
        ? freezerTotal
        : scope === "dry-store"
        ? dryStoreTotal
        : scope === "drinks"
          ? wineSummary?.totalValue || 0
        : 0;
  const itemCount =
    scope === "all"
      ? freezerEntries.length + dryStoreEntries.length + (wineSummary?.totalQuantity || 0)
      : scope === "freezer"
        ? freezerEntries.length
        : scope === "dry-store"
        ? dryStoreEntries.length
        : scope === "drinks"
          ? wineSummary?.totalQuantity || 0
        : 0;

  return (
    <main className="page-shell valuation-shell">
      <a className="back-link" href="#">
        {copy.routes.backHome}
      </a>
      <section className="page-panel valuation-panel">
        <h1>{valuationLabels[scope]}</h1>
        <strong>{formatCurrency(total)}</strong>
        <p>{itemCount === 0 ? copy.valuation.empty : `已录入 ${itemCount} 个库存产品。`}</p>
      </section>
    </main>
  );
}
