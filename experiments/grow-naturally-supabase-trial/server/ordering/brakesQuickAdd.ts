import { chromium, type BrowserContext, type Page } from "playwright";
import type { BrakesQuickAddInput, BrakesQuickAddResult, BrakesQuickAddRunner, PurchaseBatchItem } from "./types";

export type BrakesQuickAddAdapter = {
  openCart(): Promise<void>;
  fillProductCode(code: string): Promise<void>;
  fillQuantity(quantity: number): Promise<void>;
  clickAdd(): Promise<void>;
  readResult(productCode: string): Promise<"confirmed" | "invalid" | "ambiguous">;
};

export function createBrakesQuickAddRunner(input: {
  adapter?: BrakesQuickAddAdapter;
  adapterFactory?: () => Promise<BrakesQuickAddAdapter>;
  profilePath?: string;
}): BrakesQuickAddRunner {
  let adapterPromise: Promise<BrakesQuickAddAdapter> | null = null;
  const getAdapter = async () => {
    if (input.adapter) return Promise.resolve(input.adapter);
    adapterPromise ??= input.adapterFactory?.() ?? createPlaywrightAdapter(input.profilePath || "local-data/brakes-chrome-profile");
    try {
      return await adapterPromise;
    } catch (error) {
      adapterPromise = null;
      throw error;
    }
  };
  const openCart = async () => {
    let adapter = await getAdapter();
    try {
      await adapter.openCart();
      return adapter;
    } catch (error) {
      if (input.adapter || !isClosedBrowserError(error)) throw error;
      adapterPromise = null;
      adapter = await getAdapter();
      await adapter.openCart();
      return adapter;
    }
  };

  return {
    async fill(items) {
      let adapter: BrakesQuickAddAdapter;
      try {
        adapter = await openCart();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Brakes Quick Add 无法打开购物车。";
        return items.map((item) => ({ itemId: item.itemId, status: "Failed" as const, message }));
      }
      const results: BrakesQuickAddResult[] = [];
      for (const item of items) {
        try {
          await adapter.fillProductCode(item.productCode);
          await adapter.fillQuantity(item.quantity);
          await adapter.clickAdd();
          const outcome = await adapter.readResult(item.productCode);
          results.push({
            itemId: item.itemId,
            status: outcome === "confirmed" ? "Added" : outcome === "invalid" ? "InvalidCode" : "AwaitingConfirmation",
            message: outcome === "invalid" ? "Brakes 明确返回产品编码无效。" : null
          });
        } catch (error) {
          results.push({ itemId: item.itemId, status: "Failed", message: error instanceof Error ? error.message : "Brakes Quick Add 填写失败。" });
        }
      }
      return results;
    }
  };
}

function isClosedBrowserError(error: unknown): boolean {
  return error instanceof Error && /target page, context or browser has been closed/i.test(error.message);
}

export function buildRetryQueue(
  items: Array<BrakesQuickAddInput & Pick<PurchaseBatchItem, "brakesStatus">>
): BrakesQuickAddInput[] {
  return items.filter((item) => item.brakesStatus !== "Added").map(({ itemId, productCode, quantity }) => ({ itemId, productCode, quantity }));
}

async function createPlaywrightAdapter(profilePath: string): Promise<BrakesQuickAddAdapter> {
  const context = await chromium.launchPersistentContext(profilePath, brakesChromeLaunchOptions());
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());
  return pageAdapter(page, context);
}

export function brakesChromeLaunchOptions() {
  return {
    channel: "chrome",
    headless: false,
    ignoreDefaultArgs: ["--no-sandbox", "--disable-setuid-sandbox"]
  };
}

function pageAdapter(page: Page, _context: BrowserContext): BrakesQuickAddAdapter {
  const codeInput = () => page.locator('input[placeholder="Product code"]:visible, input[name*="productCode"]:visible, input[aria-label*="Product code" i]:visible').first();
  const quantityInput = () => page.locator('input[placeholder="qty"]:visible, input[name*="quantity"]:visible, input[aria-label*="Quantity" i]:visible').first();
  return {
    async openCart() { await page.goto("https://www.brake.co.uk/cart", { waitUntil: "domcontentloaded" }); },
    async fillProductCode(code) {
      const input = codeInput();
      if (!(await input.isVisible())) throw new Error("Brakes Quick Add 页面已变化。");
      await input.fill(code);
    },
    async fillQuantity(quantity) {
      const input = quantityInput();
      if (!(await input.isVisible())) throw new Error("Brakes Quick Add 页面已变化。");
      await input.fill(String(quantity));
    },
    async clickAdd() {
      const currentQuickAddButton = page.getByRole("button", { name: "Add Product to Quick Order" });
      const button = await currentQuickAddButton.isVisible().catch(() => false)
        ? currentQuickAddButton
        : page.getByRole("button", { name: /quick add|add/i }).first();
      if (!(await button.isVisible())) throw new Error("Brakes Quick Add 页面已变化。");
      await button.click();
    },
    async readResult(productCode) {
      const invalid = page.getByText(/invalid|not found|not recognised/i).first();
      if (await invalid.isVisible().catch(() => false)) return "invalid";
      const confirmed = page.locator(`a[href*="/${productCode}"]`).first();
      return (await confirmed.isVisible().catch(() => false)) ? "confirmed" : "ambiguous";
    }
  };
}
