import { useState } from "react";
import { X } from "lucide-react";
import type { OrderingInventoryLocation } from "./types";

export function InventoryLocationDialog({
  locations,
  onClose,
  onSave,
  productName
}: {
  locations: OrderingInventoryLocation[];
  onClose: () => void;
  onSave: (location: OrderingInventoryLocation, quantity: number) => Promise<void>;
  productName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [quantities, setQuantities] = useState(() => Object.fromEntries(locations.map((location) => [locationKey(location), location.equivalentQuantity])));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      for (const location of locations) {
        const quantity = quantities[locationKey(location)];
        if (quantity !== location.equivalentQuantity) await onSave(location, quantity);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ordering-dialog-backdrop ordering-stock-backdrop">
      <section aria-label="库存位置与数量" aria-modal="true" className="ordering-dialog ordering-stock-dialog" role="dialog">
        <header>
          <div><p>当前库存</p><h2>{productName}</h2></div>
          <button aria-label="关闭库存位置" className="ordering-icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <div className="ordering-stock-locations">
          {locations.map((location) => (
            <div className="ordering-stock-location" key={locationKey(location)}>
              <div><strong>{location.warehouseLabel}</strong><span>{location.locationCode}</span></div>
              {editing ? (
                <label><span>数量</span><input aria-label={`${location.locationCode} 库存数量`} min="0" onChange={(event) => setQuantities({ ...quantities, [locationKey(location)]: Number(event.target.value) })} step="any" type="number" value={quantities[locationKey(location)]} /></label>
              ) : <strong>{location.displayQuantity}</strong>}
            </div>
          ))}
        </div>
        <div className="ordering-dialog-actions">
          {!editing ? <button onClick={() => setEditing(true)} type="button">库存不准确</button> : <button onClick={() => setEditing(false)} type="button">取消修改</button>}
          {editing && <button className="ordering-primary" disabled={saving} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存库存数量"}</button>}
        </div>
      </section>
    </div>
  );
}

function locationKey(location: OrderingInventoryLocation) {
  return `${location.warehouse}:${location.locationCode}`;
}
