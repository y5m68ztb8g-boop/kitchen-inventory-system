import { getCopy } from "./copy";
import { calculateInventoryTotal, formatCurrency, loadInventoryEntries } from "./inventoryStore";

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
  const freezerEntries = loadInventoryEntries();
  const dryStoreEntries = loadInventoryEntries("dry-store");
  const freezerTotal = calculateInventoryTotal(freezerEntries);
  const dryStoreTotal = calculateInventoryTotal(dryStoreEntries);
  const total =
    scope === "all"
      ? freezerTotal + dryStoreTotal
      : scope === "freezer"
        ? freezerTotal
        : scope === "dry-store"
          ? dryStoreTotal
          : 0;
  const itemCount =
    scope === "all"
      ? freezerEntries.length + dryStoreEntries.length
      : scope === "freezer"
        ? freezerEntries.length
        : scope === "dry-store"
          ? dryStoreEntries.length
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
