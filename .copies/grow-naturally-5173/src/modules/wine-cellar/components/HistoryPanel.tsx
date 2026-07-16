import { useMemo, useState } from "react";

import type { WineCellarSnapshot } from "../types";

type HistoryKind = "all" | "count" | "receipt" | "adjustment" | "audit";
export function HistoryPanel({ snapshot }: { snapshot: WineCellarSnapshot }) {
  const [filter, setFilter] = useState<HistoryKind>("all");
  const positions = new Map(snapshot.positions.map((position) => [position.id, position.code]));
  const rows = useMemo(() => [
    ...snapshot.countEntries.map((item) => ({ id: item.id, kind: "count" as const, time: item.createdAt, actor: item.actorName, title: `${positions.get(item.positionId) || "酒位"} 盘点`, detail: `${item.beforeQuantity} → ${item.afterQuantity}${item.abnormalPattern ? " · 排列异常" : ""}` })),
    ...snapshot.receipts.map((item) => ({ id: item.id, kind: "receipt" as const, time: item.createdAt, actor: item.actorName, title: `${positions.get(item.positionId) || "酒位"} 收货`, detail: `+${item.quantity} · ${item.beforeQuantity} → ${item.afterQuantity}` })),
    ...snapshot.adjustments.map((item) => ({ id: item.id, kind: "adjustment" as const, time: item.createdAt, actor: item.actorName, title: `${positions.get(item.positionId) || "酒位"} 修正`, detail: `${item.delta > 0 ? "+" : ""}${item.delta} · ${item.reason}` })),
    ...snapshot.auditEvents.map((item) => ({ id: item.id, kind: "audit" as const, time: item.createdAt, actor: item.actorName, title: "配置变更", detail: item.type }))
  ].sort((a, b) => b.time.localeCompare(a.time)), [snapshot]);
  const labels: Record<HistoryKind, string> = { all: "全部", count: "盘点", receipt: "收货", adjustment: "修正", audit: "配置" };
  return <section className="wine-cellar-history"><div className="wine-cellar-filter-row">{Object.entries(labels).map(([kind, label]) => <button aria-pressed={filter === kind} key={kind} onClick={() => setFilter(kind as HistoryKind)} type="button">{label}</button>)}</div>
    <div className="wine-cellar-history-list">{rows.filter((row) => filter === "all" || row.kind === filter).map((row) => <article key={`${row.kind}-${row.id}`}><div><strong>{row.title}</strong><p>{row.detail}</p></div><small>{row.actor} · {new Date(row.time).toLocaleString("zh-CN")}</small></article>)}{rows.length === 0 ? <p className="wine-cellar-empty">还没有操作记录</p> : null}</div>
  </section>;
}
