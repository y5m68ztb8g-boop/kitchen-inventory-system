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
  prepareSupplierGroup,
  recordInventoryRecheck,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
  searchHistoricalProducts,
  updateOrderingItem
} = vi.hoisted(() => ({
  acknowledgeRestockOnly: vi.fn(),
  addOrderingItem: vi.fn(),
  deleteOrderingItem: vi.fn(),
  getCurrentOrderingBatch: vi.fn(),
  getOrderingProfile: vi.fn(),
  prepareSupplierGroup: vi.fn(),
  recordInventoryRecheck: vi.fn(),
  saveBatchPo: vi.fn(),
  saveOrderingProfile: vi.fn(),
  saveSupplierEmailDraft: vi.fn(),
  searchHistoricalProducts: vi.fn(),
  updateOrderingItem: vi.fn()
}));

vi.mock("./ordering/api", () => ({
  acknowledgeRestockOnly,
  addOrderingItem,
  deleteOrderingItem,
  getCurrentOrderingBatch,
  getOrderingProfile,
  prepareSupplierGroup,
  recordInventoryRecheck,
  saveBatchPo,
  saveOrderingProfile,
  saveSupplierEmailDraft,
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
    acknowledgeRestockOnly.mockResolvedValue(emptyBatch);
    recordInventoryRecheck.mockResolvedValue(emptyBatch);
    saveBatchPo.mockResolvedValue(emptyBatch);
    saveSupplierEmailDraft.mockResolvedValue(emptyBatch);
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
    expect(within(dialog).getAllByRole("link", { name: "去核查库存" })).toHaveLength(2);
    expect(within(dialog).getAllByRole("button", { name: "仅补货" })).toHaveLength(2);
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
});
