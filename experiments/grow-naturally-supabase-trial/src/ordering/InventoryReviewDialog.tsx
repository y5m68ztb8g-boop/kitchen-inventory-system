import { X } from "lucide-react";
import type { InventoryReviewItem } from "./types";

export function InventoryReviewDialog({
  items,
  onClose,
  onRecheck,
  onRestockOnly
}: {
  items: InventoryReviewItem[];
  onClose: () => void;
  onRecheck: (item: InventoryReviewItem) => void;
  onRestockOnly: (item: InventoryReviewItem) => void;
}) {
  return (
    <div className="ordering-dialog-backdrop">
      <section aria-label="下单前核查库存" aria-modal="true" className="ordering-dialog inventory-review-dialog" role="dialog">
        <header>
          <div><p>库存提示</p><h2>下单前核查库存</h2></div>
          <button aria-label="关闭库存核查" className="ordering-icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <p className="ordering-dialog-intro">以下商品当前库存超过 1 个供应商包装，请先确认库存是否准确。</p>
        <div className="inventory-review-list">
          {items.map((item) => (
            <article key={item.itemId}>
              <div><strong>{item.productName}</strong><span>当前约 {item.totalEquivalentQuantity} 个完整包装</span></div>
              {item.locations.length > 0 && <p>{item.locations.map((location) => `${location.warehouseLabel} ${location.locationCode} · ${location.displayQuantity}`).join("；")}</p>}
              <div className="inventory-review-actions">
                <a href={item.inventoryLink} onClick={() => onRecheck(item)}>去核查库存</a>
                <button onClick={() => onRestockOnly(item)} type="button">仅补货</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
