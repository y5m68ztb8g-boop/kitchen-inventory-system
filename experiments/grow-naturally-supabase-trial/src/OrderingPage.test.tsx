import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderingPage } from "./OrderingPage";

const {
  acknowledgeRestockOnly,
  addOrderingItem,
  deleteOrderingItem,
  getCurrentOrderingBatch,
  getOrderingProfile,
  markSupplierOrdered,
  prepareSupplierGroup,
  recordInventoryRecheck,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
  searchHistoricalProducts,
  importReadyIntake,
  runBrakesQuickAdd,
  updateOrderingInventoryLocation,
  updateOrderingItem
} = vi.hoisted(() => ({
  acknowledgeRestockOnly: vi.fn(),
  addOrderingItem: vi.fn(),
  deleteOrderingItem: vi.fn(),
  getCurrentOrderingBatch: vi.fn(),
  getOrderingProfile: vi.fn(),
  markSupplierOrdered: vi.fn(),
  prepareSupplierGroup: vi.fn(),
  recordInventoryRecheck: vi.fn(),
  saveBatchPo: vi.fn(),
  saveOrderingProfile: vi.fn(),
  saveSupplierEmailDraft: vi.fn(),
  searchHistoricalProducts: vi.fn(),
  importReadyIntake: vi.fn(),
  runBrakesQuickAdd: vi.fn(),
  updateOrderingInventoryLocation: vi.fn(),
  updateOrderingItem: vi.fn()
}));

vi.mock("./ordering/api", () => ({
  acknowledgeRestockOnly,
  addOrderingItem,
  deleteOrderingItem,
  getCurrentOrderingBatch,
  getOrderingProfile,
  markSupplierOrdered,
  importReadyIntake,
  prepareSupplierGroup,
  recordInventoryRecheck,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
  runBrakesQuickAdd,
  updateOrderingInventoryLocation,
  updateOrderingItem
}));

vi.mock("./purchasing/api", () => ({ searchHistoricalProducts }));

const suppliers = [
  { supplierCode: "CMP", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null },
  { supplierCode: "MM", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null },
  { supplierCode: "BRK", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null }
];

const emptyBatch = {
  id: "batch-task-5",
  poNumber: "PO-5005",
  status: "Draft",
  items: [],
  suppliers,
  supplierGroups: suppliers
};

const brakesProduct = {
  id: "BRK-JUICE-12",
  isRecommended: true,
  productName: "Brakes The Juice Orange",
  supplierName: "Brakes",
  supplierCode: "BRK",
  supplierProductCode: "JUICE-12",
  packSize: "12x1ltr",
  latestPrice: 18.4,
  purchaseCount: 8,
  latestPurchaseDate: "2026-07-01",
  currentInventoryQuantity: 1
};

const brakesBatch = {
  ...emptyBatch,
  items: [
    {
      id: "item-brakes-juice",
      batchId: emptyBatch.id,
      productName: brakesProduct.productName,
      supplierGroup: "BRK",
      supplierProductId: brakesProduct.id,
      supplierProductCode: brakesProduct.supplierProductCode,
      supplierName: brakesProduct.supplierName,
      packSize: brakesProduct.packSize,
      orderQuantity: 2,
      orderUnit: "supplier-pack",
      lastPrice: brakesProduct.latestPrice,
      purchaseCount: brakesProduct.purchaseCount,
      latestPurchaseDate: brakesProduct.latestPurchaseDate,
      brakesStatus: "Pending"
    }
  ]
};

const task7Items = [
  {
    id: "item-cmp-task-7",
    batchId: emptyBatch.id,
    productName: "Campbells Tomatoes",
    supplierGroup: "CMP",
    supplierProductId: "CMP-TOMATO",
    supplierProductCode: "CMP-01",
    supplierName: "Campbells",
    packSize: "6x2.5kg",
    orderQuantity: 1,
    orderUnit: "6x2.5kg",
    lastPrice: 12,
    purchaseCount: 4,
    latestPurchaseDate: "2026-07-01",
    brakesStatus: "Pending"
  },
  {
    id: "item-mm-task-7",
    batchId: emptyBatch.id,
    productName: "Mark Murphy Milk",
    supplierGroup: "MM",
    supplierProductId: "MM-MILK",
    supplierProductCode: "MM-02",
    supplierName: "Mark Murphy",
    packSize: "12x1ltr",
    orderQuantity: 1,
    orderUnit: "12x1ltr",
    lastPrice: 11,
    purchaseCount: 3,
    latestPurchaseDate: "2026-07-01",
    brakesStatus: "Pending"
  },
  { ...brakesBatch.items[0], brakesStatus: "Pending" }
];

const task7Suppliers = [
  { supplierCode: "CMP", status: "Prepared", preparedAt: "2026-07-11T10:00:00.000Z", orderedAt: null, emailDraft: { to: "cmp@example.com", subject: "PO", body: "Order" } },
  { supplierCode: "MM", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null },
  { supplierCode: "BRK", status: "Prepared", preparedAt: "2026-07-11T10:00:00.000Z", orderedAt: null, emailDraft: null }
];

const task7Batch = {
  ...emptyBatch,
  items: task7Items,
  suppliers: task7Suppliers,
  supplierGroups: task7Suppliers
};

describe("OrderingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentOrderingBatch.mockResolvedValue({ batch: emptyBatch, readyIntakes: [] });
    getOrderingProfile.mockResolvedValue({
      purchaserName: "Alex Buyer",
      hotelName: "Natural Growth Hotel",
      campbellsEmail: "orders@campbells.example",
      markMurphyEmail: "orders@markmurphy.example"
    });
    searchHistoricalProducts.mockResolvedValue({ candidates: [brakesProduct] });
    addOrderingItem.mockResolvedValue(brakesBatch);
    updateOrderingItem.mockResolvedValue(brakesBatch);
    importReadyIntake.mockResolvedValue({ batch: emptyBatch, readyIntakes: [] });
    acknowledgeRestockOnly.mockResolvedValue(emptyBatch);
    recordInventoryRecheck.mockResolvedValue(emptyBatch);
    saveBatchPo.mockResolvedValue(emptyBatch);
    saveSupplierEmailDraft.mockResolvedValue(emptyBatch);
    runBrakesQuickAdd.mockResolvedValue(task7Batch);
    markSupplierOrdered.mockResolvedValue(task7Batch);
    updateOrderingInventoryLocation.mockResolvedValue(undefined);
    saveOrderingProfile.mockResolvedValue({
      purchaserName: "Alex Buyer",
      hotelName: "Natural Growth Hotel",
      campbellsEmail: "orders@campbells.example",
      markMurphyEmail: "orders@markmurphy.example"
    });
  });

  it("shows one PO field and four supplier groups in one list", async () => {
    render(<OrderingPage />);

    expect(await screen.findByLabelText("采购 PO 号码")).toBeInTheDocument();
    expect(screen.getAllByLabelText("采购 PO 号码")).toHaveLength(1);
    for (const name of ["Campbells", "Mark Murphy", "Brakes", "未匹配供应商"]) {
      expect(screen.getByRole("button", { name: `${name} 分组` })).toBeInTheDocument();
    }
    expect(getCurrentOrderingBatch).toHaveBeenCalledTimes(1);
  });

  it("makes product search the primary ordering action and keeps one compact shared PO field", async () => {
    render(<OrderingPage />);

    const search = await screen.findByRole("search", { name: "搜索下单商品" });
    expect(within(search).getByRole("searchbox", { name: "搜索下单商品" })).toBeInTheDocument();
    expect(within(search).getByRole("button", { name: "搜索并添加" })).toBeInTheDocument();
    const auxiliary = screen.getByRole("region", { name: "采购辅助信息" });
    expect(within(auxiliary).getByLabelText("采购 PO 号码")).toBeInTheDocument();
    expect(screen.getAllByLabelText("采购 PO 号码")).toHaveLength(1);
  });

  it("adds a historical product using complete supplier-pack quantity", async () => {
    const user = userEvent.setup();
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "手动添加" }));
    const search = await screen.findByLabelText("搜索历史发票商品");
    await user.clear(search);
    await user.type(search, brakesProduct.productName);
    await user.click(await screen.findByRole("button", { name: `选择 ${brakesProduct.productName}` }));
    const quantity = screen.getByRole("spinbutton", { name: /订购数量/ });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.click(screen.getByRole("button", { name: "添加到下单" }));

    expect(addOrderingItem).toHaveBeenCalledWith(emptyBatch.id, {
      supplierProductId: brakesProduct.id,
      orderQuantity: 2
    });
    expect(await screen.findByText("12x1ltr")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /Brakes The Juice Orange/ })).toHaveValue(2);
  });

  it("renders every high-stock item in one inventory review dialog", async () => {
    const user = userEvent.setup();
    prepareSupplierGroup.mockResolvedValue({
      kind: "inventory-review-required",
      items: [
        {
          itemId: "cmp-stock-1",
          productName: "Campbells Chopped Tomatoes",
          totalEquivalentQuantity: 2.5,
          locations: [],
          inventoryLink: "#dry-store?product=tomatoes"
        },
        {
          itemId: "cmp-stock-2",
          productName: "Campbells Vegetable Oil",
          totalEquivalentQuantity: 3.2,
          locations: [],
          inventoryLink: "#dry-store?product=oil"
        }
      ]
    });
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "准备 Campbells 邮件" }));

    const dialog = screen.getByRole("dialog", { name: "下单前核查库存" });
    expect(dialog).toHaveTextContent("Campbells Chopped Tomatoes");
    expect(dialog).toHaveTextContent("Campbells Vegetable Oil");
    expect(within(dialog).getAllByRole("button", { name: "查看库存" })).toHaveLength(2);
    expect(within(dialog).queryByRole("link", { name: "去核查库存" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: "仅补货" })).toHaveLength(2);
  });

  it("reviews and corrects an inventory location in-page, then refreshes the batch and dialog", async () => {
    const user = userEvent.setup();
    const inventoryItem = {
      ...brakesBatch.items[0],
      totalEquivalentQuantity: 2,
      locations: [
        {
          warehouse: "dry-store",
          warehouseLabel: "干货库",
          locationCode: "A1",
          displayQuantity: "2 cases",
          equivalentQuantity: 2,
          deepLink: "#dry-store?product=BRK-JUICE-12&location=A1"
        }
      ]
    };
    const inventoryBatch = { ...brakesBatch, items: [inventoryItem] };
    const updatedBatch = {
      ...inventoryBatch,
      items: [
        {
          ...inventoryItem,
          totalEquivalentQuantity: 4,
          locations: [{ ...inventoryItem.locations[0], displayQuantity: "4 cases", equivalentQuantity: 4 }]
        }
      ]
    };
    getCurrentOrderingBatch
      .mockResolvedValueOnce({ batch: inventoryBatch, readyIntakes: [] })
      .mockResolvedValueOnce({ batch: updatedBatch, readyIntakes: [] });
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: `查看库存 ${inventoryItem.productName}` }));
    let dialog = screen.getByRole("dialog", { name: "库存位置与数量" });
    expect(dialog).toHaveTextContent("干货库");
    expect(dialog).toHaveTextContent("A1");
    expect(dialog).toHaveTextContent("2 cases");
    expect(window.location.hash).not.toContain("dry-store");

    await user.click(within(dialog).getByRole("button", { name: "库存不准确" }));
    const quantity = within(dialog).getByRole("spinbutton", { name: /A1.*数量|数量.*A1/ });
    await user.clear(quantity);
    await user.type(quantity, "4");
    await user.click(within(dialog).getByRole("button", { name: "保存库存数量" }));

    expect(updateOrderingInventoryLocation).toHaveBeenCalledWith(
      inventoryItem.supplierProductId,
      "dry-store",
      "A1",
      4
    );
    expect(getCurrentOrderingBatch).toHaveBeenCalledTimes(2);
    dialog = await screen.findByRole("dialog", { name: "库存位置与数量" });
    expect(dialog).toHaveTextContent("4 cases");
  });

  it("keeps the email draft editable and exposes open or copy actions but never send", async () => {
    const user = userEvent.setup();
    prepareSupplierGroup.mockResolvedValue({
      kind: "email-draft",
      draft: {
        supplierCode: "CMP",
        to: "orders@campbells.example",
        subject: "Purchase order PO-5005",
        body: "Please prepare our Campbells order."
      }
    });
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "准备 Campbells 邮件" }));

    const dialog = screen.getByRole("dialog", { name: "Campbells 邮件草稿" });
    const body = within(dialog).getByLabelText("正文");
    await user.clear(body);
    await user.type(body, "Please prepare the revised order.");
    expect(body).toHaveValue("Please prepare the revised order.");
    expect(within(dialog).getByRole("button", { name: "打开邮件" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "复制邮件内容" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /发送邮件/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/发送邮件/)).not.toBeInTheDocument();
  });

  it("shows per-item Quick Add progress without ever claiming the order succeeded", async () => {
    const user = userEvent.setup();
    getCurrentOrderingBatch.mockResolvedValue({ batch: task7Batch, readyIntakes: [] });
    runBrakesQuickAdd.mockResolvedValue({
      ...task7Batch,
      items: task7Batch.items.map((item) => item.supplierGroup === "BRK" ? { ...item, brakesStatus: "Added" } : item)
    });
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "填入 Brakes 购物车" }));

    expect(await screen.findByText("已填入购物车")).toBeInTheDocument();
    expect(screen.queryByText("下单成功")).not.toBeInTheDocument();
    expect(runBrakesQuickAdd).toHaveBeenCalledWith(task7Batch.id);
  });

  it("retries Quick Add without repeating rows already marked Added", async () => {
    const user = userEvent.setup();
    const retryBatch = {
      ...task7Batch,
      items: [
        ...task7Batch.items.filter((item) => item.supplierGroup !== "BRK"),
        { ...task7Batch.items[2], brakesStatus: "Added" },
        { ...task7Batch.items[2], id: "item-brakes-failed", productName: "Brakes Failed Item", supplierProductCode: "FAILED-2", brakesStatus: "Failed" }
      ]
    };
    getCurrentOrderingBatch.mockResolvedValue({ batch: retryBatch, readyIntakes: [] });
    runBrakesQuickAdd.mockResolvedValue({
      ...retryBatch,
      items: retryBatch.items.map((item) => item.id === "item-brakes-failed" ? { ...item, brakesStatus: "Added" } : item)
    });
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "重试 Brakes Quick Add" }));

    expect(runBrakesQuickAdd).toHaveBeenCalledTimes(1);
    expect(runBrakesQuickAdd).toHaveBeenCalledWith(retryBatch.id);
    expect(screen.getAllByText("已填入购物车")).toHaveLength(2);
  });

  it("allows mark ordered only for Prepared suppliers and requires yes/no confirmation", async () => {
    const user = userEvent.setup();
    getCurrentOrderingBatch.mockResolvedValue({ batch: task7Batch, readyIntakes: [] });
    const partiallyOrdered = {
      ...task7Batch,
      status: "PartiallyOrdered",
      suppliers: task7Batch.suppliers.map((supplier) => supplier.supplierCode === "CMP" ? { ...supplier, status: "Ordered", orderedAt: "2026-07-11T11:00:00.000Z" } : supplier),
      supplierGroups: task7Batch.supplierGroups.map((supplier) => supplier.supplierCode === "CMP" ? { ...supplier, status: "Ordered", orderedAt: "2026-07-11T11:00:00.000Z" } : supplier)
    };
    markSupplierOrdered.mockResolvedValue(partiallyOrdered);
    render(<OrderingPage />);

    expect(await screen.findByRole("button", { name: /Campbells.*标记为已下单/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Brakes.*标记为已下单/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Mark Murphy.*标记为已下单/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Campbells.*标记为已下单/ }));
    let dialog = screen.getByRole("dialog", { name: "确认已下单" });
    expect(within(dialog).getByRole("button", { name: "是" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "否" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "否" }));
    expect(markSupplierOrdered).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Campbells.*标记为已下单/ }));
    dialog = screen.getByRole("dialog", { name: "确认已下单" });
    await user.click(within(dialog).getByRole("button", { name: "是" }));

    expect(markSupplierOrdered).toHaveBeenCalledWith(task7Batch.id, "CMP");
    expect(await screen.findByText("部分已下单")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Brakes.*标记为已下单/ })).toBeEnabled();
  });

  it("adds a directly entered unmatched product to the unmatched supplier group", async () => {
    const user = userEvent.setup();
    const unmatchedItem = {
      id: "item-unmatched-task-7",
      batchId: emptyBatch.id,
      productName: "Local Event Garnish",
      supplierGroup: "UNMATCHED",
      supplierProductId: null,
      supplierProductCode: null,
      supplierName: null,
      packSize: null,
      orderQuantity: 3,
      orderUnit: "tray",
      lastPrice: null,
      purchaseCount: null,
      latestPurchaseDate: null,
      brakesStatus: "Pending"
    };
    addOrderingItem.mockResolvedValue({
      ...emptyBatch,
      items: [unmatchedItem]
    });
    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "手动添加" }));
    await user.click(screen.getByRole("button", { name: "直接录入未匹配商品" }));
    await user.type(screen.getByLabelText("产品名称"), unmatchedItem.productName);
    await user.clear(screen.getByLabelText("订购数量"));
    await user.type(screen.getByLabelText("订购数量"), "3");
    await user.type(screen.getByLabelText("单位"), unmatchedItem.orderUnit);
    await user.click(screen.getByRole("button", { name: "添加到下单" }));

    expect(addOrderingItem).toHaveBeenCalledWith(emptyBatch.id, {
      productName: unmatchedItem.productName,
      orderQuantity: 3,
      orderUnit: unmatchedItem.orderUnit,
      supplierGroup: "UNMATCHED"
    });
    expect(screen.getByRole("button", { name: "未匹配供应商 分组" })).toBeInTheDocument();
    expect(await screen.findByText(unmatchedItem.productName)).toBeInTheDocument();
  });

  it("shows a Chinese error when a ready intake fails to import", async () => {
    const user = userEvent.setup();
    const failMessage = "该采购清单尚未准备好转入下单模块。";
    getCurrentOrderingBatch.mockResolvedValueOnce({
      batch: emptyBatch,
      readyIntakes: [{ id: "intake-failed", originalFilename: "invoice.csv", itemCount: 2 }]
    });
    importReadyIntake.mockRejectedValue(new Error(failMessage));

    render(<OrderingPage />);

    await user.click(await screen.findByRole("button", { name: "导入 invoice.csv（2 项）" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(failMessage);
  });

  it("uses the latest Mark Murphy quantity when prepare is clicked before blur save settles", async () => {
    const user = userEvent.setup();
    const markMurphyItemId = "item-mm-task-7";
    const draft = {
      supplierCode: "MM" as const,
      to: "orders@markmurphy.example",
      subject: "Purchase order PO-5005",
      body: "Please prepare our Mark Murphy order."
    };

    getCurrentOrderingBatch.mockResolvedValue({ batch: task7Batch, readyIntakes: [] });
    let resolveUpdate: (value: unknown) => void = () => {};
    const updatedBatch = {
      ...task7Batch,
      items: task7Batch.items.map((item) => item.id === markMurphyItemId ? { ...item, orderQuantity: 12 } : item)
    };
    const updateOrderingItemDeferred = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    updateOrderingItem.mockResolvedValue({
      ...task7Batch,
      items: task7Batch.items.map((item) => item.id === markMurphyItemId ? { ...item, orderQuantity: 12 } : item)
    });
    updateOrderingItem.mockImplementationOnce(() => updateOrderingItemDeferred);
    prepareSupplierGroup.mockResolvedValue({
      kind: "email-draft",
      draft
    });

    render(<OrderingPage />);

    const quantityInput = await screen.findByRole("spinbutton", { name: /Mark Murphy Milk/ });
    await user.clear(quantityInput);
    await user.type(quantityInput, "12");
    await user.click(await screen.findByRole("button", { name: "准备 Mark Murphy 邮件" }));

    await Promise.resolve();
    expect(prepareSupplierGroup).toHaveBeenCalledTimes(0);

    resolveUpdate(updatedBatch);
    expect(await screen.findByRole("dialog", { name: "Mark Murphy 邮件草稿" })).toBeInTheDocument();

    expect(updateOrderingItem).toHaveBeenCalledTimes(2);
    expect(updateOrderingItem).toHaveBeenNthCalledWith(1, task7Batch.id, markMurphyItemId, { orderQuantity: 12 });
    expect(updateOrderingItem).toHaveBeenNthCalledWith(2, task7Batch.id, markMurphyItemId, { orderQuantity: 12 });
    expect(prepareSupplierGroup).toHaveBeenCalledWith(task7Batch.id, "MM");
  });

  it.each(["NoMatch", "SEA-B", "SEAB", "SEA B"])("shows a half-year no-history prompt for manual search and keeps direct-entry available", async (query) => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });

    render(<OrderingPage />);
    await user.click(await screen.findByRole("button", { name: "手动添加" }));

    await user.type(await screen.findByLabelText("搜索历史发票商品"), query);
    expect(await screen.findByRole("dialog", { name: `匹配发票商品 ${query}` })).toHaveTextContent(
      "近半年没有找到历史采购记录，当前商品未出现在发票中。请删除此行，或在下单页手动录入。"
    );
    expect(screen.queryByRole("button", { name: "确认未找到历史商品" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "直接录入未匹配商品" }));

    await user.type(screen.getByLabelText("产品名称"), "Event garnish");
    await user.clear(screen.getByLabelText("订购数量"));
    await user.type(screen.getByLabelText("订购数量"), "2");
    await user.type(screen.getByLabelText("单位"), "tray");
    await user.click(screen.getByRole("button", { name: "添加到下单" }));

    expect(addOrderingItem).toHaveBeenCalledWith(emptyBatch.id, {
      productName: "Event garnish",
      orderQuantity: 2,
      orderUnit: "tray",
      supplierGroup: "UNMATCHED"
    });
    expect(await screen.findByRole("button", { name: "未匹配供应商 分组" })).toBeInTheDocument();
  });
});
