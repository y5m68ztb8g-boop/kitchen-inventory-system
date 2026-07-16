import { useEffect, useState, type FormEvent } from "react";

import type { CreatePositionInput, WineCellarPosition, WineCellarProductAssignment, WineCellarProductOption, WineCellarRack } from "../types";

export function PositionEditor({ racks, products, position, assignment, onSave }: { racks: WineCellarRack[]; products: readonly WineCellarProductOption[]; position?: WineCellarPosition; assignment?: WineCellarProductAssignment; onSave: (input: CreatePositionInput) => boolean }) {
  const [rackId, setRackId] = useState(position?.rackId || racks[0]?.id || "");
  const [code, setCode] = useState(position?.code || "");
  const [width, setWidth] = useState(String(position?.width ?? 6));
  const [depth, setDepth] = useState(String(position?.depth ?? 4));
  const [productName, setProductName] = useState(assignment?.productName || "");
  const [productId, setProductId] = useState(assignment?.productId && products.some((product) => product.productId === assignment.productId) ? assignment.productId : "");
  const [stockUnit, setStockUnit] = useState<CreatePositionInput["stockUnit"]>(position?.stockUnit || "bottle");
  const [direction, setDirection] = useState<CreatePositionInput["fillDirection"]>(position?.fillDirection || "front-to-back");
  const [alertMode, setAlertMode] = useState<CreatePositionInput["lowStockMode"]>(position?.lowStockMode || "percentage");
  const [threshold, setThreshold] = useState(String(position?.lowStockThreshold ?? 25));
  const [assignmentChanged, setAssignmentChanged] = useState(false);
  useEffect(() => { if (!rackId && racks[0]) setRackId(racks[0].id); }, [rackId, racks]);
  function chooseProduct(id: string) { setAssignmentChanged(true); setProductId(id); const product = products.find((item) => item.productId === id); if (product) setProductName(product.productName); }
  function unitChanged(unit: CreatePositionInput["stockUnit"]) { setStockUnit(unit); if (unit === "keg") { setAlertMode("absolute"); setThreshold("1"); } }
  function submit(event: FormEvent) {
    event.preventDefault();
    const selected = products.find((item) => item.productId === productId);
    const nextAssignment = position && !assignmentChanged ? undefined : productName.trim() ? {
      productId: selected?.productId ?? null, productName, matchStatus: selected ? "matched" : "unmatched", supplierName: selected?.supplierName,
      supplierProductCode: selected?.supplierProductCode, invoiceReference: selected?.invoiceReference,
      unitCost: selected?.unitCost ?? null, currency: selected?.currency || "GBP"
    } as const : null;
    if (onSave({ rackId, code, width: Number(width), depth: Number(depth), stockUnit, fillDirection: direction, lowStockMode: alertMode, lowStockThreshold: Number(threshold), assignment: nextAssignment })) { if (!position) { setCode(""); setProductName(""); setProductId(""); } }
  }
  return <form className="wine-cellar-editor" onSubmit={submit}><h3>{position ? `配置 ${position.code}` : "新增酒位"}</h3><div className="wine-cellar-form-grid">
    <label>酒架<select onChange={(event) => setRackId(event.target.value)} value={rackId}>{racks.map((rack) => <option key={rack.id} value={rack.id}>{rack.name}</option>)}</select></label>
    <label>酒位编号<input onChange={(event) => setCode(event.target.value)} required value={code} /></label>
    <label>每排数量<input min="1" onChange={(event) => setWidth(event.target.value)} required type="number" value={width} /></label>
    <label>纵深排数<input min="1" onChange={(event) => setDepth(event.target.value)} required type="number" value={depth} /></label>
    <label>库存单位<select onChange={(event) => unitChanged(event.target.value as never)} value={stockUnit}><option value="bottle">瓶</option><option value="keg">大啤酒桶</option><option value="other">其他</option></select></label>
    <label>取用方向<select onChange={(event) => setDirection(event.target.value as never)} value={direction}><option value="front-to-back">从前向后</option><option value="back-to-front">从后向前</option><option value="left-to-right">从左向右</option><option value="right-to-left">从右向左</option></select></label>
    {products.length ? <label>匹配发票商品<select onChange={(event) => chooseProduct(event.target.value)} value={productId}><option value="">暂不匹配</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}</option>)}</select></label> : null}
    <label>商品名称（可稍后分配）<input onChange={(event) => { setAssignmentChanged(true); setProductName(event.target.value); if (productId) setProductId(""); }} value={productName} /></label>
    <label>预警方式<select onChange={(event) => setAlertMode(event.target.value as never)} value={alertMode}><option value="percentage">容量百分比</option><option value="absolute">绝对数量</option></select></label>
    <label>预警阈值<input min="0" onChange={(event) => setThreshold(event.target.value)} required type="number" value={threshold} /></label>
  </div><p className="wine-cellar-capacity-preview">最大容量：{Math.max(0, Number(width) * Number(depth) || 0)}</p><button disabled={!racks.length} type="submit">保存酒位</button></form>;
}
