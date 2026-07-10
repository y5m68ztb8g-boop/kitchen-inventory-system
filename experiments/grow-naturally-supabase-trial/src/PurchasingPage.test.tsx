import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PurchasingPage } from "./PurchasingPage";
import { confirmWhiteboardScan, scanWhiteboard } from "./purchasing/api";

vi.mock("./purchasing/api", () => ({
  confirmWhiteboardScan: vi.fn(),
  scanWhiteboard: vi.fn()
}));

describe("PurchasingPage capture", () => {
  beforeEach(() => {
    vi.mocked(scanWhiteboard).mockReset();
    URL.createObjectURL = vi.fn(() => "blob:purchase-whiteboard");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows a preview and capture controls before recognition starts", async () => {
    const user = userEvent.setup();
    render(<PurchasingPage />);

    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "#");
    expect(screen.getByRole("button", { name: "Scan Purchase Whiteboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择现有图片" })).toBeInTheDocument();

    const cameraInput = screen.getByLabelText("拍摄采购白板");
    expect(cameraInput).toHaveAttribute("accept", "image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif");
    expect(cameraInput).toHaveAttribute("capture", "environment");

    const chooserInput = screen.getByLabelText("选择采购白板图片");
    expect(chooserInput).toHaveAttribute("accept", "image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif");
    expect(chooserInput).not.toHaveAttribute("capture");

    await user.upload(cameraInput, new File(["whiteboard"], "whiteboard.jpg", { type: "image/jpeg" }));

    expect(cameraInput).toHaveValue("");
    expect(screen.getByRole("img", { name: "采购白板预览" })).toHaveAttribute("src", "blob:purchase-whiteboard");
    expect(screen.getByRole("button", { name: "重新拍照" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择其他图片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始识别" })).toBeInTheDocument();
    expect(scanWhiteboard).not.toHaveBeenCalled();
  });

  it("revokes replaced preview URLs and the remaining URL on unmount", async () => {
    URL.createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:first-whiteboard")
      .mockReturnValueOnce("blob:second-whiteboard");
    const user = userEvent.setup();
    const { unmount } = render(<PurchasingPage />);

    await user.upload(screen.getByLabelText("拍摄采购白板"), new File(["first"], "first.jpg", { type: "image/jpeg" }));
    await user.upload(screen.getByLabelText("选择采购白板图片"), new File(["second"], "second.jpg", { type: "image/jpeg" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first-whiteboard");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second-whiteboard");
  });
});

describe("PurchasingPage review", () => {
  beforeEach(() => {
    vi.mocked(scanWhiteboard).mockReset();
    vi.mocked(confirmWhiteboardScan).mockReset();
    URL.createObjectURL = vi.fn(() => "blob:purchase-whiteboard");
    URL.revokeObjectURL = vi.fn();
  });

  it("preserves the selected file and preview when recognition fails and retries the same file", async () => {
    const user = userEvent.setup();
    const file = new File(["whiteboard"], "whiteboard.jpg", { type: "image/jpeg" });
    vi.mocked(scanWhiteboard)
      .mockRejectedValueOnce(new Error("网络连接失败，请检查网络后重试。"))
      .mockResolvedValueOnce({
        generalNotes: null,
        imageUrl: "/api/purchasing/whiteboard-scans/scan-retry-recognition/image",
        items: [
          {
            confidence: 0.95,
            department: "厨房",
            notes: null,
            product_name: "鸡胸肉",
            quantity: 2,
            raw_text: "鸡胸肉",
            unit: "箱"
          }
        ],
        scanId: "scan-retry-recognition",
        unreadableText: []
      });
    render(<PurchasingPage />);

    await user.upload(screen.getByLabelText("拍摄采购白板"), file);
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败，请检查网络后重试。");
    expect(screen.getByRole("img", { name: "采购白板预览" })).toHaveAttribute(
      "src",
      "blob:purchase-whiteboard"
    );
    await user.click(screen.getByRole("button", { name: "重试识别" }));

    expect(scanWhiteboard).toHaveBeenNthCalledWith(1, file);
    expect(scanWhiteboard).toHaveBeenNthCalledWith(2, file);
    expect(await screen.findByRole("heading", { name: "核对采购项目" })).toBeInTheDocument();
  });

  it("edits reviewed rows and requires manual review for a low-confidence row", async () => {
    const user = userEvent.setup();
    vi.mocked(scanWhiteboard).mockResolvedValue({
      generalNotes: "周五送货",
      imageUrl: "/api/purchasing/whiteboard-scans/scan-1/image",
      items: [
        {
          confidence: 0.79,
          department: "厨房",
          notes: "切片",
          product_name: "鸡胸肉",
          quantity: 2,
          raw_text: "2 箱鸡胸肉",
          unit: "箱"
        },
        {
          confidence: 0.92,
          department: "酒吧",
          notes: null,
          product_name: "错误项目",
          quantity: 1,
          raw_text: "错误项目",
          unit: "瓶"
        }
      ],
      scanId: "scan-1",
      unreadableText: []
    });
    vi.mocked(confirmWhiteboardScan).mockResolvedValue({ items: [], scanId: "scan-1", status: "Pending" });
    render(<PurchasingPage />);

    await user.upload(screen.getByLabelText("拍摄采购白板"), new File(["whiteboard"], "whiteboard.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));

    const lowConfidenceRow = screen.getByTestId("purchase-review-row-1");
    expect(lowConfidenceRow).toHaveClass("purchase-review-row-low-confidence");
    expect(screen.getByRole("button", { name: "确认保存" })).toBeDisabled();

    await user.clear(screen.getByLabelText("部门 1"));
    await user.type(screen.getByLabelText("部门 1"), "宴会");
    await user.clear(screen.getByLabelText("产品名称 1"));
    await user.type(screen.getByLabelText("产品名称 1"), "鸡腿肉");
    await user.clear(screen.getByLabelText("数量 1"));
    await user.type(screen.getByLabelText("数量 1"), "3");
    await user.clear(screen.getByLabelText("单位 1"));
    await user.type(screen.getByLabelText("单位 1"), "包");
    await user.clear(screen.getByLabelText("备注 1"));
    await user.type(screen.getByLabelText("备注 1"), "去皮");
    const deleteButton = screen.getByRole("button", { name: "删除第 2 行" });
    expect(deleteButton).toHaveAttribute("title", "删除第 2 行");
    expect(deleteButton.querySelector("svg.lucide")).toBeInTheDocument();
    await user.click(deleteButton);
    await user.click(screen.getByRole("button", { name: "新增一行" }));
    expect(screen.getByLabelText("已人工核对 2")).toBeChecked();

    const originalImageButton = screen.getByRole("button", { name: "查看原始图片" });
    expect(originalImageButton).toHaveAttribute("title", "查看原始图片");
    expect(originalImageButton.querySelector("svg.lucide")).toBeInTheDocument();
    await user.click(originalImageButton);
    expect(screen.getByRole("dialog", { name: "原始采购白板" })).toContainElement(
      screen.getByRole("img", { name: "原始采购白板" })
    );
    await user.click(screen.getByRole("button", { name: "关闭图片" }));

    await user.click(screen.getByLabelText("已人工核对 1"));
    await user.click(screen.getByRole("button", { name: "确认保存" }));

    expect(confirmWhiteboardScan).toHaveBeenCalledWith(
      "scan-1",
      expect.arrayContaining([
        expect.objectContaining({
          department: "宴会",
          manualReviewed: true,
          notes: "去皮",
          product_name: "鸡腿肉",
          quantity: 3,
          unit: "包"
        }),
        expect.objectContaining({ confidence: 1, manualReviewed: true })
      ])
    );
  });

  it("preserves edited review rows and offers a save retry after confirmation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(scanWhiteboard).mockResolvedValue({
      generalNotes: null,
      imageUrl: "/api/purchasing/whiteboard-scans/scan-retry/image",
      items: [
        {
          confidence: 0.95,
          department: "厨房",
          notes: null,
          product_name: "鸡胸肉",
          quantity: 2,
          raw_text: "鸡胸肉",
          unit: "箱"
        }
      ],
      scanId: "scan-retry",
      unreadableText: []
    });
    vi.mocked(confirmWhiteboardScan)
      .mockRejectedValueOnce(new Error("网络连接失败，请检查网络后重试。"))
      .mockResolvedValueOnce({ items: [], scanId: "scan-retry", status: "Pending" });
    render(<PurchasingPage />);

    await user.upload(
      screen.getByLabelText("拍摄采购白板"),
      new File(["whiteboard"], "whiteboard.jpg", { type: "image/jpeg" })
    );
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.clear(screen.getByLabelText("产品名称 1"));
    await user.type(screen.getByLabelText("产品名称 1"), "修订鸡胸肉");
    await user.click(screen.getByRole("button", { name: "确认保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败，请检查网络后重试。");
    expect(screen.getByLabelText("产品名称 1")).toHaveValue("修订鸡胸肉");
    expect(screen.getByLabelText("产品名称 1")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "重试保存" }));

    expect(confirmWhiteboardScan).toHaveBeenCalledTimes(2);
    expect(confirmWhiteboardScan).toHaveBeenLastCalledWith(
      "scan-retry",
      expect.arrayContaining([expect.objectContaining({ product_name: "修订鸡胸肉" })])
    );
    expect(await screen.findByRole("heading", { name: "采购项目已保存" })).toBeInTheDocument();
  });
});

describe("purchasing API", () => {
  it("uploads the image as FormData and maps error envelopes to Chinese errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "IMAGE_TOO_LARGE", message: "too large" } }), {
        headers: { "Content-Type": "application/json" },
        status: 413
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await vi.importActual<typeof import("./purchasing/api")>("./purchasing/api");
    const image = new File(["whiteboard"], "whiteboard.png", { type: "image/png" });

    await expect(api.scanWhiteboard(image)).rejects.toThrow("图片不能超过 15 MB。");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/purchasing/scan-whiteboard",
      expect.objectContaining({ body: expect.any(FormData), method: "POST" })
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeUndefined();
  });

  it.each([
    ["NO_READABLE_TEXT", "未识别到可用的采购文字。"],
    ["INVALID_AI_RESPONSE", "识别结果格式无效，请重新识别。"]
  ])("maps %s to a stable Chinese error", async (code, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code, message: "unsafe server detail" } }), {
          headers: { "Content-Type": "application/json" },
          status: 422
        })
      )
    );
    const api = await vi.importActual<typeof import("./purchasing/api")>("./purchasing/api");

    await expect(
      api.scanWhiteboard(new File(["whiteboard"], "whiteboard.png", { type: "image/png" }))
    ).rejects.toThrow(message);
  });

  it("normalizes browser-native fetch failures to a stable Chinese message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await vi.importActual<typeof import("./purchasing/api")>("./purchasing/api");

    await expect(
      api.scanWhiteboard(new File(["whiteboard"], "whiteboard.png", { type: "image/png" }))
    ).rejects.toThrow("网络连接失败，请检查网络后重试。");
  });
});

describe("PurchasingPage saved recommendations", () => {
  beforeEach(() => {
    vi.mocked(scanWhiteboard).mockReset();
    vi.mocked(confirmWhiteboardScan).mockReset();
    URL.createObjectURL = vi.fn(() => "blob:purchase-whiteboard");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the returned historical recommendations and pending status", async () => {
    const user = userEvent.setup();
    vi.mocked(scanWhiteboard).mockResolvedValue({
      generalNotes: null,
      imageUrl: "/api/purchasing/whiteboard-scans/scan-2/image",
      items: [
        {
          confidence: 0.95,
          department: "厨房",
          notes: null,
          product_name: "鸡胸肉",
          quantity: 2,
          raw_text: "鸡胸肉",
          unit: "箱"
        },
        {
          confidence: 0.9,
          department: "酒吧",
          notes: null,
          product_name: "未知项目",
          quantity: 1,
          raw_text: "未知项目",
          unit: "瓶"
        }
      ],
      scanId: "scan-2",
      unreadableText: []
    });
    vi.mocked(confirmWhiteboardScan).mockResolvedValue({
      items: [
        {
          clientId: "first",
          productName: "鸡胸肉",
          recommendation: {
            currentInventoryQuantity: 12,
            recommendedLastPrice: 24.5,
            recommendedLastPurchaseDate: "2026-07-01",
            recommendedPackSize: "2x5kg",
            recommendedProductCode: "CHICKEN-1",
            recommendedProductName: "Chicken Breast",
            recommendedPurchaseCount: 10,
            recommendedSupplierCode: "BRK",
            recommendedSupplierName: "Brakes",
            recommendedSupplierProductId: "BRK-CHICKEN"
          }
        },
        { clientId: "second", productName: "未知项目", recommendation: null }
      ],
      scanId: "scan-2",
      status: "Pending"
    });
    render(<PurchasingPage />);

    await user.upload(screen.getByLabelText("拍摄采购白板"), new File(["whiteboard"], "whiteboard.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByRole("button", { name: "开始识别" }));
    await user.click(screen.getByRole("button", { name: "确认保存" }));

    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
    expect(screen.getByText("Brakes")).toBeInTheDocument();
    expect(screen.getByText("供应商编码")).toBeInTheDocument();
    expect(screen.getByText("BRK")).toBeInTheDocument();
    expect(screen.getByText("供应商产品代码")).toBeInTheDocument();
    expect(screen.getByText("CHICKEN-1")).toBeInTheDocument();
    expect(screen.getByText("2x5kg")).toBeInTheDocument();
    expect(screen.getByText("£24.50")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.getByText("未找到可靠的历史匹配")).toBeInTheDocument();
  });
});
