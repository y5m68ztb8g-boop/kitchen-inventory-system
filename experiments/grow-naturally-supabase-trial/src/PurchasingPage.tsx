import { useEffect, useMemo, useRef, useState } from "react";

import "./PurchasingPage.css";
import { confirmWhiteboardScan, scanWhiteboard, type WhiteboardConfirmationResponse, type WhiteboardScanResponse } from "./purchasing/api";
import type { WhiteboardReviewItem } from "./purchasing/types";

const acceptedImageTypes = "image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif";

type ReviewState = {
  generalNotes: string | null;
  imageUrl: string;
  items: WhiteboardReviewItem[];
  scanId: string;
  unreadableText: string[];
};

type PurchasingState =
  | { kind: "idle" }
  | { file: File; kind: "preview"; previewUrl: string }
  | { file: File; kind: "recognising"; previewUrl: string }
  | ({ kind: "review" } & ReviewState)
  | ({ kind: "saving" } & ReviewState)
  | { kind: "saved"; result: WhiteboardConfirmationResponse }
  | { kind: "error"; message: string };

function reviewItem(
  item: WhiteboardScanResponse["items"][number],
  createClientId: () => string
): WhiteboardReviewItem {
  return { ...item, clientId: createClientId(), manualReviewed: item.confidence >= 0.8 };
}

function emptyReviewItem(createClientId: () => string): WhiteboardReviewItem {
  return {
    clientId: createClientId(),
    confidence: 1,
    department: null,
    manualReviewed: true,
    notes: null,
    product_name: "",
    quantity: null,
    raw_text: "",
    unit: null
  };
}

function textValue(value: string | null) {
  return value ?? "";
}

function nullableText(value: string) {
  return value.trim() ? value : null;
}

function formatPrice(value: number | null) {
  return value === null ? "-" : new Intl.NumberFormat("en-GB", { currency: "GBP", style: "currency" }).format(value);
}

export function PurchasingPage() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chooserInputRef = useRef<HTMLInputElement>(null);
  const clientIdCounter = useRef(0);
  const [state, setState] = useState<PurchasingState>({ kind: "idle" });
  const [showOriginalImage, setShowOriginalImage] = useState(false);
  const previewUrl = state.kind === "preview" || state.kind === "recognising" ? state.previewUrl : null;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const review = state.kind === "review" || state.kind === "saving" ? state : null;
  const requiresManualReview = useMemo(
    () => Boolean(review?.items.some((item) => item.confidence < 0.8 && !item.manualReviewed)),
    [review]
  );

  function createClientId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    clientIdCounter.current += 1;
    return `purchase-row-${clientIdCounter.current}`;
  }

  function selectFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setShowOriginalImage(false);
    setState({ file, kind: "preview", previewUrl: URL.createObjectURL(file) });
  }

  async function recognise() {
    if (state.kind !== "preview") {
      return;
    }

    const { file, previewUrl: nextPreviewUrl } = state;
    setState({ file, kind: "recognising", previewUrl: nextPreviewUrl });
    try {
      const response = await scanWhiteboard(file);
      setState({
        generalNotes: response.generalNotes,
        imageUrl: response.imageUrl,
        items: response.items.map((item) => reviewItem(item, createClientId)),
        kind: "review",
        scanId: response.scanId,
        unreadableText: response.unreadableText
      });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "识别失败，请稍后重试。" });
    }
  }

  function updateReviewItem(clientId: string, update: Partial<WhiteboardReviewItem>) {
    if (!review || state.kind !== "review") {
      return;
    }

    setState({ ...state, items: state.items.map((item) => (item.clientId === clientId ? { ...item, ...update } : item)) });
  }

  function deleteReviewItem(clientId: string) {
    if (!review || state.kind !== "review") {
      return;
    }

    setState({ ...state, items: state.items.filter((item) => item.clientId !== clientId) });
  }

  function addReviewItem() {
    if (!review || state.kind !== "review") {
      return;
    }

    setState({ ...state, items: [...state.items, emptyReviewItem(createClientId)] });
  }

  async function confirm() {
    if (!review || state.kind !== "review" || requiresManualReview) {
      return;
    }

    const savingState: PurchasingState = { ...state, kind: "saving" };
    setState(savingState);
    try {
      setState({ kind: "saved", result: await confirmWhiteboardScan(savingState.scanId, savingState.items) });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "保存失败，请稍后重试。" });
    }
  }

  return (
    <main className="purchasing-page-shell">
      <section className="purchasing-page-panel" aria-labelledby="purchasing-page-title">
        <p className="purchasing-page-eyebrow">采购白板</p>
        <h1 id="purchasing-page-title">采购白板识别</h1>

        <input
          accept={acceptedImageTypes}
          aria-label="拍摄采购白板"
          capture="environment"
          className="purchasing-file-input"
          disabled={state.kind === "recognising" || state.kind === "saving"}
          onChange={(event) => selectFile(event.target.files?.[0])}
          ref={cameraInputRef}
          type="file"
        />
        <input
          accept={acceptedImageTypes}
          aria-label="选择采购白板图片"
          className="purchasing-file-input"
          disabled={state.kind === "recognising" || state.kind === "saving"}
          onChange={(event) => selectFile(event.target.files?.[0])}
          ref={chooserInputRef}
          type="file"
        />

        {state.kind === "idle" && (
          <button className="purchasing-primary-action" onClick={() => cameraInputRef.current?.click()} type="button">
            Scan Purchase Whiteboard
          </button>
        )}

        {(state.kind === "preview" || state.kind === "recognising") && (
          <div className="purchasing-preview-state">
            <img alt="采购白板预览" className="purchasing-preview-image" src={state.previewUrl} />
            <div className="purchasing-preview-actions">
              <button disabled={state.kind === "recognising"} onClick={() => cameraInputRef.current?.click()} type="button">
                重新拍照
              </button>
              <button disabled={state.kind === "recognising"} onClick={() => chooserInputRef.current?.click()} type="button">
                选择其他图片
              </button>
              <button className="purchasing-primary-action" disabled={state.kind === "recognising"} onClick={() => void recognise()} type="button">
                {state.kind === "recognising" ? "识别中" : "开始识别"}
              </button>
            </div>
          </div>
        )}

        {review && (
          <section className="purchase-review" aria-labelledby="purchase-review-title">
            <div className="purchase-review-heading">
              <div>
                <h2 id="purchase-review-title">核对采购项目</h2>
                {review.generalNotes && <p>{review.generalNotes}</p>}
              </div>
              <button onClick={() => setShowOriginalImage(true)} type="button">
                查看原始图片
              </button>
            </div>
            {review.unreadableText.length > 0 && <p className="purchase-review-note">未识别文字：{review.unreadableText.join("、")}</p>}
            <div className="purchase-review-table" role="table" aria-label="采购项目核对表">
              {review.items.map((item, index) => {
                const number = index + 1;
                const lowConfidence = item.confidence < 0.8;
                return (
                  <div
                    className={`purchase-review-row${lowConfidence ? " purchase-review-row-low-confidence" : ""}`}
                    data-testid={`purchase-review-row-${number}`}
                    key={item.clientId}
                    role="row"
                  >
                    <label>
                      <span>部门</span>
                      <input aria-label={`部门 ${number}`} disabled={state.kind === "saving"} onChange={(event) => updateReviewItem(item.clientId, { department: nullableText(event.target.value) })} value={textValue(item.department)} />
                    </label>
                    <label>
                      <span>产品名称</span>
                      <input aria-label={`产品名称 ${number}`} disabled={state.kind === "saving"} onChange={(event) => updateReviewItem(item.clientId, { product_name: event.target.value })} value={item.product_name} />
                    </label>
                    <label>
                      <span>数量</span>
                      <input aria-label={`数量 ${number}`} disabled={state.kind === "saving"} inputMode="decimal" min="0" onChange={(event) => updateReviewItem(item.clientId, { quantity: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={item.quantity ?? ""} />
                    </label>
                    <label>
                      <span>单位</span>
                      <input aria-label={`单位 ${number}`} disabled={state.kind === "saving"} onChange={(event) => updateReviewItem(item.clientId, { unit: nullableText(event.target.value) })} value={textValue(item.unit)} />
                    </label>
                    <label>
                      <span>备注</span>
                      <input aria-label={`备注 ${number}`} disabled={state.kind === "saving"} onChange={(event) => updateReviewItem(item.clientId, { notes: nullableText(event.target.value) })} value={textValue(item.notes)} />
                    </label>
                    <label className="purchase-review-check">
                      <input aria-label={`已人工核对 ${number}`} checked={item.manualReviewed} disabled={state.kind === "saving"} onChange={(event) => updateReviewItem(item.clientId, { manualReviewed: event.target.checked })} type="checkbox" />
                      <span>{lowConfidence ? "已人工核对（必填）" : "已人工核对"}</span>
                    </label>
                    <button aria-label={`删除第 ${number} 行`} disabled={state.kind === "saving"} onClick={() => deleteReviewItem(item.clientId)} type="button">
                      删除
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="purchase-review-actions">
              <button disabled={state.kind === "saving"} onClick={addReviewItem} type="button">
                新增一行
              </button>
              <button className="purchasing-primary-action" disabled={state.kind === "saving" || requiresManualReview} onClick={() => void confirm()} type="button">
                {state.kind === "saving" ? "保存中" : "确认保存"}
              </button>
            </div>
          </section>
        )}

        {state.kind === "saved" && <SavedResults result={state.result} />}

        {state.kind === "error" && (
          <div className="purchase-error" role="alert">
            <p>{state.message}</p>
            <button onClick={() => setState({ kind: "idle" })} type="button">
              重新选择图片
            </button>
          </div>
        )}
      </section>

      {showOriginalImage && review && (
        <div className="purchase-image-dialog-backdrop">
          <section aria-label="原始采购白板" className="purchase-image-dialog" role="dialog">
            <div className="purchase-image-dialog-heading">
              <h2>原始采购白板</h2>
              <button aria-label="关闭图片" onClick={() => setShowOriginalImage(false)} type="button">
                关闭
              </button>
            </div>
            <img alt="原始采购白板" src={review.imageUrl} />
          </section>
        </div>
      )}
    </main>
  );
}

function SavedResults({ result }: { result: WhiteboardConfirmationResponse }) {
  return (
    <section className="purchase-saved" aria-labelledby="purchase-saved-title">
      <h2 id="purchase-saved-title">采购项目已保存</h2>
      {result.items.map((item) => (
        <section className="purchase-saved-row" key={item.clientId}>
          <div className="purchase-saved-row-heading">
            <strong>{item.productName}</strong>
            <span>Pending</span>
          </div>
          {item.recommendation ? (
            <dl className="purchase-recommendation-fields">
              <div><dt>推荐历史产品</dt><dd>{item.recommendation.recommendedProductName ?? "-"}</dd></div>
              <div><dt>供应商</dt><dd>{item.recommendation.recommendedSupplierName ?? "-"}</dd></div>
              <div><dt>供应商编码</dt><dd>{item.recommendation.recommendedSupplierCode ?? "-"}</dd></div>
              <div><dt>供应商产品代码</dt><dd>{item.recommendation.recommendedProductCode ?? "-"}</dd></div>
              <div><dt>包装规格</dt><dd>{item.recommendation.recommendedPackSize ?? "-"}</dd></div>
              <div><dt>最近采购价格</dt><dd>{formatPrice(item.recommendation.recommendedLastPrice)}</dd></div>
              <div><dt>采购次数</dt><dd>{item.recommendation.recommendedPurchaseCount ?? "-"}</dd></div>
              <div><dt>最近采购日期</dt><dd>{item.recommendation.recommendedLastPurchaseDate ?? "-"}</dd></div>
              <div><dt>当前库存数量</dt><dd>{item.recommendation.currentInventoryQuantity ?? "-"}</dd></div>
            </dl>
          ) : (
            <p>未找到可靠的历史匹配</p>
          )}
        </section>
      ))}
    </section>
  );
}
