import { Check, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { searchHistoricalProducts } from "./api";
import type { HistoricalProductCard } from "./types";
import "./ProductMatchDialog.css";

type ProductMatchDialogProps = {
  itemName: string;
  onChoose: (product: HistoricalProductCard) => void;
  onClose: () => void;
  returnFocusElement: HTMLElement | null;
  selectedProductId: string | null;
};

const priceFormatter = new Intl.NumberFormat("en-GB", { currency: "GBP", style: "currency" });

export function ProductMatchDialog({ itemName, onChoose, onClose, returnFocusElement, selectedProductId }: ProductMatchDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState(itemName);
  const [products, setProducts] = useState<HistoricalProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => returnFocusElement?.focus();
  }, [returnFocusElement]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void searchHistoricalProducts(query)
      .then(({ candidates }) => {
        if (active) {
          setProducts(candidates);
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : "历史商品搜索失败。 ");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [query]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]')];
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

  return (
    <div className="product-match-backdrop">
      <section aria-label={`匹配发票商品 ${itemName}`} aria-modal="true" className="product-match-dialog" onKeyDown={handleDialogKeyDown} ref={dialogRef} role="dialog">
        <header className="product-match-header">
          <div>
            <p>历史发票商品</p>
            <h2>选择对应商品</h2>
          </div>
          <button aria-label="关闭商品匹配" className="purchasing-icon-button" onClick={onClose} title="关闭" type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <label className="product-match-search">
          <span>搜索产品、供应商或编码</span>
          <div>
            <Search aria-hidden="true" size={18} />
            <input aria-label="搜索历史发票商品" autoFocus onChange={(event) => setQuery(event.target.value)} value={query} />
          </div>
        </label>

        {loading && <p className="product-match-message">正在搜索...</p>}
        {error && <p className="product-match-error" role="alert">{error}</p>}
        {!loading && !error && products.length === 0 && <p className="product-match-message">没有找到历史商品。</p>}

        <div className="product-match-results">
          {products.map((product) => {
            const selected = product.id === selectedProductId;
            return (
              <article className={`product-match-card${selected ? " product-match-card-selected" : ""}`} key={product.id}>
                <div className="product-match-card-heading">
                  <div>
                    {product.isRecommended && <span className="product-match-recommended">推荐购买</span>}
                    <h3>{product.productName}</h3>
                    <p>{product.supplierName}</p>
                  </div>
                  {selected && <Check aria-label="当前已匹配" size={20} />}
                </div>
                <dl>
                  <div><dt>供应商编码</dt><dd>{product.supplierCode || "-"}</dd></div>
                  <div><dt>产品编码</dt><dd>{product.supplierProductCode || "-"}</dd></div>
                  <div><dt>规格</dt><dd>{product.packSize || "-"}</dd></div>
                  <div><dt>最后价格</dt><dd>{priceFormatter.format(product.latestPrice)}</dd></div>
                  <div><dt>采购次数</dt><dd>{product.purchaseCount}</dd></div>
                  <div><dt>最后采购</dt><dd>{product.latestPurchaseDate || "-"}</dd></div>
                  <div><dt>当前库存</dt><dd>{product.currentInventoryQuantity ?? 0}</dd></div>
                </dl>
                <button className="purchasing-primary-action" onClick={() => onChoose(product)} type="button">
                  选择 {product.productName}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
