import { ChevronDown, ChevronUp, Plus, Settings, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./OrderingPage.css";
import {
  acknowledgeRestockOnly,
  addOrderingItem,
  deleteOrderingItem,
  getCurrentOrderingBatch,
  getOrderingProfile,
  importReadyIntake,
  prepareSupplierGroup,
  recordInventoryRecheck,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
  updateOrderingItem
} from "./ordering/api";
import { EmailDraftDialog } from "./ordering/EmailDraftDialog";
import { InventoryReviewDialog } from "./ordering/InventoryReviewDialog";
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
  const [inventoryReview, setInventoryReview] = useState<{ supplier: "CMP" | "MM" | "BRK"; items: InventoryReviewItem[] } | null>(null);
  const [emailDraft, setEmailDraft] = useState<SupplierEmailDraft | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  async function prepare(code: "CMP" | "MM" | "BRK") {
    if (!batch) return;
    try {
      const result = await prepareSupplierGroup(batch.id, code);
      if (result.kind === "inventory-review-required") {
        setInventoryReview({ supplier: code, items: result.items });
      } else if (result.kind === "email-draft") {
        setEmailDraft(result.draft);
      } else {
        setError("Brakes 商品已准备好，可进入 Quick Add。 ");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "准备下单失败。 ");
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

  if (!batch) {
    return <main className="ordering-page"><p>{error ?? "正在加载下单清单..."}</p></main>;
  }

  return (
    <main className="ordering-page">
      <header className="ordering-page-header">
        <div><a href="#">返回首页</a><p>统一采购清单</p><h1>下单</h1></div>
        <button aria-label="下单设置" className="ordering-icon-button" onClick={() => setSettingsOpen(true)} title="设置" type="button"><Settings size={20} /></button>
      </header>

      {error && <p className="ordering-alert" role="status">{error}</p>}

      <section className="ordering-toolbar" aria-label="下单基本信息">
        <label><span>采购 PO 号码</span><input aria-label="采购 PO 号码" onBlur={() => void saveBatchPo(batch.id, batch.poNumber).then(setBatch).catch((nextError) => setError(String(nextError)))} onChange={(event) => setBatch({ ...batch, poNumber: event.target.value })} placeholder="从前台系统取得后填写" value={batch.poNumber} /></label>
        <button onClick={() => setManualOpen(true)} type="button"><Plus size={18} />手动添加</button>
      </section>

      {readyIntakes.length > 0 && (
        <section className="ready-intakes" aria-label="待导入采购项目">
          <h2>待采购项目</h2>
          {readyIntakes.map((intake) => <button key={intake.id} onClick={() => void importReadyIntake(intake.id).then((response) => { setBatch(response.batch); setReadyIntakes(response.readyIntakes); })} type="button">导入 {intake.originalFilename}（{intake.itemCount} 项）</button>)}
        </section>
      )}

      <section className="ordering-groups" aria-label="供应商分组清单">
        {groups.map((group) => {
          const items = itemsByGroup.get(group.code) ?? [];
          const open = openGroups.has(group.code);
          return (
            <section className={`ordering-group ordering-group-${group.code.toLowerCase()}`} key={group.code}>
              <header>
                <button aria-expanded={open} aria-label={`${group.name} 分组`} className="ordering-group-toggle" onClick={() => toggleGroup(group.code)} type="button">
                  <span>{group.name}<small>{items.length} 项</small></span>{open ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                </button>
                {group.code !== "UNMATCHED" && <button className="ordering-prepare-button" onClick={() => void prepare(group.code as "CMP" | "MM" | "BRK")} type="button">{group.code === "BRK" ? "准备 Brakes Quick Add" : `准备 ${group.name} 邮件`}</button>}
              </header>
              {open && (
                <div className="ordering-items">
                  {items.length === 0 && <p className="ordering-empty">暂无商品</p>}
                  {items.map((item) => (
                    <article className="ordering-item" key={item.id}>
                      <div className="ordering-item-name"><strong>{item.productName}</strong><span>{item.supplierName || "待匹配供应商"}{item.supplierProductCode ? ` · ${item.supplierProductCode}` : ""}</span></div>
                      <div><small>包装</small><span>{item.packSize || item.orderUnit}</span></div>
                      <label><span>订购数量</span><input aria-label={`订购数量 ${item.productName}`} min="0.01" onBlur={(event) => void updateOrderingItem(batch.id, item.id, { orderQuantity: Number(event.target.value) }).then(setBatch)} onChange={(event) => setBatch({ ...batch, items: batch.items.map((entry) => entry.id === item.id ? { ...entry, orderQuantity: Number(event.target.value) } : entry) })} step="any" type="number" value={item.orderQuantity} /></label>
                      <div><small>参考价格</small><span>{item.lastPrice == null ? "-" : money.format(item.lastPrice)}</span></div>
                      <div><small>当前库存</small><span>{item.totalEquivalentQuantity ?? 0}</span></div>
                      <button aria-label={`删除 ${item.productName}`} className="ordering-icon-button" onClick={() => void deleteOrderingItem(batch.id, item.id).then(setBatch)} title="删除" type="button"><Trash2 size={18} /></button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </section>

      {manualOpen && !selectedProduct && <ProductMatchDialog itemName="" onChoose={setSelectedProduct} onClose={() => setManualOpen(false)} returnFocusElement={null} selectedProductId={null} />}
      {manualOpen && selectedProduct && (
        <div className="ordering-dialog-backdrop"><section aria-label="添加下单商品" aria-modal="true" className="ordering-dialog ordering-add-dialog" role="dialog">
          <header><div><p>{selectedProduct.supplierName}</p><h2>{selectedProduct.productName}</h2></div><button aria-label="关闭手动添加" className="ordering-icon-button" onClick={() => setManualOpen(false)} type="button"><X size={20} /></button></header>
          <dl><div><dt>产品编码</dt><dd>{selectedProduct.supplierProductCode}</dd></div><div><dt>完整包装</dt><dd>{selectedProduct.packSize}</dd></div></dl>
          <label><span>订购数量（完整供应商包装）</span><input aria-label="订购数量" min="0.01" onChange={(event) => setManualQuantity(Number(event.target.value))} step="any" type="number" value={manualQuantity} /></label>
          <div className="ordering-dialog-actions"><button onClick={() => setSelectedProduct(null)} type="button">重新选择</button><button className="ordering-primary" onClick={() => void addSelectedProduct()} type="button">添加到下单</button></div>
        </section></div>
      )}

      {inventoryReview && <InventoryReviewDialog items={inventoryReview.items} onClose={() => setInventoryReview(null)} onRecheck={(item) => { if (batch) void recordInventoryRecheck(batch.id, item.itemId); }} onRestockOnly={(item) => void confirmRestock(item)} />}
      {emailDraft && <EmailDraftDialog draft={emailDraft} onChange={setEmailDraft} onClose={() => setEmailDraft(null)} onSave={saveDraft} supplierName={emailDraft.supplierCode === "CMP" ? "Campbells" : "Mark Murphy"} />}
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
    </main>
  );
}
