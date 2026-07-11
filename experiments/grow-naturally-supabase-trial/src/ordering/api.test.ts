import { afterEach, describe, expect, it, vi } from "vitest";

const orderingApiErrorMessages = {
  PO_REQUIRED: "请先填写 PO 再继续操作。",
  INVALID_ORDER_QUANTITY: "订购数量无效，请填写大于 0 的数字。",
  SUPPLIER_PRODUCT_NOT_FOUND: "未找到对应历史商品，商品信息已过期。",
  INTAKE_ALREADY_ADDED: "该采购清单已转入下单模块。",
  INTAKE_NOT_READY_FOR_ORDER: "该采购清单尚未准备好转入下单模块。",
  ORDER_BATCH_NOT_FOUND: "当前下单批次不存在。"
} as const;

function mockHttpResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function mockOrderingApiError(code: keyof typeof orderingApiErrorMessages) {
  return mockHttpResponse(400, {
    error: {
      code
    }
  });
}

async function loadOrderingApi() {
  return (await vi.importActual<typeof import("./api")>("./api")) as {
    getCurrentOrderingBatch: () => Promise<unknown>;
    importReadyIntake: (intakeId: string) => Promise<unknown>;
    saveBatchPo: (batchId: string, poNumber: string) => Promise<unknown>;
    addOrderingItem: (batchId: string, input: unknown) => Promise<unknown>;
    updateOrderingItem: (batchId: string, itemId: string, input: unknown) => Promise<unknown>;
    deleteOrderingItem: (batchId: string, itemId: string) => Promise<unknown>;
    getOrderingProfile: () => Promise<unknown>;
    saveOrderingProfile: (profile: unknown) => Promise<unknown>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ordering api", () => {
  it("calls exact URLs for current batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockHttpResponse(200, { batch: { status: "Draft" }, readyIntakes: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadOrderingApi();
    await api.getCurrentOrderingBatch();
    expect(fetchMock).toHaveBeenCalledWith("/api/ordering/current", expect.objectContaining({ method: "GET" }));
  });

  it("calls exact URLs for intake transfer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockHttpResponse(200, { intakeStatus: "AddedToOrder", batch: { id: "batch-1", items: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const api = await loadOrderingApi();
    await api.importReadyIntake("intake-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ordering/current/intakes/intake-1",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("calls exact URLs for batch / item CRUD", async () => {
    const responses: Response[] = [
      mockHttpResponse(200, { batch: { id: "batch-1", items: [] } }),
      mockHttpResponse(200, { batch: { id: "batch-1", items: [{ id: "item-1", supplierProductId: "BRK-100243", orderQuantity: 2 }] } }),
      mockHttpResponse(200, { batch: { id: "batch-1", items: [] } }),
      mockHttpResponse(200, { batch: { id: "batch-1", items: [] } }),
      mockHttpResponse(200, { batch: { id: "batch-1", items: [] } })
    ];
    const fetchMock = vi.fn().mockImplementation(async () => responses.shift() || mockHttpResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadOrderingApi();
    await api.saveBatchPo("batch-1", "PO-001");
    await api.addOrderingItem("batch-1", { supplierProductId: "BRK-100243", orderQuantity: 2 });
    await api.addOrderingItem("batch-1", { productName: "Manual", orderQuantity: 3, orderUnit: "bag", supplierGroup: "CMP" });
    await api.updateOrderingItem("batch-1", "item-1", { orderQuantity: 3 });
    await api.deleteOrderingItem("batch-1", "item-1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ordering/batches/batch-1/po", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/ordering/batches/batch-1/items",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/ordering/batches/batch-1/items",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/ordering/batches/batch-1/items/item-1",
      expect.objectContaining({ method: "PUT" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/ordering/batches/batch-1/items/item-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("calls exact URLs for profile APIs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockHttpResponse(200, { purchaserName: "", hotelName: "", campbellsEmail: "", markMurphyEmail: "" }));
    vi.stubGlobal("fetch", fetchMock);

    const api = await loadOrderingApi();
    await api.getOrderingProfile();
    await api.saveOrderingProfile({
      purchaserName: "Test",
      hotelName: "Hotel",
      campbellsEmail: "a@campbells.example",
      markMurphyEmail: "b@mark.example"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ordering/profile", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/ordering/profile", expect.objectContaining({ method: "PUT" }));
  });

  it.each(Object.entries(orderingApiErrorMessages))(
    "normalizes %s into stable Chinese text",
    async (code, message) => {
      const fetchMock = vi.fn().mockResolvedValue(mockOrderingApiError(code as keyof typeof orderingApiErrorMessages));
      vi.stubGlobal("fetch", fetchMock);
      const api = await loadOrderingApi();

      const fn =
        code === "PO_REQUIRED"
          ? () => api.saveBatchPo("batch-1", "")
          : code === "INVALID_ORDER_QUANTITY" || code === "SUPPLIER_PRODUCT_NOT_FOUND"
            ? () => api.addOrderingItem("batch-1", { supplierProductId: "BRK-100243", orderQuantity: 0 })
            : code === "INTAKE_ALREADY_ADDED"
              ? () => api.importReadyIntake("intake-1")
              : code === "INTAKE_NOT_READY_FOR_ORDER"
                ? () => api.importReadyIntake("intake-1")
                : () => api.updateOrderingItem("missing-batch", "item-1", { orderQuantity: 2 });

      await expect(fn()).rejects.toThrow(message);
      expect(fetchMock).toHaveBeenCalled();
    }
  );
});
