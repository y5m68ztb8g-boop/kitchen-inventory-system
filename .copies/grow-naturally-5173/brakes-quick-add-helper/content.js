let panel;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TINTO_TOGGLE_BRAKES_HELPER") void togglePanel();
});

void openPendingHelperWhenReady();

async function openPendingHelperWhenReady() {
  const response = await chrome.runtime.sendMessage({ type: "TINTO_SHOULD_OPEN_BRAKES_HELPER" });
  if (!response?.shouldOpen || !(await waitForQuickAdd())) return;
  await togglePanel();
  await chrome.runtime.sendMessage({ type: "TINTO_CONSUME_BRAKES_HELPER" });
}

function waitForQuickAdd() {
  if (/quick add/i.test(document.body?.innerText || "")) return Promise.resolve(true);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!/quick add/i.test(document.body?.innerText || "")) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(true);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => { observer.disconnect(); resolve(false); }, 15000);
  });
}

async function togglePanel() {
  if (panel?.isConnected) {
    panel.remove();
    panel = null;
    return;
  }
  panel = document.createElement("div");
  panel.id = "tintohotel-brakes-helper";
  panel.innerHTML = markup("正在读取下单清单...");
  document.documentElement.append(panel);
  bindClose();

  const response = await chrome.runtime.sendMessage({ type: "TINTO_GET_BRAKES_ITEMS" });
  if (!panel?.isConnected) return;
  if (response?.error) {
    panel.innerHTML = markup(`读取失败：${escapeHtml(response.error)}`);
    bindClose();
    return;
  }
  const items = response?.items || [];
  panel.innerHTML = `<style>${styles}</style>
    <header><div><small>Tintohotel</small><strong>Brakes 下单清单</strong></div><button data-close title="关闭">×</button></header>
    <main>${items.length ? items.map(itemMarkup).join("") : "<p class='empty'>当前没有 Brakes 商品</p>"}</main>
    <footer>点击编码或数量即可复制 · ⌘⇧Y 收起</footer>`;
  bindClose();
  panel.querySelectorAll("button[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const original = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => { button.textContent = original; }, 1000);
  }));
}

function markup(message) {
  return `<style>${styles}</style><header><div><small>Tintohotel</small><strong>Brakes 下单清单</strong></div><button data-close title="关闭">×</button></header><main><p class="empty">${message}</p></main>`;
}

function itemMarkup(item) {
  return `<article><div title="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong></div><button data-copy="${escapeHtml(item.code)}"><small>编码</small>${escapeHtml(item.code)}</button><button data-copy="${item.quantity}"><small>数量</small>${item.quantity}</button></article>`;
}

function bindClose() {
  panel.querySelector("[data-close]")?.addEventListener("click", () => { panel.remove(); panel = null; });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]);
}

const styles = `
  #tintohotel-brakes-helper { all:initial; background:#fff; border:1px solid #b9c8bd; box-shadow:0 12px 42px rgba(20,30,23,.28); color:#18231c; display:block; font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; max-height:calc(100vh - 32px); overflow:hidden; position:fixed; right:16px; top:16px; width:min(420px,calc(100vw - 32px)); z-index:2147483647; }
  #tintohotel-brakes-helper * { box-sizing:border-box; letter-spacing:0; }
  #tintohotel-brakes-helper header { align-items:center; background:#f3f7f4; border-bottom:1px solid #d9e1db; display:flex; justify-content:space-between; padding:12px 14px; }
  #tintohotel-brakes-helper header div { display:grid; gap:2px; } #tintohotel-brakes-helper header small { color:#66746a; font-size:11px; } #tintohotel-brakes-helper header strong { font-size:16px; }
  #tintohotel-brakes-helper header button { background:transparent; border:0; color:#536158; cursor:pointer; font-size:25px; line-height:1; padding:4px 7px; }
  #tintohotel-brakes-helper main { max-height:calc(100vh - 142px); overflow:auto; }
  #tintohotel-brakes-helper article { align-items:center; border-bottom:1px solid #e8ece9; display:grid; gap:8px; grid-template-columns:minmax(0,1fr) 88px 64px; padding:10px 12px; }
  #tintohotel-brakes-helper article div { min-width:0; } #tintohotel-brakes-helper article strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #tintohotel-brakes-helper article button { background:#fff; border:1px solid #aebdb2; border-radius:5px; color:#1f4f31; cursor:pointer; display:grid; gap:2px; min-height:43px; padding:5px 7px; }
  #tintohotel-brakes-helper article button:hover { background:#edf6ef; border-color:#6e9278; } #tintohotel-brakes-helper article button small { color:#6a776e; font-size:10px; font-weight:400; }
  #tintohotel-brakes-helper footer { background:#fafcfb; color:#6c776f; font-size:11px; padding:9px 12px; text-align:center; } #tintohotel-brakes-helper .empty { color:#69756d; margin:0; padding:22px 14px; text-align:center; }
`;
