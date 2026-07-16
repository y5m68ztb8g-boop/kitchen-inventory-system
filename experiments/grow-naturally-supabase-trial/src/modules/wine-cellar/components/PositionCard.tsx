import type { WineCellarPosition, WineCellarProductAssignment } from "../types";
import { calculateInventoryPercentage, calculatePositionValue, isLowStock } from "../utils/inventory";

type Props = {
  assignment?: WineCellarProductAssignment;
  position: WineCellarPosition;
  canAdjust: boolean;
  canCount: boolean;
  canReceive: boolean;
  canManage: boolean;
  showCost: boolean;
  onAction: (action: "count" | "receive" | "adjust") => void;
  onArchive: () => void;
  onConfigure: () => void;
};

export function PositionCard({ assignment, position, canAdjust, canCount, canReceive, canManage, showCost, onAction, onArchive, onConfigure }: Props) {
  const low = isLowStock(position);
  return <article className={`wine-cellar-position-card ${low ? "wine-cellar-position-low" : ""}`}>
    <div className="wine-cellar-position-heading"><div><small>{position.code}</small><h3>{assignment?.productName || "未分配商品"}</h3></div><strong>{position.currentQuantity} / {position.capacity}</strong></div>
    <div className="wine-cellar-position-status">
      <span>{Math.round(calculateInventoryPercentage(position.currentQuantity, position.capacity))}%</span>
      <span>{position.stockUnit === "keg" ? "桶" : position.stockUnit === "bottle" ? "瓶" : "件"}</span>
      {low ? <span className="wine-cellar-warning-chip">低库存</span> : null}
      {assignment?.matchStatus === "unmatched" ? <span className="wine-cellar-unmatched-chip">待匹配发票</span> : null}
      {showCost ? <span>{`£${calculatePositionValue(position, assignment).toFixed(2)}`}</span> : null}
    </div>
    <div className="wine-cellar-position-meter"><span style={{ width: `${calculateInventoryPercentage(position.currentQuantity, position.capacity)}%` }} /></div>
    <div className="wine-cellar-card-actions">
      {canCount ? <button onClick={() => onAction("count")} type="button">盘点 {position.code}</button> : null}
      {canReceive ? <button onClick={() => onAction("receive")} type="button">收货 {position.code}</button> : null}
      {canAdjust ? <button onClick={() => onAction("adjust")} type="button">修正 {position.code}</button> : null}
      {canManage ? <button className="wine-cellar-secondary" onClick={onConfigure} type="button">配置 {position.code}</button> : null}
      {canManage ? <button className="wine-cellar-secondary wine-cellar-danger" onClick={onArchive} type="button">停用 {position.code}</button> : null}
    </div>
  </article>;
}
