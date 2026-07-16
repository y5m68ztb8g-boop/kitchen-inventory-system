import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { extractBrakesManualQueue, formatBrakesManualQueueLine } from "./brakesManualAssistant";
import type { PurchaseBatch } from "./types";

export function BrakesManualAssistantDialog({ batch, onClose }: { batch: PurchaseBatch; onClose: () => void }) {
  const items = extractBrakesManualQueue(batch);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1400);
  }

  return (
    <div className="ordering-dialog-backdrop">
      <section aria-label="Brakes 人工 Quick Add 助手" aria-modal="true" className="ordering-dialog ordering-brakes-helper-dialog" role="dialog">
        <header>
          <div><p>人工录入，不操作登录</p><h2>Brakes Quick Add 清单</h2></div>
          <button aria-label="关闭 Brakes 人工助手" className="ordering-icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <p className="ordering-dialog-intro">在你平时登录的 Brakes 购物车打开 Quick Add，再逐项复制编码和数量。安装本地插件后，可在 Brakes 页面按 ⌘⇧Y 显示同一份置顶清单。</p>
        <a className="ordering-brakes-cart-link ordering-primary" href="https://www.brake.co.uk/cart?tintohotel-quick-add=1" rel="noreferrer" target="_blank"><ExternalLink size={17} />打开 Brakes 购物车并显示清单</a>
        <div className="ordering-brakes-helper-items">
          {items.length === 0 && <p className="ordering-empty">当前没有可录入的 Brakes 商品。</p>}
          {items.map((item) => (
            <article className="ordering-brakes-helper-item" key={item.id}>
              <div><strong>{item.productName}</strong><span>{formatBrakesManualQueueLine(item)}</span></div>
              <button aria-label={`复制编码 ${item.code}`} onClick={() => void copy(item.code, `${item.id}-code`)} type="button">{copied === `${item.id}-code` ? <Check size={16} /> : <Copy size={16} />}编码</button>
              <button aria-label={`复制数量 ${item.quantity}`} onClick={() => void copy(String(item.quantity), `${item.id}-quantity`)} type="button">{copied === `${item.id}-quantity` ? <Check size={16} /> : <Copy size={16} />}数量</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
