import { useMemo, useState } from "react";

import type { WineCellarPosition } from "../types";
import { calculateInventoryPercentage } from "../utils/inventory";
import { getOrderedSlots, hasAbnormalEmptyPattern } from "../utils/slots";

export function CountWorkspace({ position, onCancel, onSave }: { position: WineCellarPosition; onCancel: () => void; onSave: (emptySlotIds: string[]) => boolean }) {
  const slots = useMemo(() => getOrderedSlots(position.width, position.depth, position.fillDirection), [position]);
  const [empty, setEmpty] = useState<Set<string>>(() => new Set());
  const quantity = position.capacity - empty.size;
  const abnormal = hasAbnormalEmptyPattern(slots, Array.from(empty));
  function toggle(id: string) { setEmpty((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  return <section className="wine-cellar-workspace" aria-label={`${position.code}盘点`}>
    <div className="wine-cellar-workspace-heading"><div><small>点击空位</small><h2>{position.code} 数字货架</h2></div><strong>{quantity} / {position.capacity} · {Math.round(calculateInventoryPercentage(quantity, position.capacity))}%</strong></div>
    <div className="wine-cellar-slot-scroll"><div className="wine-cellar-slot-grid" style={{ gridTemplateColumns: `repeat(${position.width}, minmax(44px, 1fr))` }}>
      {slots.sort((a, b) => a.row - b.row || a.column - b.column).map((slot) => {
        const isEmpty = empty.has(slot.id);
        return <button aria-label={`${position.code} 第${slot.row + 1}排第${slot.column + 1}位 ${isEmpty ? "空位" : "有货"}`} aria-pressed={isEmpty} className={isEmpty ? "wine-cellar-slot-empty" : "wine-cellar-slot-full"} key={slot.id} onClick={() => toggle(slot.id)} type="button"><span>{slot.column + 1}</span><small>{isEmpty ? "空" : "有"}</small></button>;
      })}
    </div></div>
    {abnormal ? <p className="wine-cellar-inline-warning" role="status">该酒位的空位排列可能异常，请确认酒瓶是否按规定摆放。</p> : null}
    <div className="wine-cellar-panel-actions"><button className="wine-cellar-secondary" onClick={onCancel} type="button">取消</button><button onClick={() => onSave(Array.from(empty))} type="button">保存盘点</button></div>
  </section>;
}
