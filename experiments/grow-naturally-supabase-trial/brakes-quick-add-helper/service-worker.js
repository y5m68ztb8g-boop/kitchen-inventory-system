const APP_ORIGINS = ["http://127.0.0.1:5174", "http://127.0.0.1:5173"];

chrome.commands.onCommand.addListener(() => void toggleActiveTab());
chrome.action.onClicked.addListener(() => void toggleActiveTab());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const url = new URL(changeInfo.url);
  if (url.hostname === "www.brake.co.uk" && url.searchParams.get("tintohotel-quick-add") === "1") {
    void chrome.storage.local.set({ tintohotelQuickAddPendingAt: Date.now() });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TINTO_GET_BRAKES_ITEMS") {
    void readBrakesItems().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type === "TINTO_SHOULD_OPEN_BRAKES_HELPER") {
    void shouldOpenPendingHelper().then((shouldOpen) => sendResponse({ shouldOpen }));
    return true;
  }
  if (message?.type === "TINTO_CONSUME_BRAKES_HELPER") {
    void chrome.storage.local.remove("tintohotelQuickAddPendingAt").then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function toggleActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://www.brake.co.uk/")) return;
  await chrome.tabs.sendMessage(tab.id, { type: "TINTO_TOGGLE_BRAKES_HELPER" });
}

async function readBrakesItems() {
  let lastError = "库存系统当前没有运行。";
  for (const origin of APP_ORIGINS) {
    try {
      const response = await fetch(`${origin}/api/ordering/current`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const items = Array.isArray(payload?.batch?.items) ? payload.batch.items : [];
      return { items: items
        .filter((item) => item.supplierGroup === "BRK" && String(item.supplierProductCode || "").trim() && Number(item.orderQuantity) > 0)
        .map((item) => ({ code: String(item.supplierProductCode).trim(), name: item.productName, quantity: Number(item.orderQuantity) })) };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function shouldOpenPendingHelper() {
  const { tintohotelQuickAddPendingAt } = await chrome.storage.local.get("tintohotelQuickAddPendingAt");
  const pendingAt = Number(tintohotelQuickAddPendingAt);
  if (!Number.isFinite(pendingAt)) return false;
  if (Date.now() - pendingAt <= 2 * 60 * 60 * 1000) return true;
  await chrome.storage.local.remove("tintohotelQuickAddPendingAt");
  return false;
}
