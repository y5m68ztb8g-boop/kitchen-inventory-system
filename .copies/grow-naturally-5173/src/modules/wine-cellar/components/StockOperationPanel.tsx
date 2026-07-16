import { useState, type FormEvent } from "react";

import type { WineCellarPosition } from "../types";

export function StockOperationPanel({ mode, position, showCost, onCancel, onSave }: { mode: "receive" | "adjust"; position: WineCellarPosition; showCost: boolean; onCancel: () => void; onSave: (values: { quantity: number; reason: string; invoiceReference?: string; unitCost?: number }) => boolean }) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [unitCost, setUnitCost] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ quantity: Number(quantity), reason, invoiceReference: invoiceReference.trim() || undefined, unitCost: unitCost === "" ? undefined : Number(unitCost) });
  }
  return <form className="wine-cellar-workspace wine-cellar-operation-form" onSubmit={submit}>
    <div><small>{position.code}</small><h2>{mode === "receive" ? "收货补货" : "库存修正"}</h2><p>当前库存 {position.currentQuantity} / {position.capacity}</p></div>
    <label>{mode === "receive" ? "收货数量" : "修正数量"}<input aria-label={mode === "receive" ? "收货数量" : "修正数量"} inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} required type="number" value={quantity} /></label>
    {mode === "receive" ? <><label>发票引用<input onChange={(event) => setInvoiceReference(event.target.value)} value={invoiceReference} /></label>{showCost ? <label>单位成本<input aria-label="单位成本" min="0" onChange={(event) => setUnitCost(event.target.value)} step="0.01" type="number" value={unitCost} /></label> : null}</> : <label>修正原因<textarea aria-label="修正原因" onChange={(event) => setReason(event.target.value)} required value={reason} /></label>}
    <div className="wine-cellar-panel-actions"><button className="wine-cellar-secondary" onClick={onCancel} type="button">取消</button><button type="submit">{mode === "receive" ? "保存收货" : "保存修正"}</button></div>
  </form>;
}
