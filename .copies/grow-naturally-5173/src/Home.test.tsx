import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { Home } from "./Home";
import { getCopy } from "./copy";
import { FREEZER_INVENTORY } from "./generated/freezerInventory";
import {
  buildInventoryEntry,
  calculateInventoryLineTotal,
  calculateInventoryTotal,
  formatEntryQuantity,
  getInventoryPackageCounts,
  getSupplierUnitsPerCase
} from "./inventoryStore";
import { findSupplierProduct, searchSupplierProducts } from "./supplierProducts";
import type { SupplierProduct } from "./supplierProducts";

function lineTotalFor(quantityText: string, supplierProduct: SupplierProduct) {
  const quantity = [...quantityText.matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .reduce((total, value) => total + value, 0);

  return calculateInventoryLineTotal({
    createdAt: "2026-07-08T00:00:00.000Z",
    id: `test-${supplierProduct.id}`,
    locationCode: "A1",
    position: "A1",
    productName: supplierProduct.productName,
    quantity: quantity || 1,
    quantityText,
    rack: "A货架",
    supplierProduct,
    unit: supplierProduct.packSize
  });
}

describe("Home", () => {
  const MOBILE_SEARCH_MEDIA_QUERY = "(max-width: 560px)";
  let restoreMatchMedia: (() => void) | null = null;

  function mockMatchMedia(matches: boolean) {
    const originalMatchMedia = window.matchMedia;
    let currentMatches = matches;
    const changeListeners = new Set<(event: MediaQueryListEvent) => void>();
    const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    });
    const removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === "change" && typeof listener === "function") {
        changeListeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    });
    const mediaQueryList = {
      get matches() {
        return currentMatches;
      },
      media: MOBILE_SEARCH_MEDIA_QUERY,
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true)
    } as MediaQueryList;

    window.matchMedia = vi.fn(() => mediaQueryList);

    restoreMatchMedia = () => {
      window.matchMedia = originalMatchMedia;
    };

    return {
      addEventListener,
      removeEventListener,
      triggerChange(nextMatches: boolean) {
        currentMatches = nextMatches;
        const event = { matches: nextMatches, media: MOBILE_SEARCH_MEDIA_QUERY } as MediaQueryListEvent;
        changeListeners.forEach((listener) => listener(event));
      }
    };
  }

  function dispatchPopStateWithSearchState(state: Record<string, unknown>) {
    const popStateEvent = new Event("popstate") as PopStateEvent;
    Object.defineProperty(popStateEvent, "state", {
      value: state,
      configurable: true
    });
    window.dispatchEvent(popStateEvent);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    if (restoreMatchMedia) {
      restoreMatchMedia();
      restoreMatchMedia = null;
    }
    vi.restoreAllMocks();
  });

  it("keeps Chinese and English copy available for future switching", () => {
    expect(getCopy("zh-CN").home.search).toBe("搜索");
    expect(getCopy("en-GB").home.search).toBe("Search");
    expect(getCopy("zh-CN").home.purchasing).toBe("AI录入");
    expect(["AI Intake", "Purchasing"]).toContain(getCopy("en-GB").home.purchasing);
    expect(getCopy("zh-CN").home.totalValue).toBe("产品库存总金额");
    expect(getCopy("en-GB").home.totalValue).toBe("Total Inventory Value");
  });

  it("shows the five home modules including the ordering entry", () => {
    render(<Home />);

    expect(screen.getByRole("button", { name: /搜索/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /区域/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI录入" })).toHaveAttribute("href", "#purchasing");
    expect(screen.getByRole("link", { name: "AI录入" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下单" })).toHaveAttribute("href", "#ordering");
    expect(screen.getByRole("link", { name: "下单" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /产品库存总金额/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "冷冻库金额" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "冷藏库金额" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "干货库金额" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "酒水库金额" })).toBeInTheDocument();
    expect(screen.queryByLabelText("未来功能预留")).not.toBeInTheDocument();
  });

  it("opens AI intake hub from home while preserving inventory links", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "区域" }));
    expect(screen.getByRole("link", { name: "冷冻库" })).toHaveAttribute("href", "#freezer");

    await user.click(screen.getByRole("link", { name: "AI录入" }));

    expect(screen.getByRole("button", { name: "AI拍照识别录入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动上传录入" })).toBeInTheDocument();
  });

  it("opens search input inside the home page", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /搜索/ }));

    expect(screen.getByPlaceholderText("搜索发票商品 / code")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入产品名称")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("keeps mobile search open when the current query is cleared", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    const productQueryInput = screen.getByPlaceholderText("输入产品名称");
    await user.type(productQueryInput, "Chicken Breast");
    await user.clear(productQueryInput);

    expect(screen.getByRole("button", { name: "关闭搜索" })).toBeVisible();
  });

  it("clears both searches after closing and reopening", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.type(screen.getByPlaceholderText("搜索发票商品 / code"), "milk");
    await user.type(screen.getByPlaceholderText("输入产品名称"), "chicken");
    await user.click(screen.getByRole("button", { name: "关闭搜索" }));
    await user.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.getByPlaceholderText("搜索发票商品 / code")).toHaveValue("");
    expect(screen.getByPlaceholderText("输入产品名称")).toHaveValue("");
  });

  it("closes mobile search on Escape", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.type(screen.getByPlaceholderText("输入产品名称"), "chicken");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "关闭搜索" })).not.toBeInTheDocument();
    const searchButton = screen.getByRole("button", { name: "搜索" });
    expect(searchButton).toBeInTheDocument();
    expect(searchButton).toHaveFocus();
    expect(back).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchPopStateWithSearchState({ homeSearchOpen: true });
    });

    expect(screen.queryByRole("button", { name: "关闭搜索" })).not.toBeInTheDocument();
    expect(back).toHaveBeenCalledTimes(1);

    await user.click(searchButton);

    expect(screen.getByPlaceholderText("搜索发票商品 / code")).toHaveValue("");
    expect(screen.getByPlaceholderText("输入产品名称")).toHaveValue("");
  });

  it("closes mobile search when a popstate event is received", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.type(screen.getByPlaceholderText("搜索发票商品 / code"), "F135-177");
    await user.type(screen.getByPlaceholderText("输入产品名称"), "chicken");

    act(() => {
      dispatchPopStateWithSearchState({ homeSearchOpen: true });
    });

    expect(screen.queryByRole("button", { name: "关闭搜索" })).not.toBeInTheDocument();
    const searchButton = screen.getByRole("button", { name: "搜索" });
    expect(searchButton).toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();

    await user.click(searchButton);

    expect(screen.getByPlaceholderText("搜索发票商品 / code")).toHaveValue("");
    expect(screen.getByPlaceholderText("输入产品名称")).toHaveValue("");
  });

  it("returns focus to search trigger after mobile close", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.click(screen.getByRole("button", { name: "关闭搜索" }));

    expect(screen.getByRole("button", { name: "搜索" })).toHaveFocus();
    expect(back).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchPopStateWithSearchState({ homeSearchOpen: true });
    });

    expect(screen.queryByRole("button", { name: "关闭搜索" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("pushes one history entry per mobile search open", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    const pushState = vi.spyOn(window.history, "pushState");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    expect(pushState).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "关闭搜索" }));
    await user.click(screen.getByRole("button", { name: "搜索" }));

    expect(pushState).toHaveBeenCalledTimes(2);
  });

  it("does not show a close control or push history on desktop", async () => {
    const user = userEvent.setup();
    mockMatchMedia(false);
    const pushState = vi.spyOn(window.history, "pushState");
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.queryByRole("button", { name: "关闭搜索" })).not.toBeInTheDocument();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("responds to matchMedia changes and removes the same listener on unmount", async () => {
    const user = userEvent.setup();
    const { addEventListener, removeEventListener, triggerChange } = mockMatchMedia(false);
    const pushState = vi.spyOn(window.history, "pushState");
    const { unmount } = render(<App />);
    const changeListener = addEventListener.mock.calls.find(([type]) => type === "change")?.[1];

    expect(changeListener).toEqual(expect.any(Function));

    act(() => {
      triggerChange(true);
    });
    await user.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.getByRole("button", { name: "关闭搜索" })).toBeVisible();
    expect(pushState).toHaveBeenCalledTimes(1);

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("change", changeListener);
  });

  it("searches invoice history and supplier code from the upper search field", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchExternalOpen = vi.fn().mockResolvedValue({ ok: true });
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      value: fetchExternalOpen
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: /搜索/ }));
    await user.type(screen.getByPlaceholderText("搜索发票商品 / code"), "F135-177");

    expect(screen.getByText("Sysco Prem Chunky Skin on Chips")).toBeInTheDocument();
    expect(screen.getByText("Brakes / Sysco GB Ltd")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("135177")).toBeInTheDocument();
    expect(screen.getByText("规格 4x2.5kg")).toBeInTheDocument();
    expect(screen.getByText("最后 £20.74")).toBeInTheDocument();
    expect(screen.getByText("采购 18 次")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "用默认浏览器打开 Brakes 135177" }));

    expect(fetchExternalOpen).toHaveBeenCalledWith(
      "/api/open-external",
      expect.objectContaining({
        body: JSON.stringify({ url: "https://www.brake.co.uk/search?text=135177" }),
        method: "POST"
      })
    );
    expect(windowOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "复制 135177" }));

    expect(writeText).toHaveBeenCalledWith("135177");
    expect(screen.getByText("已复制")).toBeInTheDocument();
  });

  it("does not restore copied state when clipboard completion arrives after mobile search closes", async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    let resolveWriteText: (() => void) | undefined;
    const writeTextPromise = new Promise<void>((resolve) => {
      resolveWriteText = resolve;
    });
    const writeText = vi.fn(() => writeTextPromise);
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    try {
      render(<App />);

      await user.click(screen.getByRole("button", { name: "搜索" }));
      await user.type(screen.getByPlaceholderText("搜索发票商品 / code"), "F135-177");
      await user.click(screen.getByRole("button", { name: "复制 135177" }));
      expect(writeText).toHaveBeenCalledWith("135177");

      await user.click(screen.getByRole("button", { name: "关闭搜索" }));

      await act(async () => {
        resolveWriteText?.();
        await writeTextPromise;
      });

      await user.click(screen.getByRole("button", { name: "搜索" }));
      await user.type(screen.getByPlaceholderText("搜索发票商品 / code"), "F135-177");

      expect(screen.queryByText("已复制")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "复制 135177" })).toHaveTextContent("复制");
    } finally {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("uses the refreshed Mark Murphy invoice lines for daily milk purchase counts", () => {
    const semiSkimmedMilk = searchSupplierProducts("milk semi skimmed").find(
      (product) => product.supplierCode === "MM" && product.supplierProductCode === "5035"
    );
    const fullFatMilk = searchSupplierProducts("milk full fat").find(
      (product) => product.supplierCode === "MM" && product.supplierProductCode === "5045"
    );

    expect(semiSkimmedMilk?.purchaseCount).toBe(5);
    expect(fullFatMilk?.purchaseCount).toBe(4);
  });

  it("opens area branches from the home page without leaving first", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "区域" }));

    expect(screen.getByRole("link", { name: "冷冻库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "冷藏库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "干货库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "酒水库" })).toHaveAttribute("href", "#drinks");
  });

  it("closes area branches when clicking another home module", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "区域" }));
    expect(screen.getByRole("link", { name: "冷冻库" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.queryByRole("link", { name: "冷冻库" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "冷藏库" })).not.toBeInTheDocument();
  });

  it("opens the new chiller, dry store, and drinks inventory lists from area branches", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "区域" }));
    await user.click(screen.getByRole("link", { name: "冷藏库" }));

    expect(screen.getByRole("heading", { name: "冷藏库" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "冷藏库库存总列表" })).toBeInTheDocument();
    expect(screen.getByText("这个库房还没有库存记录")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回首页" }));
    await user.click(screen.getByRole("button", { name: "区域" }));
    await user.click(screen.getByRole("link", { name: "干货库" }));

    expect(screen.getByRole("heading", { name: "干货库" })).toBeInTheDocument();
    expect(screen.getByLabelText("干货库货架图")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "干货库库存总列表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A top" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B floor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "F货架" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回首页" }));
    await user.click(screen.getByRole("button", { name: "区域" }));
    await user.click(screen.getByRole("link", { name: "酒水库" }));

    expect(screen.getByRole("heading", { name: "酒水库" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "酒水库库存总列表" })).not.toBeInTheDocument();
    expect(screen.queryByText("这个库房还没有库存记录")).not.toBeInTheDocument();
  });

  it("loads #drinks through server-backed repository flow and not legacy localStorage wine cellar list", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      );
    const getItemSpy = vi.spyOn(window.localStorage, "getItem");

    window.location.hash = "#drinks";
    render(<App />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/api/"))).toBe(true);
    expect(getItemSpy.mock.calls.every(([key]) => key === undefined || !/(wine|cellar|drinks)/i.test(key))).toBe(true);
  });

  it("draws the dry store map as an L-shaped corner with F turning from C", () => {
    window.location.hash = "#dry-store";
    render(<App />);

    expect(screen.getByLabelText("干货库货架图")).toHaveAttribute("data-layout", "corner-l");
  });

  it("opens total valuation and switches per-area values inside the valuation module", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "酒水库金额" }));

    expect(window.location.hash).toBe("");
    expect(screen.getByText("酒水库库存金额")).toBeInTheDocument();
    expect(screen.getByText("£0.00")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /产品库存总金额/ }));

    expect(screen.getByRole("heading", { name: "产品库存总金额" })).toBeInTheDocument();
  });

  it("opens the visual freezer page from the area branch", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "区域" }));
    await user.click(screen.getByRole("link", { name: "冷冻库" }));

    expect(screen.getByRole("heading", { name: "冷冻库" })).toBeInTheDocument();
    expect(screen.getByText("A货架")).toBeInTheDocument();
    expect(screen.getByText("托盘区")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "冷冻库库存总列表" })).toBeInTheDocument();
    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
    expect(screen.getAllByText("A1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "A floor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B top" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B floor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C top" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C floor" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A4" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "C0" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "C4" })).not.toBeInTheDocument();
    expect(screen.queryByText("A货架 / 1号位置")).not.toBeInTheDocument();
  });

  it("formats saved freezer locations from their code so old C0 and C4 entries display top and floor", async () => {
    const user = userEvent.setup();
    const supplierProduct = findSupplierProduct("CMP", "28HADFZIQF")!;
    window.localStorage.setItem(
      "grow-naturally-freezer-inventory",
      JSON.stringify([
        {
          createdAt: "2026-07-09T00:00:00.000Z",
          id: "legacy-c0",
          locationCode: "C0",
          position: "C0",
          productName: "Legacy Top Haddock",
          quantity: 1,
          rack: "C货架",
          supplierProduct,
          unit: "BOX"
        },
        {
          createdAt: "2026-07-09T00:00:00.000Z",
          id: "legacy-c4",
          locationCode: "C4",
          position: "C4",
          productName: "Legacy Floor Haddock",
          quantity: 1,
          rack: "C货架",
          supplierProduct,
          unit: "BOX"
        }
      ])
    );
    render(<App />);

    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.type(screen.getByPlaceholderText("输入产品名称"), "Legacy");

    expect(screen.getAllByText("C top").length).toBeGreaterThan(0);
    expect(screen.getAllByText("C floor").length).toBeGreaterThan(0);
    expect(screen.queryByText("C0")).not.toBeInTheDocument();
    expect(screen.queryByText("C4")).not.toBeInTheDocument();
  });

  it("filters freezer inventory by rack and exact position from the freezer map", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "A1" }));

    expect(screen.getByText("当前筛选：A1")).toBeInTheDocument();
    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
    expect(screen.queryByText("Lasagne")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "A货架" }));

    expect(screen.getByText("当前筛选：A货架")).toBeInTheDocument();
    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
    expect(screen.getByText("Lasagne")).toBeInTheDocument();
    expect(screen.queryByText("5 inch Sesame Seed Burger Bun")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "B1" }));

    expect(screen.getByText("当前筛选：B1")).toBeInTheDocument();
    expect(screen.getByText("5 inch Sesame Seed Burger Bun")).toBeInTheDocument();
    expect(screen.queryByText("Chicken Breast")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全部" }));

    expect(screen.getByText("当前筛选：全部")).toBeInTheDocument();
    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
    expect(screen.getByText("5 inch Sesame Seed Burger Bun")).toBeInTheDocument();
  });

  it("searches imported freezer products by name and returns locations and stock", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /搜索/ }));
    await user.type(screen.getByPlaceholderText("输入产品名称"), "Chicken Breast");

    expect(screen.getAllByText("冷冻库").length).toBeGreaterThan(0);
    expect(screen.queryByText("冷藏库")).not.toBeInTheDocument();
    expect(screen.queryByText("鸡胸")).not.toBeInTheDocument();
    expect(screen.getAllByText("A1").length).toBeGreaterThan(0);
    expect(screen.queryByText("库存：2盒")).not.toBeInTheDocument();
    expect(screen.getByLabelText("A1定位")).toBeInTheDocument();
    expect(screen.getAllByLabelText("冷冻库").length).toBeGreaterThan(0);
    expect(screen.getByText("库存：7 Cases")).toBeInTheDocument();
  });

  it("hides home search results after clicking outside the search area", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /搜索/ }));
    await user.type(screen.getByPlaceholderText("输入产品名称"), "Chicken Breast");
    expect(screen.getByText("库存：7 Cases")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "区域" }));

    expect(screen.queryByText("库存：7 Cases")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入产品名称")).toHaveValue("Chicken Breast");
  });

  it("starts total inventory value at zero", () => {
    render(<Home />);

    expect(screen.getByText("£0.00")).toBeInTheDocument();
  });

  it("values partial open cases as simple percentage units", () => {
    const product = searchSupplierProducts("chicken fillet").find(
      (item) => item.supplierProductCode === "22CFIL5K"
    );

    expect(product).toBeDefined();
    expect(
      calculateInventoryTotal([
        {
          createdAt: "2026-07-08T00:00:00.000Z",
          id: "partial-case",
          locationCode: "A3",
          openPackagePercent: 50,
          position: "3号位置",
          productName: "Chicken Fillet",
          quantity: 1,
          rack: "A货架",
          supplierProduct: product!,
          unit: "盒"
        }
      ])
    ).toBe(53.25);
  });

  it("calculates each inventory row total from unit price and stock units", () => {
    const product = searchSupplierProducts("chicken fillet").find(
      (item) => item.supplierProductCode === "22CFIL5K"
    );

    expect(product).toBeDefined();
    expect(
      calculateInventoryLineTotal({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "four-pieces",
        locationCode: "A3",
        position: "3号位置",
        productName: "Chicken Fillet",
        quantity: 4,
        rack: "A货架",
        supplierProduct: product!,
        unit: "Pieces"
      })
    ).toBe(142);
  });

  it("values loose packs inside a recorded case using the invoice pack count", () => {
    const product = findSupplierProduct("CMP", "26MACKSM");

    expect(product).toBeDefined();
    expect(
      calculateInventoryLineTotal({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "mackerel-open-case",
        locationCode: "A3",
        position: "3号位置",
        productName: "Omega Scottish Hot Smoked Mackerel Fillets",
        quantity: 3,
        quantityText: "1 Case + 2 Packs",
        rack: "A货架",
        supplierProduct: product!,
        unit: "Case Packs"
      })
    ).toBeCloseTo(26.625);
  });

  it("reads full and loose package counts from recorded stock text", () => {
    const ice = findSupplierProduct("BRK", "136145");
    const mashedPotato = findSupplierProduct("BRK", "149710");

    expect(ice).toBeDefined();
    expect(mashedPotato).toBeDefined();
    expect(getSupplierUnitsPerCase(ice!)).toBe(5);
    expect(getSupplierUnitsPerCase(mashedPotato!)).toBe(4);
    expect(
      getInventoryPackageCounts({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "ice",
        locationCode: "P1",
        position: "P1",
        productName: "Ice",
        quantity: 7,
        quantityText: "5 Cases + 2 Bags",
        rack: "托盘区",
        supplierProduct: ice!,
        unit: "Cases Bags"
      })
    ).toEqual({ fullPackageCount: 5, loosePackageCount: 2, unitsPerCase: 5 });
    expect(
      getInventoryPackageCounts({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "mashed-potato",
        locationCode: "P4",
        position: "P4",
        productName: "Mashed Potato",
        quantity: 3,
        quantityText: "1 Open Case (2 Bags), placed on top of pallet stack",
        rack: "托盘区",
        supplierProduct: mashedPotato!,
        unit: "Open Case Bags placed on top of pallet stack"
      })
    ).toEqual({ fullPackageCount: 0, loosePackageCount: 2, unitsPerCase: 4 });
  });

  it("values Sesame Seed Burger Bun bags as eighths of a Brakes case", () => {
    const seedBun = findSupplierProduct("BRK", "3625");

    expect(seedBun).toBeDefined();
    expect(getSupplierUnitsPerCase(seedBun!)).toBe(8);
    expect(
      getInventoryPackageCounts({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "seed-bun",
        locationCode: "B1",
        position: "B1",
        productName: "5 inch Sesame Seed Burger Bun",
        quantity: 15,
        quantityText: "~15 Bags",
        rack: "B货架",
        supplierProduct: seedBun!,
        unit: "1x48"
      })
    ).toEqual({ fullPackageCount: 0, loosePackageCount: 15, unitsPerCase: 8 });
    expect(
      calculateInventoryLineTotal({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "seed-bun",
        locationCode: "B1",
        position: "B1",
        productName: "5 inch Sesame Seed Burger Bun",
        quantity: 15,
        quantityText: "~15 Bags",
        rack: "B货架",
        supplierProduct: seedBun!,
        unit: "1x48"
      })
    ).toBeCloseTo(20.5125);
  });

  it("refreshes old Sesame Seed Burger Bun source text from local storage", () => {
    const seedBun = findSupplierProduct("BRK", "3625");

    expect(seedBun).toBeDefined();
    window.localStorage.setItem(
      "grow-naturally-freezer-inventory",
      JSON.stringify([
        {
          createdAt: "2026-07-08T00:00:00.000Z",
          id: "old-seed-bun",
          locationCode: "B1",
          position: "B1",
          productName: "5 inch Sesame Seed Burger Bun",
          quantity: 15,
          quantityText: "~15 Pieces",
          rack: "B货架",
          sourceItemId: "BK004",
          supplierProduct: seedBun,
          unit: "1x48"
        }
      ])
    );
    window.location.hash = "#freezer";

    render(<App />);

    expect(screen.getByText("~15 Bags")).toBeInTheDocument();
    expect(screen.queryByText("~15 Pieces")).not.toBeInTheDocument();
    expect(screen.getByLabelText("5 inch Sesame Seed Burger Bun 散包数量")).toHaveTextContent("15");
    expect(screen.getByText("总价 £20.51")).toBeInTheDocument();
  });

  it("values Garlic Pastry Bread Slices by remaining slices out of an 85-slice case", () => {
    const garlicBread = findSupplierProduct("BRK", "5011050");
    const garlicBreadInventory = FREEZER_INVENTORY.find((item) => item.id === "BK006");

    expect(garlicBread).toBeDefined();
    expect(garlicBreadInventory).toEqual(
      expect.objectContaining({
        quantityText: "~30 Slices",
        suggestedSupplierCode: "BRK",
        suggestedSupplierProductCode: "5011050"
      })
    );
    expect(getSupplierUnitsPerCase(garlicBread!)).toBe(85);
    expect(
      getInventoryPackageCounts({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "garlic-bread",
        locationCode: "B1",
        position: "B1",
        productName: "Garlic Pastry Bread Slices",
        quantity: 30,
        quantityText: "~30 Slices",
        rack: "B货架",
        supplierProduct: garlicBread!,
        unit: "1x85"
      })
    ).toEqual({ fullPackageCount: 0, loosePackageCount: 30, unitsPerCase: 85 });
    expect(
      calculateInventoryLineTotal({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "garlic-bread",
        locationCode: "B1",
        position: "B1",
        productName: "Garlic Pastry Bread Slices",
        quantity: 30,
        quantityText: "~30 Slices",
        rack: "B货架",
        supplierProduct: garlicBread!,
        unit: "1x85"
      })
    ).toBeCloseTo(3.4305);
  });

  it("keeps Berry Go Round unlinked because the 5222 text is not a supplier invoice code", () => {
    const berryGoRound = FREEZER_INVENTORY.find((item) => item.id === "D004");

    expect(berryGoRound).toEqual(
      expect.objectContaining({
        quantityText: "~50 small Packs; source not confirmed",
        recordedSupplierCode: "",
        suggestedSupplierCode: "",
        suggestedSupplierProductCode: ""
      })
    );
  });

  it("uses confirmed freezer counts for scones, rolls, desserts, haddock, kyiv, and lemon tray cake", () => {
    const chocolateBrownie = findSupplierProduct("BRK", "136269");
    const potatoScones = findSupplierProduct("BRK", "460806");
    const glutenFreeRolls = findSupplierProduct("BRK", "135096");
    const chocolateOrangeDessert = findSupplierProduct("BRK", "123224");
    const haddock = findSupplierProduct("CMP", "28HADFZIQF");
    const smokedHaddock = findSupplierProduct("CMP", "26HADSMO");
    const vegetarianBurger = findSupplierProduct("BRK", "148602");
    const vegetableKyiv = findSupplierProduct("BRK", "146283");
    const lemonTrayCake = findSupplierProduct("BRK", "117350");

    expect(FREEZER_INVENTORY.find((item) => item.id === "D020")).toEqual(
      expect.objectContaining({ quantityText: "1 Cake (900g)", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "136269" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "D028")).toEqual(
      expect.objectContaining({ quantityText: "~24 Packs", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "460806" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "C004")).toEqual(
      expect.objectContaining({ quantityText: "~30 Rolls", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "135096" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "D023")).toEqual(
      expect.objectContaining({ quantityText: "~10 Slices", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "123224" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "FS005")).toEqual(
      expect.objectContaining({ quantityText: "2 Cases", suggestedSupplierCode: "CMP", suggestedSupplierProductCode: "28HADFZIQF" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "FS008")).toEqual(
      expect.objectContaining({ productName: "Smoked Haddock (Loose)", quantityText: "3 Pieces", suggestedSupplierCode: "CMP", suggestedSupplierProductCode: "26HADSMO" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "C016")).toEqual(
      expect.objectContaining({ productName: "Vegetarian Burger", quantityText: "2 Bags", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "148602" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "C014")).toEqual(
      expect.objectContaining({ quantityText: "0.75 Case remaining", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "146283" })
    );
    expect(FREEZER_INVENTORY.find((item) => item.id === "D021")).toEqual(
      expect.objectContaining({ quantityText: "1 Case", suggestedSupplierCode: "BRK", suggestedSupplierProductCode: "117350" })
    );

    expect(getSupplierUnitsPerCase(chocolateBrownie!)).toBe(2);
    expect(getSupplierUnitsPerCase(potatoScones!)).toBe(24);
    expect(getSupplierUnitsPerCase(glutenFreeRolls!)).toBe(24);
    expect(getSupplierUnitsPerCase(chocolateOrangeDessert!)).toBe(12);
    expect(getSupplierUnitsPerCase(smokedHaddock!)).toBe(6);
    expect(getSupplierUnitsPerCase(vegetarianBurger!)).toBe(4);

    expect(lineTotalFor("1 Cake (900g)", chocolateBrownie!)).toBeCloseTo(11.74);
    expect(lineTotalFor("~24 Packs", potatoScones!)).toBeCloseTo(18.15);
    expect(lineTotalFor("~30 Rolls", glutenFreeRolls!)).toBeCloseTo(24.975);
    expect(lineTotalFor("~10 Slices", chocolateOrangeDessert!)).toBeCloseTo(23.3667);
    expect(lineTotalFor("2 Cases", haddock!)).toBeCloseTo(125);
    expect(lineTotalFor("3 Pieces", smokedHaddock!)).toBeCloseTo(7.175);
    expect(lineTotalFor("2 Bags", vegetarianBurger!)).toBeCloseTo(24.85);
    expect(lineTotalFor("0.75 Case remaining", vegetableKyiv!)).toBeCloseTo(32.2425);
    expect(lineTotalFor("1 Case", lemonTrayCake!)).toBeCloseTo(32.22);
  });

  it("formats manually entered partial stock without exact piece counting", () => {
    const product = searchSupplierProducts("chicken fillet")[0];

    expect(
      formatEntryQuantity({
        createdAt: "2026-07-08T00:00:00.000Z",
        id: "partial-case",
        locationCode: "A3",
        openPackagePercent: 50,
        position: "3号位置",
        productName: "Chicken Fillet",
        quantity: 1,
        rack: "A货架",
        supplierProduct: product,
        unit: "盒"
      })
    ).toBe("1盒 + 50%");
  });

  it("searches supplier invoice products exported from Excel", () => {
    const results = searchSupplierProducts("chicken fillet");

    expect(results[0].supplierCode).toBe("CMP");
    expect(results.some((product) => product.supplierProductCode === "22CFIL5K")).toBe(true);
    expect(results.some((product) => product.latestPrice === 35.5)).toBe(true);
  });

  it("loads recorded freezer stock exported from Excel", () => {
    expect(FREEZER_INVENTORY).toHaveLength(90);
    expect(FREEZER_INVENTORY).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "CK001",
          locationCode: "A1",
          productName: "Chicken Breast",
          quantityText: "7 Cases"
        }),
        expect.objectContaining({
          id: "FR001",
          locationCode: "P1",
          productName: "Ice",
          quantityText: "5 Cases + 2 Bags"
        }),
        expect.objectContaining({
          id: "PT002",
          productName: "Chunky Chips",
          recordedSupplierCode: "F13557",
          suggestedSupplierCode: "BRK",
          suggestedSupplierProductCode: "135177"
        })
      ])
    );
  });

  it("shows recorded packaging codes without unsafe invoice suggestions", () => {
    window.location.hash = "#freezer";
    render(<App />);

    expect(screen.getByText("PT002 · 货号 F13557")).toBeInTheDocument();
  });

  it("matches confirmed Chunky Chips product by Brakes product code", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "匹配 Chunky Chips 发票" }));

    expect(screen.getByRole("button", { name: /135177/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sysco Prem Chunky Skin on Chips/ })).toBeInTheDocument();
    expect(searchSupplierProducts("F135-177")[0].supplierProductCode).toBe("135177");
  });

  it("matches an imported freezer stock item to an invoice product", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "匹配 Chicken Breast 发票" }));
    const importedMatch = screen.getByRole("button", { name: /22CFIL5K/ });
    await user.click(importedMatch);

    expect(importedMatch).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Campbells Prime Meat Ltd")).toBeInTheDocument();
    expect(screen.getByText("最后 £35.50")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认匹配" }));

    expect(screen.getByText("Campbell / 22CFIL5K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 Chicken Breast 发票" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 Chicken Breast" })).toBeInTheDocument();
  });

  it("shows a recorded case plus loose packs as an adjusted line total after invoice matching", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "匹配 Omega Scottish Hot Smoked Mackerel Fillets 发票" }));
    await user.click(screen.getByRole("button", { name: /26MACKSM/ }));
    await user.click(screen.getByRole("button", { name: "确认匹配" }));

    expect(screen.getByText("1 Case + 2 Packs")).toBeInTheDocument();
    expect(screen.getByText("单价 £21.30")).toBeInTheDocument();
    expect(screen.getByText("总价 £26.63")).toBeInTheDocument();
    expect(screen.queryByText("总价 £63.90")).not.toBeInTheDocument();
  });

  it("sorts the freezer inventory list by current line total from high to low", () => {
    const haddock = findSupplierProduct("CMP", "28HADFZIQF")!;
    const smokedHaddock = findSupplierProduct("CMP", "26HADSMO")!;
    const lowValueEntry = buildInventoryEntry({
      locationCode: "A3",
      productName: "Low Value Smoked Haddock",
      quantity: 1,
      supplierProduct: smokedHaddock,
      unit: "KG"
    });
    const highValueEntry = buildInventoryEntry({
      locationCode: "A3",
      productName: "High Value Haddock",
      quantity: 2,
      supplierProduct: haddock,
      unit: "BOX"
    });
    window.localStorage.setItem("grow-naturally-freezer-inventory", JSON.stringify([lowValueEntry, highValueEntry]));
    window.location.hash = "#freezer";
    render(<App />);

    const freezerRows = screen.getAllByRole("row");
    const highValueRow = freezerRows.find((row) => row.textContent?.includes("High Value Haddock"));
    const lowValueRow = freezerRows.find((row) => row.textContent?.includes("Low Value Smoked Haddock"));
    const pendingRow = freezerRows.find((row) => row.textContent?.includes("Chicken Breast"));

    expect(highValueRow).toBeDefined();
    expect(lowValueRow).toBeDefined();
    expect(pendingRow).toBeDefined();
    expect(highValueRow).toHaveTextContent("总价 £125.00");
    expect(lowValueRow).toHaveTextContent("总价 £14.35");
    expect(freezerRows.indexOf(highValueRow!)).toBeLessThan(freezerRows.indexOf(lowValueRow!));
    expect(freezerRows.indexOf(lowValueRow!)).toBeLessThan(freezerRows.indexOf(pendingRow!));
  });

  it("sorts a selected freezer rack by shelf level instead of line total", async () => {
    const user = userEvent.setup();
    const haddock = findSupplierProduct("CMP", "28HADFZIQF")!;
    const smokedHaddock = findSupplierProduct("CMP", "26HADSMO")!;
    const lowTopEntry = buildInventoryEntry({
      locationCode: "B0",
      productName: "Low Value B Top",
      quantity: 1,
      supplierProduct: smokedHaddock,
      unit: "KG"
    });
    const highFloorEntry = buildInventoryEntry({
      locationCode: "B4",
      productName: "High Value B Floor",
      quantity: 2,
      supplierProduct: haddock,
      unit: "BOX"
    });
    window.localStorage.setItem("grow-naturally-freezer-inventory", JSON.stringify([lowTopEntry, highFloorEntry]));
    window.location.hash = "#freezer";
    render(<App />);

    const allRows = screen.getAllByRole("row");
    const highFloorAll = allRows.find((row) => row.textContent?.includes("High Value B Floor"));
    const lowTopAll = allRows.find((row) => row.textContent?.includes("Low Value B Top"));
    expect(allRows.indexOf(highFloorAll!)).toBeLessThan(allRows.indexOf(lowTopAll!));

    await user.click(screen.getByRole("button", { name: "B货架" }));

    const rackRows = screen.getAllByRole("row");
    const lowTopRack = rackRows.find((row) => row.textContent?.includes("Low Value B Top"));
    const highFloorRack = rackRows.find((row) => row.textContent?.includes("High Value B Floor"));
    expect(lowTopRack).toHaveTextContent("B top");
    expect(highFloorRack).toHaveTextContent("B floor");
    expect(rackRows.indexOf(lowTopRack!)).toBeLessThan(rackRows.indexOf(highFloorRack!));
  });

  it("re-sorts the freezer inventory list after quantity changes", async () => {
    const user = userEvent.setup();
    const seaBass = findSupplierProduct("CMP", "26SEAPOR")!;
    const smokedHaddock = findSupplierProduct("CMP", "26HADSMO")!;
    const lowValueEntry = buildInventoryEntry({
      locationCode: "A3",
      productName: "Low Value Sea Bass",
      quantity: 1,
      supplierProduct: seaBass,
      unit: "EACH"
    });
    const highValueEntry = buildInventoryEntry({
      locationCode: "A3",
      productName: "High Value Smoked Haddock",
      quantity: 0.2,
      supplierProduct: smokedHaddock,
      unit: "KG"
    });
    window.localStorage.setItem("grow-naturally-freezer-inventory", JSON.stringify([lowValueEntry, highValueEntry]));
    window.location.hash = "#freezer";
    render(<App />);

    const rowsBefore = screen.getAllByRole("row");
    const highValueRowBefore = rowsBefore.find((row) => row.textContent?.includes("High Value Smoked Haddock"));
    const lowValueRowBefore = rowsBefore.find((row) => row.textContent?.includes("Low Value Sea Bass"));
    expect(rowsBefore.indexOf(highValueRowBefore!)).toBeLessThan(rowsBefore.indexOf(lowValueRowBefore!));

    await user.click(screen.getByRole("button", { name: "增加 Low Value Sea Bass 数量" }));
    await user.click(screen.getByRole("button", { name: "增加 Low Value Sea Bass 数量" }));

    const rowsAfter = screen.getAllByRole("row");
    const lowValueRowAfter = rowsAfter.find((row) => row.textContent?.includes("Low Value Sea Bass"));
    const highValueRowAfter = rowsAfter.find((row) => row.textContent?.includes("High Value Smoked Haddock"));
    expect(lowValueRowAfter).toHaveTextContent("总价 £5.25");
    expect(rowsAfter.indexOf(lowValueRowAfter!)).toBeLessThan(rowsAfter.indexOf(highValueRowAfter!));
  });

  it("asks yes or no before deleting freezer inventory", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "删除 Chicken Breast" }));

    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "确认删除" })).toBeInTheDocument();
    expect(screen.getByText("是否确认删除 Chicken Breast？")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "否，取消" }));

    expect(screen.queryByRole("dialog", { name: "确认删除" })).not.toBeInTheDocument();
    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 Chicken Breast" }));
    await user.click(screen.getByRole("button", { name: "是，删除" }));

    expect(screen.queryByText("Chicken Breast")).not.toBeInTheDocument();
  });

  it("renames a freezer inventory product from the product name icon button", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    const { unmount } = render(<App />);

    await user.click(screen.getByRole("button", { name: "修改 Chicken Breast 名字" }));
    await user.clear(screen.getByLabelText("产品新名称"));
    await user.type(screen.getByLabelText("产品新名称"), "Chicken Breast Renamed");
    await user.click(screen.getByRole("button", { name: "保存产品名" }));

    expect(screen.getByText("Chicken Breast Renamed")).toBeInTheDocument();
    expect(window.localStorage.getItem("grow-naturally-freezer-source-name-overrides")).toContain(
      "Chicken Breast Renamed"
    );

    unmount();
    render(<App />);

    expect(screen.getByText("Chicken Breast Renamed")).toBeInTheDocument();
  });

  it("adjusts matched full and loose package counts from the freezer list", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "匹配 Ice 发票" }));
    await user.click(screen.getByRole("button", { name: /136145/ }));
    await user.click(screen.getByRole("button", { name: "确认匹配" }));

    expect(screen.getByLabelText("Ice 整箱数量")).toHaveTextContent("5");
    expect(screen.getByLabelText("Ice 散包数量")).toHaveTextContent("2");
    expect(screen.getByText("总价 £18.47")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "增加 Ice 散包数量" }));
    await user.click(screen.getByRole("button", { name: "减少 Ice 整箱数量" }));

    expect(screen.getByLabelText("Ice 整箱数量")).toHaveTextContent("4");
    expect(screen.getByLabelText("Ice 散包数量")).toHaveTextContent("3");
    expect(screen.getByText("总价 £15.73")).toBeInTheDocument();
  });

  it("adjusts matched single item counts using the invoice unit", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "匹配 Sea Bass 发票" }));
    await user.click(screen.getByRole("button", { name: /26SEAPOR/ }));
    await user.click(screen.getByRole("button", { name: "确认匹配" }));

    expect(screen.getByText("单位 EACH")).toBeInTheDocument();
    expect(screen.getByLabelText("Sea Bass 数量")).toHaveTextContent("4");
    expect(screen.getByText("总价 £7.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "增加 Sea Bass 数量" }));

    expect(screen.getByLabelText("Sea Bass 数量")).toHaveTextContent("5");
    expect(screen.getByText("总价 £8.75")).toBeInTheDocument();
  });

  it("edits and deletes an imported freezer stock item after invoice matching", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "匹配 Chicken Breast 发票" }));
    await user.click(screen.getByRole("button", { name: /22CFIL5K/ }));
    await user.click(screen.getByRole("button", { name: "确认匹配" }));

    await user.click(screen.getByRole("button", { name: "编辑 Chicken Breast 发票" }));
    await user.clear(screen.getByLabelText("搜索发票商品"));
    await user.type(screen.getByLabelText("搜索发票商品"), "chicken fillet");
    const replacementMatch = screen.getByRole("button", { name: /^22CFIL7 · CHICKEN FILLET/ });
    await user.click(replacementMatch);

    expect(replacementMatch).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "确认匹配" }));

    expect(screen.getByText("Campbell / 22CFIL7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 Chicken Breast" }));
    await user.click(screen.getByRole("button", { name: "是，删除" }));

    expect(screen.queryByText("Chicken Breast")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回首页" }));
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await user.type(screen.getByPlaceholderText("输入产品名称"), "Chicken Breast");

    expect(screen.queryByText("冷冻库 / A货架 / 1号位置")).not.toBeInTheDocument();
  });

  it("adds a freezer product by matching an Excel invoice item", async () => {
    const user = userEvent.setup();
    window.location.hash = "#freezer";
    render(<App />);

    await user.click(screen.getByRole("button", { name: "录入产品" }));
    await user.type(screen.getByLabelText("产品名称"), "chicken");
    await user.selectOptions(screen.getByLabelText("位置"), "A3");
    await user.type(screen.getByLabelText("库存数量"), "1");
    await user.type(screen.getByLabelText("库存单位"), "盒");
    await user.click(screen.getByRole("button", { name: "50%" }));
    const invoiceMatch = screen.getByRole("button", { name: /22CFIL5K/ });
    await user.click(invoiceMatch);

    expect(invoiceMatch).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("产品名称")).toHaveValue("5KG PACK CHICKEN FILLET APPROX 200G+");
    expect(screen.getByText("Campbells Prime Meat Ltd")).toBeInTheDocument();
    expect(screen.getByText("最低 £35.50")).toBeInTheDocument();
    expect(screen.getByText("最高 £35.50")).toBeInTheDocument();
    expect(screen.getByText("平均 £35.50")).toBeInTheDocument();
    expect(screen.getByText("最后 £35.50")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存产品" }));

    expect(screen.getByText("5KG PACK CHICKEN FILLET APPROX 200G+")).toBeInTheDocument();
    expect(screen.getByLabelText("5KG PACK CHICKEN FILLET APPROX 200G+ 数量")).toHaveTextContent("1");
    expect(screen.getByText("开封 +50%")).toBeInTheDocument();
    expect(screen.getByText("单位 PACK")).toBeInTheDocument();
    expect(screen.getAllByText("A3").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("A货架 / 3号位置")).not.toBeInTheDocument();
    expect(screen.getByText("Campbell / 22CFIL5K")).toBeInTheDocument();
    expect(screen.getByText("单价 £35.50")).toBeInTheDocument();
    expect(screen.getByText("总价 £53.25")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "返回首页" }));
    await user.click(screen.getByRole("link", { name: "产品库存总金额" }));

    expect(screen.getByText("£53.25")).toBeInTheDocument();
  });

  it("opens the selected inventory location from an ordering deep link", async () => {
    window.location.hash = "#freezer?supplierProductId=BRK-100243&location=A1";
    render(<App />);

    expect(screen.getByRole("button", { name: "A1" })).toHaveAttribute("aria-pressed", "true");
  });
});
