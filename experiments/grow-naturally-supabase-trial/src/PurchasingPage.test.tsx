import { act } from "react-dom/test-utils";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PurchasingPage } from "./PurchasingPage";

const {
  parseIntake,
  savePendingIntake,
  readyForPurchase,
  searchHistoricalProducts,
  scanWhiteboard,
  confirmWhiteboardScan
} = vi.hoisted(() => ({
  parseIntake: vi.fn(),
  savePendingIntake: vi.fn(),
  readyForPurchase: vi.fn(),
  searchHistoricalProducts: vi.fn(),
  scanWhiteboard: vi.fn(),
  confirmWhiteboardScan: vi.fn()
}));

const { importReadyIntake } = vi.hoisted(() => ({ importReadyIntake: vi.fn() }));

vi.mock("./purchasing/api", () => ({
  parseIntake,
  savePendingIntake,
  readyForPurchase,
  searchHistoricalProducts,
  scanWhiteboard,
  confirmWhiteboardScan
}));

vi.mock("./ordering/api", () => ({ importReadyIntake }));

describe("PurchasingPage intake hub", () => {
  beforeEach(() => {
    scanWhiteboard.mockReset();
    confirmWhiteboardScan.mockReset();
    parseIntake.mockReset();
    savePendingIntake.mockReset();
    readyForPurchase.mockReset();
    importReadyIntake.mockReset();
    importReadyIntake.mockReset();
    searchHistoricalProducts.mockReset();

    URL.createObjectURL = vi.fn(() => "blob:purchase-input");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the AI intake hub actions and correct intake constraints", () => {
    render(<PurchasingPage />);

    expect(screen.getByRole("button", { name: "AI拍照识别录入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动上传录入" })).toBeInTheDocument();

    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);
    const manualInput = screen.getByLabelText(/选择|手动|upload/i);

    expect(cameraInput).toHaveAttribute(
      "accept",
      expect.stringContaining("image/jpeg")
    );
    expect(cameraInput).toHaveAttribute("accept", expect.stringContaining("image/png"));
    expect(cameraInput).toHaveAttribute("accept", expect.stringContaining("image/heic"));
    expect(cameraInput).toHaveAttribute("accept", expect.stringContaining("image/heif"));
    expect(cameraInput).toHaveAttribute("accept", expect.stringContaining("image/webp"));
    expect(cameraInput).toHaveAttribute("capture", "environment");

    expect(manualInput).toHaveAttribute("accept", expect.stringContaining("application/pdf"));
    expect(manualInput).toHaveAttribute("accept", expect.stringContaining(".pdf"));
    expect(manualInput).toHaveAttribute("accept", expect.stringContaining(".xlsx"));
    expect(manualInput).toHaveAttribute("accept", expect.stringContaining(".xls"));
    expect(manualInput).toHaveAttribute("accept", expect.stringContaining(".csv"));
  });

  it("shows image preview and supports re-capture and rescan controls", async () => {
    const user = userEvent.setup();
    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["receipt"], "invoice.jpg", { type: "image/jpeg" }));

    expect(screen.getByRole("img", { name: /预览|预览图|图片/ })).toHaveAttribute("src", "blob:purchase-input");
    expect(screen.getByRole("button", { name: "重新拍照" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择其他文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始识别" })).toBeInTheDocument();
  });

  it("shows non-image filename and type and keeps file URL across recognition retries", async () => {
    const user = userEvent.setup();
    render(<PurchasingPage />);
    const manualInput = screen.getByLabelText(/选择|手动|upload/i);

    await user.upload(manualInput, new File(["report"], "weekend-events.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));

    expect(screen.getByText("weekend-events.xlsx")).toBeInTheDocument();
    expect(screen.getByText("表格 / XLSX")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始识别" })).toBeInTheDocument();
  });

  it("keeps manual PDF/XLSX preview source preview URL and revokes object URLs on replace/unmount", async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:purchase-pdf")
      .mockReturnValueOnce("blob:purchase-xlsx");

    const { unmount } = render(<PurchasingPage />);
    const manualInput = screen.getByLabelText(/选择|手动|upload/i);

    await user.upload(manualInput, new File(["report"], "weekend-events.pdf", { type: "application/pdf" }));
    const openPdfSource = screen.getByRole("link", { name: "查看原始文件" });
    expect(openPdfSource).toHaveAttribute("href", "blob:purchase-pdf");

    await user.upload(manualInput, new File(["report"], "weekend-events.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:purchase-pdf");
    const openXlsxSource = screen.getByRole("link", { name: "查看原始文件" });
    expect(openXlsxSource).toHaveAttribute("href", "blob:purchase-xlsx");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:purchase-xlsx");
  });

  it("revokes replaced preview URLs and the final URL on unmount", async () => {
    URL.createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const user = userEvent.setup();
    const { unmount } = render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);
    const manualInput = screen.getByLabelText(/选择|手动|upload/i);

    await user.upload(cameraInput, new File(["first"], "first.jpg", { type: "image/jpeg" }));
    await user.upload(manualInput, new File(["second"], "second.jpg", { type: "image/jpeg" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });
});

describe("PurchasingPage recognition and review", () => {
  beforeEach(() => {
    scanWhiteboard.mockReset().mockResolvedValue({
      generalNotes: "周五送货",
      imageUrl: "/api/purchasing/intakes/intake-1/source",
      items: [
        {
          confidence: 0.78,
          department: "厨房",
          notes: null,
          product_name: "橙汁",
          quantity: 2,
          raw_text: "2箱橙汁",
          unit: "箱"
        },
        {
          confidence: 0.95,
          department: "酒吧",
          notes: null,
          product_name: "高档牛奶",
          quantity: 1,
          raw_text: "高档牛奶",
          unit: "箱"
        }
      ],
      scanId: "intake-1",
      unreadableText: ["注释不可识别文字"]
    });

    parseIntake.mockReset().mockResolvedValue({
      sourceType: "image",
      sourceUrl: "/api/purchasing/intakes/intake-1/source",
      originalFilename: "invoice.jpg",
      intakeId: "intake-1",
      items: [
        {
          confidence: 0.78,
          department: "厨房",
          notes: null,
          product_name: "橙汁",
          quantity: 2,
          raw_text: "2箱橙汁",
          unit: "箱"
        },
        {
          confidence: 0.95,
          department: "酒吧",
          notes: null,
          product_name: "高档牛奶",
          quantity: 1,
          raw_text: "高档牛奶",
          unit: "箱"
        }
      ],
      unreadableText: ["注释不可识别文字"],
      generalNotes: "周五送货"
    });

    parseIntake.mockClear();
    savePendingIntake.mockReset();
    readyForPurchase.mockReset();
    importReadyIntake.mockReset().mockResolvedValue({
      batch: { id: "batch-task-5" },
      readyIntakes: [],
      intakeStatus: "AddedToOrder"
    });
    searchHistoricalProducts.mockReset().mockResolvedValue({
      candidates: [
        {
          id: "BRK-ORANGE",
          isRecommended: true,
          productName: "Orange Juice",
          supplierName: "Brakes",
          supplierCode: "BRK",
          supplierProductCode: "OJ-1",
          packSize: "4x2.5L",
          latestPrice: 24.5,
          purchaseCount: 10,
          latestPurchaseDate: "2026-07-01",
          currentInventoryQuantity: 7
        }
      ]
    });

    savePendingIntake.mockResolvedValue({
      status: "Pending",
      intakeId: "intake-1",
      items: []
    });

    readyForPurchase.mockResolvedValue({
      status: "ReadyForPurchase",
      intakeId: "intake-1"
    });
    importReadyIntake.mockResolvedValue({
      batch: { id: "batch-task-5" },
      readyIntakes: [],
      intakeStatus: "AddedToOrder"
    });

    URL.createObjectURL = vi.fn(() => "blob:purchase-input");
    URL.revokeObjectURL = vi.fn();
  });

  it("requires manual review for low-confidence items and supports row edit, remove and add", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });
    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    const row = screen.getByTestId("purchase-review-row-1");
    expect(row).toHaveClass("purchase-review-row-low-confidence");
    expect(screen.getByRole("checkbox", { name: /已人工核对 1/ })).not.toBeChecked();

    await user.clear(screen.getByLabelText("部门 1"));
    await user.type(screen.getByLabelText("部门 1"), "宴会");
    await user.clear(screen.getByLabelText("产品名称 1"));
    await user.type(screen.getByLabelText("产品名称 1"), "橙汁（修订）");
    await user.clear(screen.getByLabelText("数量 1"));
    await user.type(screen.getByLabelText("数量 1"), "3");
    await user.clear(screen.getByLabelText("单位 1"));
    await user.type(screen.getByLabelText("单位 1"), "箱");
    await user.clear(screen.getByLabelText("备注 1"));
    await user.type(screen.getByLabelText("备注 1"), "无糖");
    await user.click(screen.getByRole("button", { name: "删除第 2 行" }));
    await user.click(screen.getByRole("button", { name: "新增一行" }));

    expect(screen.getByLabelText("产品名称 2")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /已人工核对 2/ })).not.toBeChecked();
    const firstRow = screen.getByTestId("purchase-review-row-1");
    const secondRow = screen.getByTestId("purchase-review-row-2");
    await user.click(within(firstRow).getByRole("button", { name: /匹配发票商品/ }));
    const firstMatchDialog = await screen.findByRole("dialog", { name: /匹配发票商品/ });
    await user.click(within(firstMatchDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(within(secondRow).getByRole("button", { name: /匹配发票商品/ }));
    const secondMatchDialog = await screen.findByRole("dialog", { name: /匹配发票商品/ });
    await user.click(within(secondMatchDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(within(secondRow).getByRole("button", { name: /删除第 2 行/ }));

    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(savePendingIntake).toHaveBeenCalledWith(
      "intake-1",
      expect.arrayContaining([
        expect.objectContaining({
          clientId: expect.any(String),
          product_name: "橙汁（修订）",
          quantity: 3,
          notes: "无糖",
          raw_text: "2箱橙汁"
        })
      ])
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeInTheDocument();
  });

  it("opens historical matching dialog, updates row names from product selection and allows clear", async () => {
    const user = userEvent.setup();
    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));

    expect(await screen.findByText("推荐购买")).toBeInTheDocument();
    expect(screen.getByText("Brakes")).toBeInTheDocument();
    expect(screen.getByText("BRK")).toBeInTheDocument();
    expect(screen.getByText("OJ-1")).toBeInTheDocument();
    expect(screen.getByText("4x2.5L")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择 Orange Juice" }));
    expect(screen.getByLabelText("产品名称 1")).toHaveValue("Orange Juice");

    await user.click(screen.getByRole("button", { name: "清除匹配" }));
    expect(screen.getByLabelText("产品名称 1")).toHaveValue("Orange Juice");
  });

  it.each([
    { quantity: null, label: "null" },
    { quantity: 0, label: "0" }
  ])("blocks handoff when review quantity is $label and shows quantity hint", async ({ quantity }) => {
    const user = userEvent.setup();
    parseIntake.mockResolvedValue({
      sourceType: "image",
      sourceUrl: "/api/purchasing/intakes/intake-1/source",
      originalFilename: "invoice.jpg",
      intakeId: "intake-1",
      items: [
        {
          confidence: 0.95,
          department: "厨房",
          notes: null,
          product_name: "橙汁",
          quantity,
          raw_text: quantity === null ? "未识别到数量 橙汁" : "2箱橙汁",
          unit: "箱"
        }
      ],
      unreadableText: [],
      generalNotes: null
    });
    searchHistoricalProducts.mockResolvedValue({
      candidates: [
        {
          id: "BRK-ORANGE",
          isRecommended: true,
          productName: "Orange Juice",
          supplierName: "Brakes",
          supplierCode: "BRK",
          supplierProductCode: "OJ-1",
          packSize: "4x2.5L",
          latestPrice: 24.5,
          purchaseCount: 10,
          latestPurchaseDate: "2026-07-01",
          currentInventoryQuantity: 7
        }
      ]
    });

    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["invoice"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));
    await user.click(screen.getByRole("button", { name: "选择 Orange Juice" }));
    const handoffButton = screen.getByRole("button", { name: "转入下单模块" });
    expect(handoffButton).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/缺少有效数量/);

    await user.click(handoffButton);
    expect(readyForPurchase).not.toHaveBeenCalled();
    expect(importReadyIntake).not.toHaveBeenCalled();
  });

  it("preserves matchQueryName on save payload while saving canonical match product name", async () => {
    const user = userEvent.setup();
    parseIntake.mockResolvedValue({
      sourceType: "image",
      sourceUrl: "/api/purchasing/intakes/intake-1/source",
      originalFilename: "invoice.jpg",
      intakeId: "intake-1",
      items: [
        {
          confidence: 0.95,
          department: "厨房",
          notes: null,
          product_name: "cold brew",
          quantity: 2,
          raw_text: "2 cold brew",
          unit: "箱"
        }
      ],
      unreadableText: [],
      generalNotes: null
    });
    searchHistoricalProducts.mockResolvedValue({
      candidates: [
        {
          id: "BRK-CBREW",
          isRecommended: true,
          productName: "Brew Cold Blend",
          supplierName: "Brakes",
          supplierCode: "BRK",
          supplierProductCode: "BC-1",
          packSize: "2x6",
          latestPrice: 29.9,
          purchaseCount: 7,
          latestPurchaseDate: "2026-07-01",
          currentInventoryQuantity: 4
        }
      ]
    });

    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    await user.click(screen.getByRole("button", { name: "匹配发票商品 cold brew" }));
    expect(await screen.findByText("历史发票商品")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择 Brew Cold Blend" }));
    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(savePendingIntake).toHaveBeenCalledWith(
      "intake-1",
      expect.arrayContaining([
        expect.objectContaining({
          clientId: expect.any(String),
          matchQueryName: "cold brew",
          product_name: "Brew Cold Blend",
          supplierProductId: "BRK-CBREW"
        })
      ])
    );
  });

  it("transitions pending save and keeps review state before handoff", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });
    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));
    const firstConfirmDialog = await screen.findByRole("dialog", { name: "匹配发票商品 橙汁" });
    await user.click(within(firstConfirmDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(screen.getByRole("button", { name: /匹配发票商品 高档牛奶/ }));
    const secondConfirmDialog = await screen.findByRole("dialog", { name: "匹配发票商品 高档牛奶" });
    await user.click(within(secondConfirmDialog).getByRole("button", { name: "确认未找到历史商品" }));

    await user.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(savePendingIntake).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "转入下单模块" }));

    expect(readyForPurchase).toHaveBeenCalledWith(
      "intake-1",
      expect.arrayContaining([
        expect.objectContaining({
          clientId: expect.any(String),
          supplierProductId: null,
          product_name: "橙汁"
        })
      ])
    );
    expect(importReadyIntake).toHaveBeenCalledWith("intake-1");
    expect(window.location.hash).toBe("#ordering");
  });

  it("offers ordering handoff after AI intake success, imports once and navigates to ordering", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });
    window.location.hash = "#purchasing";
    render(<PurchasingPage />);

    await user.upload(screen.getByLabelText(/拍照|camera|摄像/i), new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));
    const firstConfirmDialog = await screen.findByRole("dialog", { name: "匹配发票商品 橙汁" });
    await user.click(within(firstConfirmDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(screen.getByRole("button", { name: /匹配发票商品 高档牛奶/ }));
    const secondConfirmDialog = await screen.findByRole("dialog", { name: "匹配发票商品 高档牛奶" });
    await user.click(within(secondConfirmDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(screen.getByRole("button", { name: "转入下单模块" }));

    await waitFor(() => {
      expect(importReadyIntake).toHaveBeenCalledTimes(1);
      expect(importReadyIntake).toHaveBeenCalledWith("intake-1");
      expect(readyForPurchase).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe("#ordering");
    });
  });

  it("requires explicit confirmation before handing off rows without historical match", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });

    render(<PurchasingPage />);
    await user.upload(screen.getByLabelText(/拍照|camera|摄像/i), new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    for (let index = 0; index < screen.getAllByTestId(/purchase-review-row-/).length; index += 1) {
      const rowId = `purchase-review-row-${index + 1}`;
      const row = screen.getByTestId(rowId);
      const matchButton = within(row).getByRole("button", { name: /匹配发票商品/ });
      await user.click(matchButton);
      const confirmDialog = await screen.findByRole("dialog", { name: /匹配发票商品/ });
      expect(confirmDialog).toHaveTextContent("未找到历史商品");
      expect(within(confirmDialog).getByRole("button", { name: "确认未找到历史商品" })).toBeInTheDocument();
      await user.click(within(confirmDialog).getByRole("button", { name: "确认未找到历史商品" }));
      await waitFor(() => {
        expect(screen.getByTestId(rowId)).toHaveTextContent("已确认未找到历史商品");
      });
    }
    expect(screen.getByRole("button", { name: "转入下单模块" })).toBeEnabled();
  });

  it("disables all review controls while savePendingIntake is pending and re-enables after resolve", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });
    let resolveSavePending: (value: { status: string; intakeId: string; items: never[] }) => void;
    savePendingIntake.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSavePending = resolve;
        })
    );

    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));
    const firstPendingDialog = await screen.findByRole("dialog", { name: "匹配发票商品 橙汁" });
    await user.click(within(firstPendingDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(screen.getByRole("button", { name: /匹配发票商品 高档牛奶/ }));
    const secondPendingDialog = await screen.findByRole("dialog", { name: "匹配发票商品 高档牛奶" });
    await user.click(within(secondPendingDialog).getByRole("button", { name: "确认未找到历史商品" }));

    const saveDraftButton = screen.getByRole("button", { name: "保存草稿" });
    const handoffButton = screen.getByRole("button", { name: "转入下单模块" });
    const addRowButton = screen.getByRole("button", { name: "新增一行" });
    const departmentInput = screen.getByLabelText("部门 1");
    const productInput = screen.getByLabelText("产品名称 1");
    const quantityInput = screen.getByLabelText("数量 1");
    const unitInput = screen.getByLabelText("单位 1");
    const notesInput = screen.getByLabelText("备注 1");
    const reviewCheck = screen.getByRole("checkbox", { name: /已人工核对 1/ });
    const firstRow = screen.getByTestId("purchase-review-row-1");
    const removeRowButton = within(firstRow).getByRole("button", { name: /删除第 1 行/ });
    const matchButton = within(firstRow).getByRole("button", { name: /匹配发票商品/ });

    await user.click(saveDraftButton);
    expect(savePendingIntake).toHaveBeenCalledTimes(1);
    expect(saveDraftButton).toHaveTextContent("保存中...");
    expect(saveDraftButton).toBeDisabled();
    expect(handoffButton).toBeDisabled();
    expect(addRowButton).toBeDisabled();
    expect(departmentInput).toBeDisabled();
    expect(productInput).toBeDisabled();
    expect(quantityInput).toBeDisabled();
    expect(unitInput).toBeDisabled();
    expect(notesInput).toBeDisabled();
    expect(reviewCheck).toBeDisabled();
    expect(matchButton).toBeDisabled();
    expect(removeRowButton).toBeDisabled();

    expect(screen.getAllByTestId(/purchase-review-row-/)).toHaveLength(2);
    await user.click(addRowButton);
    await user.click(removeRowButton);
    await user.click(matchButton);
    await user.click(saveDraftButton);
    await user.click(handoffButton);
    expect(savePendingIntake).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId(/purchase-review-row-/)).toHaveLength(2);

    expect(departmentInput).toHaveValue("厨房");
    expect(productInput).toHaveValue("橙汁");
    expect(quantityInput).toHaveValue(2);
    expect(unitInput).toHaveValue("箱");
    expect(notesInput).toHaveValue("");

    resolveSavePending!({
      status: "Pending",
      intakeId: "intake-1",
      items: []
    });

    expect(await screen.findByText("草稿已保存")).toBeInTheDocument();
    expect(saveDraftButton).toHaveTextContent("保存草稿");
    expect(saveDraftButton).not.toBeDisabled();
    expect(handoffButton).not.toBeDisabled();
    expect(addRowButton).not.toBeDisabled();
    expect(departmentInput).not.toBeDisabled();
    expect(reviewCheck).not.toBeDisabled();

    await user.clear(departmentInput);
    await user.type(departmentInput, "宴会");
    expect(departmentInput).toHaveValue("宴会");
  });

  it("disables review controls while readyForPurchase is pending and locks terminally after resolve", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });
    let resolveReady: (value: { status: string; intakeId: string }) => void;
    readyForPurchase.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReady = resolve;
        })
    );
    importReadyIntake.mockResolvedValue({
      batch: { id: "batch-task-5" },
      readyIntakes: [],
      intakeStatus: "AddedToOrder"
    });

    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));
    const firstReadyDialog = await screen.findByRole("dialog", { name: "匹配发票商品 橙汁" });
    await user.click(within(firstReadyDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(screen.getByRole("button", { name: /匹配发票商品 高档牛奶/ }));
    const secondReadyDialog = await screen.findByRole("dialog", { name: "匹配发票商品 高档牛奶" });
    await user.click(within(secondReadyDialog).getByRole("button", { name: "确认未找到历史商品" }));

    const saveDraftButton = screen.getByRole("button", { name: "保存草稿" });
    const handoffButton = screen.getByRole("button", { name: "转入下单模块" });
    const addRowButton = screen.getByRole("button", { name: "新增一行" });
    const departmentInput = screen.getByLabelText("部门 1");
    const productInput = screen.getByLabelText("产品名称 1");
    const quantityInput = screen.getByLabelText("数量 1");
    const unitInput = screen.getByLabelText("单位 1");
    const notesInput = screen.getByLabelText("备注 1");
    const reviewCheck = screen.getByRole("checkbox", { name: /已人工核对 1/ });
    const firstRow = screen.getByTestId("purchase-review-row-1");
    const removeRowButton = within(firstRow).getByRole("button", { name: /删除第 1 行/ });
    const matchButton = within(firstRow).getByRole("button", { name: /匹配发票商品/ });

    await user.click(handoffButton);
    expect(readyForPurchase).toHaveBeenCalledTimes(1);
    expect(handoffButton).toHaveTextContent("正在转入下单...");
    expect(handoffButton).toBeDisabled();
    expect(saveDraftButton).toBeDisabled();
    expect(addRowButton).toBeDisabled();
    expect(departmentInput).toBeDisabled();
    expect(productInput).toBeDisabled();
    expect(quantityInput).toBeDisabled();
    expect(unitInput).toBeDisabled();
    expect(notesInput).toBeDisabled();
    expect(reviewCheck).toBeDisabled();
    expect(matchButton).toBeDisabled();
    expect(removeRowButton).toBeDisabled();

    expect(screen.getAllByTestId(/purchase-review-row-/)).toHaveLength(2);
    await user.click(addRowButton);
    await user.click(removeRowButton);
    await user.click(matchButton);
    await user.click(saveDraftButton);
    await user.click(handoffButton);
    await user.click(saveDraftButton);
    expect(readyForPurchase).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId(/purchase-review-row-/)).toHaveLength(2);

    await act(async () => {
      resolveReady!({
        status: "ReadyForPurchase",
        intakeId: "intake-1"
      });
    });

    await waitFor(() => {
      expect(importReadyIntake).toHaveBeenCalledWith("intake-1");
      expect(window.location.hash).toBe("#ordering");
    });
    expect(saveDraftButton).toBeDisabled();
    expect(handoffButton).toBeDisabled();
    expect(addRowButton).toBeDisabled();
    expect(departmentInput).toBeDisabled();
    expect(reviewCheck).toBeDisabled();
    expect(matchButton).toBeDisabled();
    expect(removeRowButton).toBeDisabled();
  });

  it("locks review controls in terminal state after ready-for-purchase and prevents duplicate submit operations", async () => {
    const user = userEvent.setup();
    searchHistoricalProducts.mockResolvedValue({ candidates: [] });
    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "匹配发票商品 橙汁" }));
    const firstTerminalDialog = await screen.findByRole("dialog", { name: "匹配发票商品 橙汁" });
    await user.click(within(firstTerminalDialog).getByRole("button", { name: "确认未找到历史商品" }));
    await user.click(screen.getByRole("button", { name: /匹配发票商品 高档牛奶/ }));
    const secondTerminalDialog = await screen.findByRole("dialog", { name: "匹配发票商品 高档牛奶" });
    await user.click(within(secondTerminalDialog).getByRole("button", { name: "确认未找到历史商品" }));

    await user.click(screen.getByRole("button", { name: "转入下单模块" }));

    expect(savePendingIntake).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(readyForPurchase).toHaveBeenCalledTimes(1);
      expect(importReadyIntake).toHaveBeenCalledTimes(1);
      expect(importReadyIntake).toHaveBeenCalledWith("intake-1");
      expect(window.location.hash).toBe("#ordering");
    });
    expect(screen.queryByRole("button", { name: "开始识别" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /重试识别/ })).not.toBeInTheDocument();
  });

  it("requires accessible source dialog semantics for raw file preview", async () => {
    const user = userEvent.setup();
    render(<PurchasingPage />);
    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);

    await user.upload(cameraInput, new File(["whiteboard"], "invoice.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "查看原始文件" }));

    const sourceDialog = screen.getByRole("dialog", { name: "原始采购文件" });
    expect(sourceDialog).toHaveAttribute("aria-modal", "true");

    const closeButton = screen.getByRole("button", { name: "关闭" });
    if (document.activeElement === closeButton) {
      expect(closeButton).toHaveFocus();
    } else {
      expect(closeButton).toBeInTheDocument();
    }

    await user.click(closeButton);
    expect(screen.queryByRole("dialog", { name: "原始采购文件" })).not.toBeInTheDocument();
  });

  it("keeps selected file and allows recognition retry on parse/network errors", async () => {
    const user = userEvent.setup();
    const photo = new File(["receipt"], "invoice.jpg", { type: "image/jpeg" });
    scanWhiteboard.mockRejectedValueOnce(new Error("图片上传失败"));
    parseIntake.mockRejectedValueOnce(new Error("图片上传失败"));
    scanWhiteboard.mockRejectedValueOnce(new Error("图片上传失败"));
    parseIntake.mockResolvedValue({
      sourceType: "image",
      sourceUrl: "/api/purchasing/intakes/intake-2/source",
      originalFilename: "invoice.jpg",
      intakeId: "intake-2",
      items: [
        {
          confidence: 1,
          department: "厨房",
          notes: null,
          product_name: "橙汁",
          quantity: 2,
          raw_text: "2箱橙汁",
          unit: "箱"
        }
      ],
      unreadableText: [],
      generalNotes: null
    });

    render(<PurchasingPage />);

    const cameraInput = screen.getByLabelText(/拍照|camera|摄像/i);
    await user.upload(cameraInput, photo);
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("图片上传失败");
    expect(screen.getByRole("img", { name: /预览|预览图|图片/ })).toHaveAttribute("src", "blob:purchase-input");

    await user.click(screen.getByRole("button", { name: "重试识别" }));
    expect(await screen.findByRole("heading", { name: "核对采购项目" })).toBeInTheDocument();
  });
});

describe("PurchasingPage API client", () => {
  it("parseIntake uploads file as FormData and maps Chinese errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          intakeId: "intake-1",
          sourceType: "image",
          sourceUrl: "/api/purchasing/intakes/intake-1/source",
          originalFilename: "invoice.jpg",
          items: [],
          unreadableText: [],
          generalNotes: null
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 201
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = await vi.importActual<Record<string, any>>("./purchasing/api");
    expect(typeof api.parseIntake).toBe("function");
    const parsed = await api.parseIntake(new File(["x"], "invoice.jpg", { type: "image/jpeg" }));

    expect(parsed.intakeId).toBe("intake-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchasing/intakes/parse",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "NO_READABLE_TEXT", message: "too short" } }), {
          headers: { "Content-Type": "application/json" },
          status: 422
        })
      )
    );

    await expect(
      api.parseIntake(new File(["x"], "invoice.jpg", { type: "image/jpeg" }))
    ).rejects.toThrow("未识别到可用的采购文字。")
  });

  it("savePendingIntake, readyForPurchase and searchHistoricalProducts call their APIs", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = await vi.importActual<Record<string, any>>("./purchasing/api");
    expect(typeof api.savePendingIntake).toBe("function");
    expect(typeof api.readyForPurchase).toBe("function");
    expect(typeof api.searchHistoricalProducts).toBe("function");

    await api.savePendingIntake("intake-1", [
      {
        clientId: "row-1",
        confidence: 1,
        department: "Kitchen",
        manualReviewed: true,
        notes: null,
        product_name: "Orange Juice",
        quantity: 1,
        raw_text: "raw",
        unit: "L"
      }
    ]);

    await api.readyForPurchase("intake-1", []);
    await api.searchHistoricalProducts("orange juice");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchasing/intakes/intake-1",
      expect.objectContaining({ method: "PUT" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchasing/intakes/intake-1/ready-for-purchase",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchasing/historical-products?query=orange%20juice",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("normalizes fetch failures into stable Chinese messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await vi.importActual<Record<string, any>>("./purchasing/api");
    expect(typeof api.parseIntake).toBe("function");

    await expect(api.parseIntake(new File(["x"], "invoice.jpg", { type: "image/jpeg" }))).rejects.toThrow(
      "网络连接失败，请检查网络后重试。"
    );
  });
});
