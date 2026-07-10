import { Camera, Eye, FileSpreadsheet, FileText, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import "./PurchasingPage.css";
import { parseIntake, readyForPurchase, savePendingIntake } from "./purchasing/api";
import { ProductMatchDialog } from "./purchasing/ProductMatchDialog";
import type {
  HistoricalProductCard,
  PurchaseIntakeResponse,
  PurchaseIntakeReviewItem
} from "./purchasing/types";

const imageAccept = "image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp";
const manualAccept = `${imageAccept},application/pdf,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,application/vnd.ms-excel,.xls,text/csv,.csv`;

type PreviewState = {
  error: string | null;
  file: File;
  kind: "preview" | "recognising";
  previewUrl: string | null;
  source: "camera" | "manual";
};

type ReviewState = {
  action: "idle" | "saving" | "handing-off";
  handedOff: boolean;
  intake: PurchaseIntakeResponse;
  items: PurchaseIntakeReviewItem[];
  kind: "review";
  message: string | null;
};

type PageState = { kind: "hub" } | PreviewState | ReviewState;

function createReviewItem(
  item: PurchaseIntakeResponse["items"][number],
  clientId: string
): PurchaseIntakeReviewItem {
  return {
    ...item,
    clientId,
    currentInventoryQuantity: null,
    manualReviewed: item.confidence >= 0.8,
    supplierCode: null,
    supplierLastPrice: null,
    supplierLastPurchaseDate: null,
    supplierName: null,
    supplierPackSize: null,
    supplierProductCode: null,
    supplierProductId: null,
    supplierProductName: null,
    supplierPurchaseCount: null
  };
}

function emptyReviewItem(clientId: string): PurchaseIntakeReviewItem {
  return createReviewItem(
    {
      confidence: 1,
      department: null,
      notes: null,
      product_name: "",
      quantity: null,
      raw_text: "",
      unit: null
    },
    clientId
  );
}

function nullableText(value: string) {
  return value.trim() ? value : null;
}

function fileKind(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleUpperCase("en-GB") ?? "文件";
  if (file.type === "application/pdf" || extension === "PDF") {
    return "PDF 文档";
  }
  if (["XLSX", "XLS", "CSV"].includes(extension)) {
    return `表格 / ${extension}`;
  }
  return "图片";
}

export function PurchasingPage() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const clientIdCounter = useRef(0);
  const sourceCloseRef = useRef<HTMLButtonElement>(null);
  const sourceDialogRef = useRef<HTMLElement>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const matchingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [state, setState] = useState<PageState>({ kind: "hub" });
  const [matchingClientId, setMatchingClientId] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const previewUrl = state.kind === "preview" || state.kind === "recognising" ? state.previewUrl : null;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (showSource) {
      sourceCloseRef.current?.focus();
    }
  }, [showSource]);

  const requiresManualReview = useMemo(
    () =>
      state.kind === "review" &&
      state.items.some((item) => item.confidence < 0.8 && !item.manualReviewed),
    [state]
  );

  function nextClientId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    clientIdCounter.current += 1;
    return `purchase-row-${clientIdCounter.current}`;
  }

  function chooseFile(file: File | undefined, source: "camera" | "manual") {
    if (!file) {
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(file);
    setShowSource(false);
    setMatchingClientId(null);
    setState({ error: null, file, kind: "preview", previewUrl: nextPreviewUrl, source });
  }

  function fileChange(source: "camera" | "manual") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      chooseFile(file, source);
    };
  }

  async function recognise() {
    if (state.kind !== "preview") {
      return;
    }
    const preview = state;
    setState({ ...preview, kind: "recognising" });
    try {
      const intake = await parseIntake(preview.file);
      setState({
        action: "idle",
        handedOff: false,
        intake,
        items: intake.items.map((item) => createReviewItem(item, nextClientId())),
        kind: "review",
        message: null
      });
    } catch (error) {
      setState({
        ...preview,
        error: error instanceof Error ? error.message : "识别失败，请稍后重试。",
        kind: "preview"
      });
    }
  }

  function updateItem(clientId: string, update: Partial<PurchaseIntakeReviewItem>) {
    setState((current) =>
      current.kind === "review" && !current.handedOff && current.action === "idle"
        ? { ...current, items: current.items.map((item) => (item.clientId === clientId ? { ...item, ...update } : item)) }
        : current
    );
  }

  function removeItem(clientId: string) {
    setState((current) =>
      current.kind === "review" && !current.handedOff && current.action === "idle"
        ? { ...current, items: current.items.filter((item) => item.clientId !== clientId) }
        : current
    );
  }

  function addItem() {
    setState((current) =>
      current.kind === "review" && !current.handedOff && current.action === "idle"
        ? { ...current, items: [...current.items, emptyReviewItem(nextClientId())] }
        : current
    );
  }

  function chooseProduct(product: HistoricalProductCard) {
    if (!matchingClientId || state.kind !== "review" || state.handedOff || state.action !== "idle") {
      return;
    }
    updateItem(matchingClientId, {
      currentInventoryQuantity: product.currentInventoryQuantity,
      product_name: product.productName,
      supplierCode: product.supplierCode,
      supplierLastPrice: product.latestPrice,
      supplierLastPurchaseDate: product.latestPurchaseDate,
      supplierName: product.supplierName,
      supplierPackSize: product.packSize,
      supplierProductCode: product.supplierProductCode,
      supplierProductId: product.id,
      supplierProductName: product.productName,
      supplierPurchaseCount: product.purchaseCount
    });
    closeMatching();
  }

  function openMatching(event: React.MouseEvent<HTMLButtonElement>, clientId: string) {
    matchingTriggerRef.current = event.currentTarget;
    setMatchingClientId(clientId);
  }

  function closeMatching() {
    setMatchingClientId(null);
  }

  function openSource(event: React.MouseEvent<HTMLButtonElement>) {
    sourceTriggerRef.current = event.currentTarget;
    setShowSource(true);
  }

  function closeSource() {
    setShowSource(false);
    queueMicrotask(() => sourceTriggerRef.current?.focus());
  }

  function handleSourceDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSource();
      return;
    }
    if (event.key !== "Tab" || !sourceDialogRef.current) {
      return;
    }
    const focusable = [...sourceDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), iframe')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function clearProduct(clientId: string) {
    updateItem(clientId, {
      currentInventoryQuantity: null,
      supplierCode: null,
      supplierLastPrice: null,
      supplierLastPurchaseDate: null,
      supplierName: null,
      supplierPackSize: null,
      supplierProductCode: null,
      supplierProductId: null,
      supplierProductName: null,
      supplierPurchaseCount: null
    });
  }

  async function saveDraft() {
    if (state.kind !== "review" || state.handedOff || requiresManualReview || state.items.length === 0) {
      return;
    }
    const review = state;
    setState({ ...review, action: "saving", message: null });
    try {
      await savePendingIntake(review.intake.intakeId, review.items);
      setState({ ...review, action: "idle", message: "草稿已保存" });
    } catch (error) {
      setState({
        ...review,
        action: "idle",
        message: error instanceof Error ? error.message : "保存失败，请稍后重试。"
      });
    }
  }

  async function handOff() {
    if (state.kind !== "review" || state.handedOff || requiresManualReview || state.items.length === 0) {
      return;
    }
    const review = state;
    setState({ ...review, action: "handing-off", message: null });
    try {
      await readyForPurchase(review.intake.intakeId, review.items);
      setState({ ...review, action: "idle", handedOff: true, message: "已转入采购清单" });
    } catch (error) {
      setState({
        ...review,
        action: "idle",
        message: error instanceof Error ? error.message : "转入失败，请稍后重试。"
      });
    }
  }

  const matchingItem =
    state.kind === "review" && !state.handedOff && state.action === "idle"
      ? state.items.find((item) => item.clientId === matchingClientId) ?? null
      : null;

  return (
    <main className="purchasing-page-shell">
      <section className="purchasing-page-panel" aria-labelledby="purchasing-page-title">
        <a className="purchasing-back-link" href="#">返回首页</a>
        <p className="purchasing-page-eyebrow">采购信息收集</p>
        <h1 id="purchasing-page-title">AI录入</h1>

        <input
          accept={imageAccept}
          aria-label="拍照录入采购信息"
          capture="environment"
          className="purchasing-file-input"
          onChange={fileChange("camera")}
          ref={cameraInputRef}
          type="file"
        />
        <input
          accept={manualAccept}
          aria-label="选择手动上传文件"
          className="purchasing-file-input"
          onChange={fileChange("manual")}
          ref={manualInputRef}
          type="file"
        />

        {state.kind === "hub" && (
          <div className="purchasing-hub" aria-label="录入方式">
            <button onClick={() => cameraInputRef.current?.click()} type="button">
              <Camera aria-hidden="true" size={28} />
              <span><strong>AI拍照识别录入</strong><small aria-hidden="true">拍摄白板或手写采购清单</small></span>
            </button>
            <button onClick={() => manualInputRef.current?.click()} type="button">
              <Upload aria-hidden="true" size={28} />
              <span><strong>手动上传录入</strong><small aria-hidden="true">图片、PDF、Excel 或 CSV</small></span>
            </button>
          </div>
        )}

        {(state.kind === "preview" || state.kind === "recognising") && (
          <section className="purchasing-preview-state" aria-label="文件预览">
            {state.file.type.startsWith("image/") && state.previewUrl ? (
              <img alt="采购文件图片预览" className="purchasing-preview-image" src={state.previewUrl} />
            ) : (
              <div className="purchasing-file-preview">
                {state.file.type === "application/pdf" ? <FileText aria-hidden="true" size={36} /> : <FileSpreadsheet aria-hidden="true" size={36} />}
                <div><strong>{state.file.name}</strong><span>{fileKind(state.file)}</span></div>
              </div>
            )}
            {state.previewUrl && !state.file.type.startsWith("image/") && (
              <a className="purchasing-preview-source-link" href={state.previewUrl} rel="noreferrer" target="_blank">查看原始文件</a>
            )}
            {state.error && (
              <div className="purchase-error" role="alert">
                <p>{state.error}</p>
                <button onClick={() => void recognise()} type="button">重试识别</button>
              </div>
            )}
            <div className="purchasing-preview-actions">
              {state.source === "camera" && <button disabled={state.kind === "recognising"} onClick={() => cameraInputRef.current?.click()} type="button">重新拍照</button>}
              <button disabled={state.kind === "recognising"} onClick={() => manualInputRef.current?.click()} type="button">选择其他文件</button>
              <button className="purchasing-primary-action" disabled={state.kind === "recognising"} onClick={() => void recognise()} type="button">
                {state.kind === "recognising" ? "识别中..." : "开始识别"}
              </button>
            </div>
          </section>
        )}

        {state.kind === "review" && (
          <section className="purchase-review" aria-labelledby="purchase-review-title">
            <header className="purchase-review-heading">
              <div>
                <h2 id="purchase-review-title">核对采购项目</h2>
                <p>{state.intake.originalFilename}{state.intake.generalNotes ? ` · ${state.intake.generalNotes}` : ""}</p>
              </div>
              <button className="purchasing-source-button" onClick={openSource} type="button">
                <Eye aria-hidden="true" size={18} />查看原始文件
              </button>
            </header>

            {state.intake.unreadableText.length > 0 && <p className="purchase-review-note">未识别文字：{state.intake.unreadableText.join("、")}</p>}
            {state.message && <p className="purchasing-status-message" role="status">{state.message}</p>}

            <div className="purchase-review-table" role="table" aria-label="采购项目核对表">
              {state.items.map((item, index) => {
                const number = index + 1;
                const lowConfidence = item.confidence < 0.8;
                const reviewLocked = state.handedOff || state.action !== "idle";
                return (
                  <article className={`purchase-review-row${lowConfidence ? " purchase-review-row-low-confidence" : ""}`} data-testid={`purchase-review-row-${number}`} key={item.clientId} role="row">
                    <div className="purchase-review-fields">
                      <label><span>部门</span><input aria-label={`部门 ${number}`} disabled={reviewLocked} onChange={(event) => updateItem(item.clientId, { department: nullableText(event.target.value) })} value={item.department ?? ""} /></label>
                      <label className="purchase-product-field"><span>产品名称</span><input aria-label={`产品名称 ${number}`} disabled={reviewLocked} onChange={(event) => updateItem(item.clientId, { product_name: event.target.value })} value={item.product_name} /></label>
                      <label><span>数量</span><input aria-label={`数量 ${number}`} disabled={reviewLocked} inputMode="decimal" min="0" onChange={(event) => updateItem(item.clientId, { quantity: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={item.quantity ?? ""} /></label>
                      <label><span>单位</span><input aria-label={`单位 ${number}`} disabled={reviewLocked} onChange={(event) => updateItem(item.clientId, { unit: nullableText(event.target.value) })} value={item.unit ?? ""} /></label>
                      <label><span>备注</span><input aria-label={`备注 ${number}`} disabled={reviewLocked} onChange={(event) => updateItem(item.clientId, { notes: nullableText(event.target.value) })} value={item.notes ?? ""} /></label>
                    </div>
                    <div className="purchase-review-meta">
                      <label className="purchase-review-check">
                        <input aria-label={`已人工核对 ${number}`} checked={item.manualReviewed} disabled={reviewLocked} onChange={(event) => updateItem(item.clientId, { manualReviewed: event.target.checked })} type="checkbox" />
                        <span>{lowConfidence ? "已人工核对（必填）" : "已人工核对"}</span>
                      </label>
                      <span className={item.supplierProductId ? "purchase-match-state purchase-match-state-ok" : "purchase-match-state"}>{item.supplierProductId ? `${item.supplierName} · ${item.supplierProductCode}` : "待匹配"}</span>
                      <button disabled={reviewLocked} onClick={(event) => openMatching(event, item.clientId)} type="button">匹配发票商品 {item.product_name}</button>
                      {item.supplierProductId && <button disabled={reviewLocked} onClick={() => clearProduct(item.clientId)} type="button">清除匹配</button>}
                      <button aria-label={`删除第 ${number} 行`} className="purchasing-icon-button" disabled={reviewLocked} onClick={() => removeItem(item.clientId)} title={`删除第 ${number} 行`} type="button"><Trash2 aria-hidden="true" size={18} /></button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="purchase-review-actions">
              <button disabled={state.handedOff || state.action !== "idle"} onClick={addItem} type="button"><Plus aria-hidden="true" size={18} />新增一行</button>
              <button disabled={state.handedOff || state.action !== "idle" || requiresManualReview || state.items.length === 0} onClick={() => void saveDraft()} type="button">{state.action === "saving" ? "保存中..." : "保存草稿"}</button>
              <button className="purchasing-primary-action" disabled={state.handedOff || state.action !== "idle" || requiresManualReview || state.items.length === 0} onClick={() => void handOff()} type="button">{state.action === "handing-off" ? "转入中..." : "转入采购清单"}</button>
            </div>
          </section>
        )}
      </section>

      {matchingItem && <ProductMatchDialog itemName={matchingItem.product_name} onChoose={chooseProduct} onClose={closeMatching} returnFocusElement={matchingTriggerRef.current} selectedProductId={matchingItem.supplierProductId} />}

      {showSource && state.kind === "review" && (
        <div className="purchase-image-dialog-backdrop">
          <section aria-label="原始采购文件" aria-modal="true" className="purchase-image-dialog" onKeyDown={handleSourceDialogKeyDown} ref={sourceDialogRef} role="dialog">
            <div className="purchase-image-dialog-heading"><h2>原始采购文件</h2><button onClick={closeSource} ref={sourceCloseRef} type="button">关闭</button></div>
            {state.intake.sourceType === "image" || state.intake.sourceType === "camera" ? <img alt="原始采购文件" src={state.intake.sourceUrl} /> : <iframe src={state.intake.sourceUrl} title="原始采购文件" />}
          </section>
        </div>
      )}
    </main>
  );
}
