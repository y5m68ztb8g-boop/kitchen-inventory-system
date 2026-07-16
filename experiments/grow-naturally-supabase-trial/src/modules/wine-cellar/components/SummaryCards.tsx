import type { WineCellarInventorySummary } from "../types";

export function SummaryCards({ summary, showCost }: { summary: WineCellarInventorySummary; showCost: boolean }) {
  const cards = [
    ["当前库存", summary.totalQuantity.toLocaleString("zh-CN")],
    ["最大容量", summary.totalCapacity.toLocaleString("zh-CN")],
    ["库存百分比", `${Math.round(summary.inventoryPercentage)}%`],
    ["低库存酒位", summary.lowStockPositionCount.toLocaleString("zh-CN")],
    ["待匹配商品", summary.unmatchedProductCount.toLocaleString("zh-CN")]
  ];
  if (showCost) cards.push(["酒库总金额", `£${summary.totalValue.toFixed(2)}`]);
  return <section className="wine-cellar-summary" aria-label="酒库库存摘要">
    {cards.map(([label, value]) => <article className="wine-cellar-summary-card" key={label}><span>{label}</span><strong>{value}</strong></article>)}
  </section>;
}
