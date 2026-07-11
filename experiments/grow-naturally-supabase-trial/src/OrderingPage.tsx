import { ChevronDown, ChevronUp, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./OrderingPage.css";
import {
  acknowledgeRestockOnly,
  addOrderingItem,
  deleteOrderingItem,
  getCurrentOrderingBatch,
  getOrderingProfile,
  importReadyIntake,
  markSupplierOrdered,
  prepareSupplierGroup,
  recordInventoryRecheck,
  runBrakesQuickAdd,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
  updateOrderingInventoryLocation,
  updateOrderingItem
} from "./ordering/api";
import { EmailDraftDialog } from "./ordering/EmailDraftDialog";
import { InventoryReviewDialog } from "./ordering/InventoryReviewDialog";
import { InventoryLocationDialog } from "./ordering/InventoryLocationDialog";
import type {
  InventoryReviewItem,
  OrderingProfile,
  PurchaseBatch,
  SupplierEmailDraft,
  SupplierGroup
} from "./ordering/types";
import { ProductMatchDialog } from "./purchasing/ProductMatchDialog";
import type { HistoricalProductCard } from "./purchasing/types";

const groups: Array<{ code: SupplierGroup; name: string }> = [
  { code: "CMP", name: "Campbells" },
  { code: "MM", name: "Mark Murphy" },
  { code: "BRK", name: "Brakes" },
  { code: "UNMATCHED", name: "未匹配供应商" }
];

const emptyProfile: OrderingProfile = { purchaserName: "", hotelName: "", campbellsEmail: "", markMurphyEmail: "" };
const money = new Intl.NumberFormat("en-GB", { currency: "GBP", style: "currency" });

export function OrderingPage() {
  const [batch, setBatch] = useState<PurchaseBatch | null>(null);
  const [readyIntakes, setReadyIntakes] = useState<Array<{ id: string; originalFilename: string; itemCount: number }>>([]);
  const [profile, setProfile] = useState<OrderingProfile>(emptyProfile);
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<SupplierGroup>>(() => new Set(groups.map((group) => group.code)));
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<HistoricalProductCard | null>(null);
  const [manualQuantity, setManualQuantity] = useState(1);
  const [directEntry, setDirectEntry] = useState(false);
  const [directProductName, setDirectProductName] = useState("");
  const [directUnit, setDirectUnit] = useState("");
  const [inventoryReview, setInventoryReview] = useState<{ supplier: "CMP" | "MM" | "BRK"; items: InventoryReviewItem[] } | null>(null);
  const [emailDraft, setEmailDraft] = useState<SupplierEmailDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [confirmOrdered, setConfirmOrdered] = useState<{ code: "CMP" | "MM" | "BRK"; name: string } | null>(null);
  const [quickAddRunning, setQuickAddRunning] = useState(false);
  const [poSaving, setPoSaving] = useState(false);
  const [readyImportingId, setReadyImportingId] = useState<string | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [manualSearchSeed, setManualSearchSeed] = useState("");
  const [stockTarget, setStockTarget] = useState<{ itemId: string; productName: string; supplierProductId: string; locations: NonNullable<PurchaseBatch["items"][number]["locations"]> } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const quantityDrafts = useRef(new Map<string, number | null>());
  const pendingQuantityUpdates = useRef(new Map<string, Promise<PurchaseBatch>>());

  useEffect(() => {
    if (error) {
      if (typeof errorRef.current?.scrollIntoView === "function") {
        errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      errorRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    let active = true;
    Promise.all([getCurrentOrderingBatch(), getOrderingProfile()])
      .then(([current, savedProfile]) => {
        if (!active) return;
        setBatch(current.batch);
        setReadyIntakes(current.readyIntakes);
        setProfile(savedProfile);
      })
      .catch((nextError) => active && setError(nextError instanceof Error ? nextError.message : "下单清单加载失败。"));
    return () => { active = false; };
  }, []);

  const itemsByGroup = useMemo(() => new Map(groups.map((group) => [group.code, batch?.items.filter((item) => item.supplierGroup === group.code) ?? []])), [batch]);

  function toggleGroup(code: SupplierGroup) {
    setOpenGroups((current) => {
      const next = new Set(current);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  async function addSelectedProduct() {
    if (!batch || !selectedProduct || !Number.isFinite(manualQuantity) || manualQuantity <= 0) return;
    const next = await addOrderingItem(batch.id, { supplierProductId: selectedProduct.id, orderQuantity: manualQuantity });
    setBatch(next);
    setManualOpen(false);
    setSelectedProduct(null);
    setManualQuantity(1);
  }

  async function addDirectProduct() {
    if (!batch || !directProductName.trim() || !directUnit.trim() || !Number.isFinite(manualQuantity) || manualQuantity <= 0) return;
    setBatch(await addOrderingItem(batch.id, {
      productName: directProductName.trim(),
      orderQuantity: manualQuantity,
      orderUnit: directUnit.trim(),
      supplierGroup: "UNMATCHED"
    }));
    setManualOpen(false);
    setDirectEntry(false);
    setDirectProductName("");
    setDirectUnit("");
    setManualQuantity(1);
  }

  function saveItemQuantity(itemId: string, quantity: number) {
    if (!batch) return Promise.resolve(batch);
    const request = updateOrderingItem(batch.id, itemId, { orderQuantity: quantity });
    pendingQuantityUpdates.current.set(itemId, request);
    void request.then(setBatch).catch(() => undefined).finally(() => {
      if (pendingQuantityUpdates.current.get(itemId) === request) pendingQuantityUpdates.current.delete(itemId);
    });
    return request;
  }

  async function prepare(code: "CMP" | "MM" | "BRK") {
    if (!batch) return;
    setError(null);
    try {
      if (!batch.poNumber.trim()) {
        setPoDialogOpen(true);
        setError("请先填写 PO number，再准备供应商订单。 ");
        return;
      }
      setPoSaving(true);
      await Promise.all(batch.items
        .filter((item) => item.supplierGroup === code)
        .map((item) => pendingQuantityUpdates.current.get(item.id))
        .filter((request): request is Promise<PurchaseBatch> => request !== undefined));
      let currentBatch = await saveBatchPo(batch.id, batch.poNumber);
      for (const item of batch.items.filter((entry) => entry.supplierGroup === code)) {
        const quantity = quantityDrafts.current.get(item.id) ?? item.orderQuantity;
        if (quantity != null && Number.isFinite(quantity) && quantity > 0) {
          currentBatch = await updateOrderingItem(currentBatch.id, item.id, { orderQuantity: quantity });
        }
      }
      setBatch(currentBatch);
      const result = await prepareSupplierGroup(currentBatch.id, code);
      if (result.kind === "inventory-review-required") {
        setInventoryReview({ supplier: code, items: result.items });
      } else if (result.kind === "email-draft") {
        setEmailDraft(result.draft);
      } else {
        setError("Brakes 商品已准备好，可进入 Quick Add。 ");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "准备下单失败。 ");
    } finally {
      setPoSaving(false);
    }
  }

  async function confirmRestock(item: InventoryReviewItem) {
    if (!batch || !inventoryReview) return;
    await acknowledgeRestockOnly(batch.id, item.itemId);
    const remaining = inventoryReview.items.filter((entry) => entry.itemId !== item.itemId);
    if (remaining.length > 0) setInventoryReview({ ...inventoryReview, items: remaining });
    else {
      const supplier = inventoryReview.supplier;
      setInventoryReview(null);
      await prepare(supplier);
    }
  }

  async function saveDraft(draft: SupplierEmailDraft) {
    if (!batch) return;
    const next = await saveSupplierEmailDraft(batch.id, draft.supplierCode, { to: draft.to, subject: draft.subject, body: draft.body });
    setBatch(next);
  }

  async function fillBrakesCart() {
    if (quickAddRunning || !batch) return;
    setQuickAddRunning(true);
    try { setBatch(await runBrakesQuickAdd(batch.id)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Brakes Quick Add 失败。 "); }
    finally { setQuickAddRunning(false); }
  }

  async function persistPo() {
    if (!batch || poSaving) return;
    if (!batch.poNumber.trim()) return;
    setPoSaving(true);
    try { setBatch(await saveBatchPo(batch.id, batch.poNumber)); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "PO 保存失败。 "); }
    finally { setPoSaving(false); }
  }

  async function importReady(intakeId: string) {
    if (readyImportingId) return;
    setReadyImportingId(intakeId);
    setError(null);
    try {
      const response = await importReadyIntake(intakeId);
      setBatch(response.batch);
      setReadyIntakes(response.readyIntakes);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "待采购项目导入失败，请稍后重试。 ");
    } finally {
      setReadyImportingId(null);
    }
  }

  function openProductSearch(query = orderSearchQuery) {
    setManualSearchSeed(query.trim());
    setSelectedProduct(null);
    setDirectEntry(false);
    setManualOpen(true);
  }

  async function saveInventoryLocation(location: NonNullable<PurchaseBatch["items"][number]["locations"]>[number], quantity: number) {
    if (!stockTarget) return;
    await updateOrderingInventoryLocation(stockTarget.supplierProductId, location.warehouse, location.locationCode, quantity);
    const current = await getCurrentOrderingBatch();
    setBatch(current.batch);
    const updated = current.batch.items.find((item) => item.id === stockTarget.itemId || item.supplierProductId === stockTarget.supplierProductId);
    if (updated?.locations) setStockTarget({ ...stockTarget, itemId: updated.id, locations: updated.locations, productName: updated.productName });
  }

  if (!batch) {
    return <main className="ordering-page"><p>{error ?? "正在加载下单清单..."}</p></main>;
  }

  return (
    <main className="ordering-page">
      <header className="ordering-page-header">
        <div><a href="#">返回首页</a><p>统一采购清单</p><h1>下单</h1></div>
        <button aria-label="下单设置" className="ordering-icon-button" onClick={() => setSettingsOpen(true)} title="设置" type="button"><Settings size={20} /></button>
      </header>

      {error && <div className="ordering-alert" ref={errorRef} role="alert" tabIndex={-1}><span>{error}</span>{error.includes("下单设置") && <button onClick={() => setSettingsOpen(true)} type="button">完善下单设置</button>}{error.includes("PO") && <button onClick={() => setPoDialogOpen(true)} type="button">填写 PO</button>}</div>}
      <p className="ordering-batch-status">{batch.status === "Ordered" ? "全部已下单" : batch.status === "PartiallyOrdered" ? "部分已下单" : "草稿"}</p>

      <section aria-label="采购辅助信息" className="ordering-toolbar ordering-po-compact">
        <label><span>PO number</span><input aria-label="采购 PO 号码" onBlur={() => void persistPo()} onChange={(event) => setBatch({ ...batch, poNumber: event.target.value })} placeholder="输入前台 PO number" value={batch.poNumber} /></label>
        <span>{poSaving ? "保存中..." : "所有供应商共用"}</span>
      </section>

      <section aria-label="搜索下单商品" className="ordering-product-search" role="search">
        <div><Search aria-hidden="true" size={24} /><label><span>搜索并添加商品</span><input aria-label="搜索下单商品" onChange={(event) => setOrderSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") openProductSearch(); }} placeholder="输入产品名称、供应商或产品编码" type="search" value={orderSearchQuery} /></label></div>
        <button className="ordering-primary" onClick={() => openProductSearch()} type="button">搜索并添加</button>
        <button onClick={() => openProductSearch("")} type="button"><Plus size={18} />手动添加</button>
      </section>

      {readyIntakes.length > 0 && (
        <section className="ready-intakes" aria-label="待导入采购项目">
          <h2>待采购项目</h2>
          {readyIntakes.map((intake) => <button disabled={readyImportingId !== null} key={intake.id} onClick={() => void importReady(intake.id)} type="button">{readyImportingId === intake.id ? "导入中..." : `导入 ${intake.originalFilename}（${intake.itemCount} 项）`}</button>)}
        </section>
      )}

      <section className="ordering-groups" aria-label="供应商分组清单">
        {groups.map((group) => {
          const items = itemsByGroup.get(group.code) ?? [];
          const open = openGroups.has(group.code);
          const supplier = group.code === "UNMATCHED" ? null : batch.suppliers.find((entry) => entry.supplierCode === group.code);
          const hasRetryableBrakes = group.code === "BRK" && items.some((item) => item.brakesStatus === "Failed" || item.brakesStatus === "InvalidCode" || item.brakesStatus === "AwaitingConfirmation");
          return (
            <section className={`ordering-group ordering-group-${group.code.toLowerCase()}`} key={group.code}>
              <header>
                <button aria-expanded={open} aria-label={`${group.name} 分组`} className="ordering-group-toggle" onClick={() => toggleGroup(group.code)} type="button">
                  <span>{group.name}<small>{items.length} 项</small></span>{open ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                </button>
                {group.code !== "UNMATCHED" && group.code !== "BRK" && supplier?.status !== "Ordered" && <button className="ordering-prepare-button" disabled={poSaving} onClick={() => void prepare(group.code as "CMP" | "MM")} type="button">{`准备 ${group.name} 邮件`}</button>}
                {group.code === "BRK" && supplier?.status !== "Ordered" && <button className="ordering-prepare-button" disabled={quickAddRunning || poSaving} onClick={() => void fillBrakesCart()} type="button">{quickAddRunning ? "正在填入..." : hasRetryableBrakes ? "重试 Brakes Quick Add" : "填入 Brakes 购物车"}</button>}
                {supplier?.status === "Prepared" && <button aria-label={`${group.name} 标记为已下单`} className="ordering-ordered-button" onClick={() => setConfirmOrdered({ code: supplier.supplierCode, name: group.name })} type="button">标记为已下单</button>}
                {supplier?.status === "Ordered" && <span className="ordering-ordered-state">已下单</span>}
              </header>
              {open && (
                <div className="ordering-items">
                  {items.length === 0 && <p className="ordering-empty">暂无商品</p>}
                  {items.map((item) => (
                    <article className="ordering-item" key={item.id}>
                      <div className="ordering-item-name"><strong>{item.productName}</strong><span>{item.supplierName || "待匹配供应商"}{item.supplierProductCode ? ` · ${item.supplierProductCode}` : ""}</span></div>
                      <div><small>包装</small><span>{item.packSize || item.orderUnit}</span></div>
                      <label><span>订购数量</span><input aria-label={`订购数量 ${item.productName}`} min="0.01" onBlur={(event) => { if (event.target.value.trim()) void saveItemQuantity(item.id, Number(event.target.value)).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "订购数量保存失败。 ")); }} onChange={(event) => { const value = event.target.value === "" ? null : Number(event.target.value); quantityDrafts.current.set(item.id, value); setBatch({ ...batch, items: batch.items.map((entry) => entry.id === item.id ? { ...entry, orderQuantity: value } : entry) }); }} step="any" type="number" value={item.orderQuantity ?? ""} /></label>
                      <div><small>参考价格</small><span>{item.lastPrice == null ? "-" : money.format(item.lastPrice)}</span></div>
                      <div><small>当前库存</small><span>{item.totalEquivalentQuantity ?? 0}</span></div>
                      {item.supplierProductId && item.locations && item.locations.length > 0 && <button aria-label={`查看库存 ${item.productName}`} className="ordering-stock-button" onClick={() => setStockTarget({ itemId: item.id, locations: item.locations!, productName: item.productName, supplierProductId: item.supplierProductId! })} type="button">查看库存</button>}
                      {group.code === "BRK" && <span className={`ordering-brakes-status ordering-brakes-${item.brakesStatus.toLowerCase()}`}>{item.brakesStatus === "Added" ? "已填入购物车" : item.brakesStatus === "AwaitingConfirmation" ? "等待 Brakes 确认" : item.brakesStatus === "InvalidCode" ? "无效编码" : item.brakesStatus === "Failed" ? "填写失败" : "待填入"}</span>}
                      <button aria-label={`删除 ${item.productName}`} className="ordering-icon-button" onClick={() => void deleteOrderingItem(batch.id, item.id).then(setBatch)} title="删除" type="button"><Trash2 size={18} /></button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </section>

      {manualOpen && !selectedProduct && !directEntry && <ProductMatchDialog itemName={manualSearchSeed} onChoose={setSelectedProduct} onClose={() => setManualOpen(false)} returnFocusElement={null} secondaryAction={{ label: "直接录入未匹配商品", onClick: () => setDirectEntry(true) }} selectedProductId={null} />}
      {manualOpen && selectedProduct && (
        <div className="ordering-dialog-backdrop"><section aria-label="添加下单商品" aria-modal="true" className="ordering-dialog ordering-add-dialog" role="dialog">
          <header><div><p>{selectedProduct.supplierName}</p><h2>{selectedProduct.productName}</h2></div><button aria-label="关闭手动添加" className="ordering-icon-button" onClick={() => setManualOpen(false)} type="button"><X size={20} /></button></header>
          <dl><div><dt>产品编码</dt><dd>{selectedProduct.supplierProductCode}</dd></div><div><dt>完整包装</dt><dd>{selectedProduct.packSize}</dd></div></dl>
          <label><span>订购数量（完整供应商包装）</span><input aria-label="订购数量" min="0.01" onChange={(event) => setManualQuantity(Number(event.target.value))} step="any" type="number" value={manualQuantity} /></label>
          <div className="ordering-dialog-actions"><button onClick={() => setSelectedProduct(null)} type="button">重新选择</button><button className="ordering-primary" onClick={() => void addSelectedProduct()} type="button">添加到下单</button></div>
        </section></div>
      )}
      {manualOpen && directEntry && (
        <div className="ordering-dialog-backdrop"><section aria-label="直接录入未匹配商品" aria-modal="true" className="ordering-dialog ordering-add-dialog" role="dialog">
          <header><div><p>首次采购或尚未匹配</p><h2>直接录入未匹配商品</h2></div><button aria-label="关闭直接录入" className="ordering-icon-button" onClick={() => setManualOpen(false)} type="button"><X size={20} /></button></header>
          <label><span>产品名称</span><input aria-label="产品名称" onChange={(event) => setDirectProductName(event.target.value)} value={directProductName} /></label>
          <label><span>订购数量</span><input aria-label="订购数量" min="0.01" onChange={(event) => setManualQuantity(Number(event.target.value))} step="any" type="number" value={manualQuantity} /></label>
          <label><span>单位</span><input aria-label="单位" onChange={(event) => setDirectUnit(event.target.value)} placeholder="例如 case、tray、kg" value={directUnit} /></label>
          <div className="ordering-dialog-actions"><button onClick={() => setDirectEntry(false)} type="button">返回历史商品</button><button className="ordering-primary" onClick={() => void addDirectProduct()} type="button">添加到下单</button></div>
        </section></div>
      )}

      {inventoryReview && <InventoryReviewDialog items={inventoryReview.items} onClose={() => setInventoryReview(null)} onRecheck={(item) => { if (batch) void recordInventoryRecheck(batch.id, item.itemId); }} onRestockOnly={(item) => void confirmRestock(item)} onViewInventory={(item) => { const batchItem = batch.items.find((entry) => entry.id === item.itemId); const supplierProductId = item.supplierProductId || batchItem?.supplierProductId; if (supplierProductId) setStockTarget({ itemId: item.itemId, locations: item.locations, productName: item.productName, supplierProductId }); }} />}
      {stockTarget && <InventoryLocationDialog locations={stockTarget.locations} onClose={() => setStockTarget(null)} onSave={saveInventoryLocation} productName={stockTarget.productName} />}
      {emailDraft && <EmailDraftDialog draft={emailDraft} onChange={setEmailDraft} onClose={() => setEmailDraft(null)} onSave={saveDraft} supplierName={emailDraft.supplierCode === "CMP" ? "Campbells" : "Mark Murphy"} />}
      {poDialogOpen && (
        <div className="ordering-dialog-backdrop"><section aria-label="填写 PO number" aria-modal="true" className="ordering-dialog ordering-po-dialog" role="dialog">
          <header><h2>填写 PO number</h2><button aria-label="关闭 PO number" className="ordering-icon-button" onClick={() => setPoDialogOpen(false)} type="button"><X size={20} /></button></header>
          <p className="ordering-dialog-intro">准备供应商邮件前需要一个 PO number。</p>
          <label><span>PO number</span><input aria-label="弹窗 PO number" autoFocus onChange={(event) => setBatch({ ...batch, poNumber: event.target.value })} value={batch.poNumber} /></label>
          <div className="ordering-dialog-actions"><button onClick={() => setPoDialogOpen(false)} type="button">取消</button><button className="ordering-primary" onClick={() => { setPoDialogOpen(false); void persistPo(); }} type="button">保存 PO</button></div>
        </section></div>
      )}
      {settingsOpen && (
        <div className="ordering-dialog-backdrop"><section aria-label="下单设置" aria-modal="true" className="ordering-dialog ordering-settings" role="dialog">
          <header><h2>下单设置</h2><button aria-label="关闭下单设置" className="ordering-icon-button" onClick={() => setSettingsOpen(false)} type="button"><X size={20} /></button></header>
          <label><span>订购人姓名</span><input onChange={(event) => setProfile({ ...profile, purchaserName: event.target.value })} value={profile.purchaserName} /></label>
          <label><span>酒店名称</span><input onChange={(event) => setProfile({ ...profile, hotelName: event.target.value })} value={profile.hotelName} /></label>
          <label><span>Campbells 邮箱</span><input onChange={(event) => setProfile({ ...profile, campbellsEmail: event.target.value })} type="email" value={profile.campbellsEmail} /></label>
          <label><span>Mark Murphy 邮箱</span><input onChange={(event) => setProfile({ ...profile, markMurphyEmail: event.target.value })} type="email" value={profile.markMurphyEmail} /></label>
          <button className="ordering-primary" onClick={() => void saveOrderingProfile(profile).then((saved) => { setProfile(saved); setSettingsOpen(false); })} type="button">保存设置</button>
        </section></div>
      )}
      {confirmOrdered && (
        <div className="ordering-dialog-backdrop"><section aria-label="确认已下单" aria-modal="true" className="ordering-dialog ordering-confirm-dialog" role="dialog">
          <h2>确认已下单</h2><p>是否确认 {confirmOrdered.name} 的订单已在供应商系统中完成？</p>
          <div className="ordering-dialog-actions"><button onClick={() => setConfirmOrdered(null)} type="button">否</button><button className="ordering-primary" onClick={() => void markSupplierOrdered(batch.id, confirmOrdered.code).then((saved) => { setBatch(saved); setConfirmOrdered(null); })} type="button">是</button></div>
        </section></div>
      )}
    </main>
  );
}
