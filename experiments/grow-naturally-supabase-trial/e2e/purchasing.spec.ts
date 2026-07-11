import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Parameters<typeof test>[0]["page"]) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

const imageParseResponse = {
  generalNotes: "Friday event",
  intakeId: "intake-e2e-image",
  items: [
    {
      confidence: 0.72,
      department: "Bar",
      notes: null,
      product_name: "orange",
      quantity: 2,
      raw_text: "2 orange",
      unit: "case"
    }
  ],
  originalFilename: "purchase-board.jpg",
  sourceType: "image",
  sourceUrl: "/api/purchasing/intakes/intake-e2e-image/source",
  unreadableText: []
};

const orangeCandidate = {
  currentInventoryQuantity: 7,
  id: "BRK-ORANGE",
  isRecommended: true,
  latestPrice: 17.25,
  latestPurchaseDate: "2026-07-01",
  packSize: "4x2.5L",
  productName: "Orange Juice",
  purchaseCount: 19,
  supplierCode: "BRK",
  supplierName: "Brakes",
  supplierProductCode: "OJ-1"
};
const sheetCandidate = {
  currentInventoryQuantity: 3,
  id: "BRK-BREAD-001",
  isRecommended: true,
  latestPrice: 11,
  latestPurchaseDate: "2026-07-01",
  packSize: "1 case",
  productName: "Bread rolls",
  purchaseCount: 8,
  supplierCode: "BRK",
  supplierName: "Brakes",
  supplierProductCode: "BR-1"
};

test.describe("purchasing information intake", () => {
  test("mobile-friendly photo intake reviews, matches and hands off a purchase request", async ({ page }) => {
    let readyBody: { items?: Array<Record<string, unknown>> } | null = null;
    let imported = false;

    await page.route("**/api/purchasing/intakes/parse", (route) => route.fulfill({ json: imageParseResponse, status: 201 }));
    await page.route("**/api/purchasing/historical-products?query=*", (route) =>
      route.fulfill({ json: { candidates: [orangeCandidate], query: "orange" }, status: 200 })
    );
    await page.route("**/api/purchasing/intakes/intake-e2e-image/ready-for-purchase", async (route) => {
      readyBody = route.request().postDataJSON();
      await route.fulfill({ json: { intakeId: "intake-e2e-image", status: "ReadyForPurchase" }, status: 200 });
    });
    await page.route("**/api/ordering/current/intakes/*", async (route) => {
      imported = true;
      await route.fulfill({
        json: {
          batch: {
            id: "batch-task-5",
            poNumber: "",
            status: "Draft",
            items: [],
            suppliers: [],
            supplierGroups: []
          },
          readyIntakes: []
        },
        status: 200
      });
    });

    await page.goto("/#purchasing");
    await expect(page.getByRole("button", { name: "AI拍照识别录入" })).toBeVisible();
    await expect(page.getByRole("button", { name: "手动上传录入" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByLabel("拍照录入采购信息").setInputFiles({
      buffer: Buffer.from("purchase-board"),
      mimeType: "image/jpeg",
      name: "purchase-board.jpg"
    });
    await expect(page.getByRole("img", { name: "采购文件图片预览" })).toBeVisible();
    await page.getByRole("button", { name: "开始识别" }).click();

    await expect(page.getByRole("heading", { name: "核对采购项目" })).toBeVisible();
    await expect(page.getByTestId("purchase-review-row-1")).toHaveClass(/purchase-review-row-low-confidence/);
    await expect(page.getByText("未匹配历史发票商品", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "转入下单模块" })).toBeDisabled();

    await page.getByRole("button", { name: "匹配发票商品 orange" }).click();
    await expect(page.getByText("推荐购买", { exact: true })).toBeVisible();
    await expect(page.getByText("Brakes", { exact: true })).toBeVisible();
    await expect(page.getByText("OJ-1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "选择 Orange Juice" }).click();
    await expect(page.getByLabel("产品名称 1")).toHaveValue("Orange Juice");

    await page.getByRole("button", { name: "转入下单模块" }).click();
    await expect(page).toHaveURL(/#ordering$/);
    expect(readyBody).toMatchObject({
      items: [
        expect.objectContaining({
          product_name: "Orange Juice",
          raw_text: "2 orange",
          supplierProductId: "BRK-ORANGE"
        })
      ]
    });
    expect(imported).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test("manual spreadsheet intake keeps an unknown quantity blank", async ({ page }) => {
    let readyBody: { items?: Array<Record<string, unknown>> } | null = null;

    await page.route("**/api/purchasing/intakes/parse", (route) =>
      route.fulfill({
        json: {
          generalNotes: null,
          intakeId: "intake-e2e-sheet",
          items: [
            {
              confidence: 1,
              department: "Kitchen",
              notes: "event stock",
              product_name: "Bread rolls",
              quantity: null,
              raw_text: "Kitchen | Bread rolls | event stock",
              unit: "case"
            }
          ],
          originalFilename: "event-purchases.xlsx",
          sourceType: "spreadsheet",
          sourceUrl: "/api/purchasing/intakes/intake-e2e-sheet/source",
          unreadableText: []
        },
        status: 201
      })
    );
    await page.route("**/api/purchasing/intakes/intake-e2e-sheet/ready-for-purchase", async (route) => {
      readyBody = route.request().postDataJSON();
      await route.fulfill({ json: { intakeId: "intake-e2e-sheet", status: "ReadyForPurchase" }, status: 200 });
    });
    await page.route("**/api/ordering/current/intakes/*", async (route) => {
      await route.fulfill({
        json: {
          batch: {
            id: "batch-task-5",
            poNumber: "",
            status: "Draft",
            items: [],
            suppliers: [],
            supplierGroups: []
          },
          readyIntakes: []
        },
        status: 200
      });
    });
    await page.route("**/api/purchasing/historical-products?query=*", (route) =>
      route.fulfill({ json: { candidates: [sheetCandidate], query: "Bread rolls" }, status: 200 })
    );

    await page.goto("/#purchasing");
    await page.getByLabel("选择手动上传文件").setInputFiles({
      buffer: Buffer.from("spreadsheet-fixture"),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "event-purchases.xlsx"
    });

    await expect(page.getByText("event-purchases.xlsx", { exact: true })).toBeVisible();
    await expect(page.getByText("表格 / XLSX", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看原始文件" })).toBeVisible();
    await page.getByRole("button", { name: "开始识别" }).click();

    await expect(page.getByLabel("产品名称 1")).toHaveValue("Bread rolls");
    await expect(page.getByText("未匹配历史发票商品", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "匹配发票商品 Bread rolls" }).click();
    await expect(page.getByText("推荐购买", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "选择 Bread rolls" }).click();
    await page.getByRole("button", { name: "转入下单模块" }).click();
    await expect(page).toHaveURL(/#ordering$/);
    expect(readyBody).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ supplierProductId: "BRK-BREAD-001", product_name: "Bread rolls" })]
      })
    );
    await expectNoHorizontalOverflow(page);
  });
});
