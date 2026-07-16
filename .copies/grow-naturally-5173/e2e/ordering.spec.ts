import { expect, test, type Page } from "@playwright/test";

const fixturePath = "e2e/fixtures/ordering-intake.csv";

const orderingProfile = {
  purchaserName: "Alex Buyer",
  hotelName: "Natural Growth Hotel",
  campbellsEmail: "orders@campbells.example",
  markMurphyEmail: "orders@markmurphy.example"
};

const orderingBatchSuppliers = [
  { supplierCode: "CMP", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null },
  { supplierCode: "MM", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null },
  { supplierCode: "BRK", status: "Pending", preparedAt: null, orderedAt: null, emailDraft: null }
];

const markMurphyOrderingBatch = {
  id: "batch-mark-murphy",
  poNumber: "PO-5005",
  status: "Draft",
  items: [
    {
      id: "item-cmp-prepare",
      batchId: "batch-mark-murphy",
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
      id: "item-mm-prepare",
      batchId: "batch-mark-murphy",
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
    {
      id: "item-brake-prepare",
      batchId: "batch-mark-murphy",
      productName: "Brakes The Juice Orange",
      supplierGroup: "BRK",
      supplierProductId: "BRK-JUICE-12",
      supplierProductCode: "JUICE-12",
      supplierName: "Brakes",
      packSize: "12x1ltr",
      orderQuantity: 1,
      orderUnit: "12x1ltr",
      lastPrice: 18.4,
      purchaseCount: 8,
      latestPurchaseDate: "2026-07-01",
      brakesStatus: "Pending"
    }
  ],
  suppliers: orderingBatchSuppliers,
  supplierGroups: orderingBatchSuppliers
};

function buildLongOrderingBatch(itemCount = 38) {
  const supplierCodes = ["CMP", "MM", "BRK"] as const;
  const supplierNameByCode: Record<(typeof supplierCodes)[number], string> = {
    CMP: "Campbells",
    MM: "Mark Murphy",
    BRK: "Brakes"
  };
  const longItems = Array.from({ length: itemCount }, (_, index) => {
    const supplierGroup = supplierCodes[index % supplierCodes.length];
    return {
      id: `item-long-${index}`,
      batchId: "batch-long",
      productName: `Long Order Item ${index + 1}`,
      supplierGroup,
      supplierProductId: `${supplierGroup}-PROD-${index}`,
      supplierProductCode: `${supplierGroup}-CODE-${index}`,
      supplierName: supplierNameByCode[supplierGroup],
      packSize: "1x1",
      orderQuantity: 1,
      orderUnit: "case",
      lastPrice: 10,
      purchaseCount: 2,
      latestPurchaseDate: "2026-07-01",
      brakesStatus: "Pending"
    };
  });
  return {
    id: "batch-long",
    poNumber: "PO-5005",
    status: "Draft",
    items: longItems,
    suppliers: orderingBatchSuppliers,
    supplierGroups: orderingBatchSuppliers
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function createReadyIntake(page: Page) {
  let intakeId = "";
  let imported = false;
  let readyImportCallCount = 0;

  await page.route("**/api/ordering/current/intakes/*", async (route) => {
    const isCurrentIntakeImport = route.request().method() === "POST";
    if (!isCurrentIntakeImport) {
      await route.continue();
      return;
    }

    readyImportCallCount += 1;
    if (readyImportCallCount > 1) {
      await route.fulfill({
        json: {
          error: {
            code: "INTAKE_ALREADY_ADDED",
            message: "该识别结果已完成下单导入。"
          }
        },
        status: 400
      });
      return;
    }
    imported = true;
    await route.continue();
  });

  page.on("response", async (response) => {
    if (response.url().includes("/ready-for-purchase") && response.request().method() === "POST") {
      const payload = await response.json().catch(() => null) as { intakeId?: string } | null;
      intakeId = payload?.intakeId ?? intakeId;
    }
    if (response.url().includes("/api/ordering/current/intakes/") && response.request().method() === "POST") {
      imported = true;
    }
  });

  await page.goto("/#purchasing");
  await page.getByRole("button", { name: "手动上传录入" }).click();
  await page.getByLabel("选择手动上传文件").setInputFiles(fixturePath);
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.getByRole("button", { name: "匹配发票商品 Brakes The Juice Orange" }).click();
  await page.getByRole("button", { name: "选择 Brakes The Juice Orange", exact: true }).click();
  await page.getByRole("button", { name: "转入下单模块" }).click();
  await expect(page).toHaveURL(/#ordering$/);
  await expect.poll(() => intakeId).not.toBe("");
  await expect
    .poll(async () => imported)
    .toBe(true);
  return intakeId;
}

test.describe("isolated ordering workflow", () => {
  test("calibrates CSV, prepares one shared PO and stops before supplier submission", async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    const intakeId = await createReadyIntake(page);
    await expect(page).toHaveURL(/#ordering$/);

    const po = `PO-E2E-${testInfo.project.name}`;
    await page.getByLabel("采购 PO 号码").fill(po);
    await page.getByLabel("采购 PO 号码").press("Tab");
    await expect(page.getByLabel("采购 PO 号码")).toHaveValue(po);
    await expect(page.getByLabel("采购 PO 号码")).toHaveCount(1);

    for (const group of ["Campbells", "Mark Murphy", "Brakes", "未匹配供应商"]) {
      await expect(page.getByRole("button", { name: `${group} 分组` })).toBeVisible();
    }

    await page.getByRole("button", { name: "手动添加" }).click();
    await page.getByLabel("搜索历史发票商品").fill("Brakes The Juice Orange");
    await page.getByRole("button", { name: "选择 Brakes The Juice Orange", exact: true }).click();
    await page.getByLabel("订购数量", { exact: true }).fill("1");
    await page.getByRole("button", { name: "添加到下单" }).click();
    await expect(page.getByText("12x1ltr").first()).toBeVisible();
    const currentResponse = await page.request.get("/api/ordering/current");
    const current = await currentResponse.json() as { batch: { items: Array<{ id: string }> } };
    const [firstItem, secondItem] = current.batch.items;
    expect(firstItem).toBeDefined();
    expect(secondItem).toBeDefined();

    let acknowledged = 0;
    await page.route("**/api/ordering/batches/*/suppliers/CMP/prepare", async (route) => {
      if (acknowledged < 2) {
        await route.fulfill({
          json: {
            kind: "inventory-review-required",
            items: [
              {
                itemId: firstItem.id,
                productName: "Campbells Chopped Tomatoes",
                totalEquivalentQuantity: 2.5,
                locations: [
                  {
                    warehouse: "dry-store",
                    warehouseLabel: "干货库",
                    locationCode: "A1",
                    displayQuantity: "2.5 cases",
                    equivalentQuantity: 2.5,
                    deepLink: "#dry-store?product=tomatoes&location=A1"
                  }
                ],
                inventoryLink: "#dry-store?product=tomatoes&location=A1"
              },
              {
                itemId: secondItem.id,
                productName: "Campbells Vegetable Oil",
                totalEquivalentQuantity: 3.2,
                locations: [
                  {
                    warehouse: "dry-store",
                    warehouseLabel: "干货库",
                    locationCode: "B2",
                    displayQuantity: "3.2 cases",
                    equivalentQuantity: 3.2,
                    deepLink: "#dry-store?product=oil&location=B2"
                  }
                ],
                inventoryLink: "#dry-store?product=oil&location=B2"
              }
            ]
          },
          status: 200
        });
        return;
      }
      await route.fulfill({
        json: {
          kind: "email-draft",
          draft: {
            supplierCode: "CMP",
            to: "orders@campbells.example",
            subject: `Purchase order ${po}`,
            body: "Please prepare the attached purchase order."
          }
        },
        status: 200
      });
    });
    await page.route("**/api/ordering/batches/*/items/*/restock-only", async (route) => {
      acknowledged += 1;
      await route.fulfill({ json: { batch: {} }, status: 200 });
    });

    await page.getByRole("button", { name: "准备 Campbells 邮件" }).click();
    const stockDialog = page.getByRole("dialog", { name: "下单前核查库存" });
    await expect(stockDialog).toContainText("Campbells Chopped Tomatoes");
    await expect(stockDialog).toContainText("Campbells Vegetable Oil");
    await expect(stockDialog.getByRole("button", { name: "仅补货" })).toHaveCount(2);
    await stockDialog.getByRole("button", { name: "查看库存" }).first().click();
    await expect(page).toHaveURL(/#ordering$/);
    const inventoryDialog = page.getByRole("dialog", { name: "库存位置与数量" });
    await expect(inventoryDialog).toContainText("干货库");
    await expect(inventoryDialog).toContainText("A1");
    await expect(inventoryDialog).toContainText("2.5 cases");
    await inventoryDialog.getByRole("button", { name: /关闭/ }).click();
    await stockDialog.getByRole("button", { name: "仅补货" }).first().click();
    await expect(stockDialog.getByRole("button", { name: "仅补货" })).toHaveCount(1);
    await stockDialog.getByRole("button", { name: "仅补货" }).click();

    const mailDialog = page.getByRole("dialog", { name: "Campbells 邮件草稿" });
    await expect(mailDialog.getByLabel("正文")).toBeEditable();
    await expect(mailDialog.getByRole("button", { name: "打开邮件" })).toBeVisible();
    await expect(mailDialog.getByRole("button", { name: "复制邮件内容" })).toBeVisible();
    await expect(mailDialog.getByRole("button", { name: /发送邮件/ })).toHaveCount(0);
    await mailDialog.getByRole("button", { name: "关闭邮件草稿" }).click();

    await page.getByRole("button", { name: "填入 Brakes 购物车" }).click();
    await expect(page.getByText("已填入购物车").first()).toBeVisible();
    await expect(page.getByText(/下单成功/)).toHaveCount(0);
    await expect(page.getByText(/checkout|place order|确认价格|选择送货/i)).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("采购 PO 号码")).toHaveValue(po);
    await expect(page.getByText("已填入购物车").first()).toBeVisible();

    const markBrakes = page.getByRole("button", { name: /Brakes.*标记为已下单/ });
    await markBrakes.click();
    let confirm = page.getByRole("dialog", { name: "确认已下单" });
    await confirm.getByRole("button", { name: "否" }).click();
    await expect(markBrakes).toBeVisible();
    await markBrakes.click();
    confirm = page.getByRole("dialog", { name: "确认已下单" });
    await confirm.getByRole("button", { name: "是" }).click();
    await expect(page.getByText(/已下单/).first()).toBeVisible();

    const duplicate = await page.request.post(`/api/ordering/current/intakes/${encodeURIComponent(intakeId)}`);
    expect(duplicate.status()).toBe(400);
    await expect(duplicate.json()).resolves.toMatchObject({ error: { code: "INTAKE_ALREADY_ADDED" } });

    await expectNoHorizontalOverflow(page);
    if (testInfo.project.name === "mobile") {
      expect(await page.viewportSize()).toEqual({ width: 390, height: 844 });
    } else {
      expect((await page.viewportSize())?.width).toBeGreaterThanOrEqual(1280);
    }
  });

  test("keeps the product-search section visible after scrolling", async ({ page }) => {
    await page.route("**/api/ordering/profile", async (route) => {
      await route.fulfill({ json: orderingProfile, status: 200 });
    });
    await page.route("**/api/ordering/current", async (route) => {
      await route.fulfill({ json: { batch: buildLongOrderingBatch(), readyIntakes: [] }, status: 200 });
    });

    await page.goto("/#ordering");
    const searchSection = page.getByRole("search", { name: "搜索下单商品" });
    await expect(searchSection).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(searchSection).toHaveClass(/ordering-product-search/);
    await expect(searchSection).toBeInViewport();
    const rect = await searchSection.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect?.y).toBeGreaterThanOrEqual(0);
  });

  test("sends the last blurred Mark Murphy quantity into prepare API payload", async ({ page }) => {
    const updatePayloads: Array<{ orderQuantity?: number } | null> = [];
    const requestFlow: Array<"po-save" | "update" | "prepare"> = [];
    await page.route("**/api/ordering/profile", async (route) => {
      await route.fulfill({ json: orderingProfile, status: 200 });
    });
    await page.route("**/api/ordering/current", async (route) => {
      await route.fulfill({ json: { batch: markMurphyOrderingBatch, readyIntakes: [] }, status: 200 });
    });
    await page.route("**/api/ordering/batches/*/po", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      requestFlow.push("po-save");
      const savedPo = await route.request().postDataJSON() as { poNumber?: string } | null;
      await route.fulfill({
        json: {
          ...markMurphyOrderingBatch,
          poNumber: savedPo?.poNumber ?? markMurphyOrderingBatch.poNumber
        },
        status: 200
      });
    });
    await page.route("**/api/ordering/batches/*/items/*", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      requestFlow.push("update");
      const payload = await route.request().postDataJSON() as { orderQuantity?: number } | null;
      updatePayloads.push(payload);
      await route.fulfill({
        json: {
          batch: {
            ...markMurphyOrderingBatch,
            items: markMurphyOrderingBatch.items.map((item) => item.id === "item-mm-prepare" ? { ...item, orderQuantity: payload?.orderQuantity ?? item.orderQuantity } : item)
          }
        },
        status: 200
      });
    });
    await page.route("**/api/ordering/batches/*/suppliers/MM/prepare", async (route) => {
      requestFlow.push("prepare");
      await route.fulfill({
        json: {
          kind: "email-draft",
          draft: {
            supplierCode: "MM",
            to: orderingProfile.markMurphyEmail,
            subject: "Purchase order PO-5005",
            body: "Please prepare the Mark Murphy order."
          }
        },
        status: 200
      });
    });

    await page.goto("/#ordering");
    const quantityInput = page.getByRole("spinbutton", { name: /Mark Murphy Milk/ });
    await quantityInput.click();
    await quantityInput.fill("12");
    await quantityInput.blur();
    await page.getByRole("button", { name: "准备 Mark Murphy 邮件" }).click();

    await expect.poll(() => Promise.resolve(requestFlow.slice(-3))).toEqual(["po-save", "update", "prepare"]);
    expect(updatePayloads[updatePayloads.length - 1]).toEqual({ orderQuantity: 12 });
    const draft = page.getByRole("dialog", { name: "Mark Murphy 邮件草稿" });
    await expect(draft).toBeVisible();
    await expect(draft.getByLabel("正文")).toBeEditable();
  });

  test("shows a Chinese prepare error and keeps it in viewport on failure", async ({ page }) => {
    await page.route("**/api/ordering/profile", async (route) => {
      await route.fulfill({ json: orderingProfile, status: 200 });
    });
    await page.route("**/api/ordering/current", async (route) => {
      await route.fulfill({ json: { batch: buildLongOrderingBatch(), readyIntakes: [] }, status: 200 });
    });
    await page.route("**/api/ordering/batches/*/po", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          ...buildLongOrderingBatch(),
          poNumber: "PO-5005"
        },
        status: 200
      });
    });
    await page.route("**/api/ordering/batches/*/items/*", async (route) => {
      if (route.request().method() !== "PUT") {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: { batch: buildLongOrderingBatch() },
        status: 200
      });
    });
    await page.route("**/api/ordering/batches/*/suppliers/MM/prepare", async (route) => {
      await route.fulfill({
        json: { error: { code: "ORDERING_PROFILE_REQUIRED" } },
        status: 400
      });
    });

    await page.goto("/#ordering");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("button", { name: "准备 Mark Murphy 邮件" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "准备 Mark Murphy 邮件" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("请先在下单设置中填写订购人、酒店名称和供应商邮箱。");
    await expect(alert).toBeInViewport();
  });

  test("prompts PO required before prepare when PO is empty", async ({ page }) => {
    let prepareCalled = false;
    await page.route("**/api/ordering/profile", async (route) => {
      await route.fulfill({ json: orderingProfile, status: 200 });
    });
    await page.route("**/api/ordering/current", async (route) => {
      await route.fulfill({ json: { batch: { ...markMurphyOrderingBatch, poNumber: "" }, readyIntakes: [] }, status: 200 });
    });
    await page.route("**/api/ordering/batches/*/suppliers/MM/prepare", async (route) => {
      prepareCalled = true;
      await route.fulfill({
        json: { error: { code: "PO_REQUIRED" } },
        status: 400
      });
    });

    await page.goto("/#ordering");
    await page.getByRole("button", { name: "准备 Mark Murphy 邮件" }).click();
    await page.waitForLoadState("networkidle");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("请先填写 PO number，再准备供应商订单。");
    expect(prepareCalled).toBeFalsy();
    await expect(page.getByRole("dialog", { name: "填写 PO number" })).toBeVisible();
  });
});
