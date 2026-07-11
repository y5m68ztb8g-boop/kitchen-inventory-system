import { Clipboard, ExternalLink, X } from "lucide-react";
import type { SupplierEmailDraft } from "./types";

export function EmailDraftDialog({
  draft,
  supplierName,
  onChange,
  onClose,
  onSave
}: {
  draft: SupplierEmailDraft;
  supplierName: string;
  onChange: (draft: SupplierEmailDraft) => void;
  onClose: () => void;
  onSave: (draft: SupplierEmailDraft) => Promise<void>;
}) {
  async function copyDraft() {
    const text = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
    await navigator.clipboard?.writeText(text);
  }

  async function openMail() {
    await onSave(draft);
    window.location.href = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  }

  return (
    <div className="ordering-dialog-backdrop">
      <section aria-label={`${supplierName} 邮件草稿`} aria-modal="true" className="ordering-dialog email-draft-dialog" role="dialog">
        <header>
          <div><p>可编辑预览</p><h2>{supplierName} 邮件草稿</h2></div>
          <button aria-label="关闭邮件草稿" className="ordering-icon-button" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <label><span>收件人</span><input aria-label="收件人" onChange={(event) => onChange({ ...draft, to: event.target.value })} value={draft.to} /></label>
        <label><span>标题</span><input aria-label="标题" onChange={(event) => onChange({ ...draft, subject: event.target.value })} value={draft.subject} /></label>
        <label><span>正文</span><textarea aria-label="正文" onChange={(event) => onChange({ ...draft, body: event.target.value })} rows={12} value={draft.body} /></label>
        <div className="ordering-dialog-actions">
          <button onClick={() => void onSave(draft)} type="button">保存草稿</button>
          <button aria-label="复制邮件内容" className="ordering-icon-command" onClick={() => void copyDraft()} type="button"><Clipboard size={18} />复制邮件内容</button>
          <button className="ordering-primary" onClick={() => void openMail()} type="button"><ExternalLink size={18} />打开邮件</button>
        </div>
      </section>
    </div>
  );
}
