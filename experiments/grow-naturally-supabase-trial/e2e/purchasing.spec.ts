import { expect, test } from "@playwright/test";

const scanResponse = {
  generalNotes: "Friday delivery",
  imageUrl: "/api/purchasing/whiteboard-scans/scan-e2e/image",
  items: [
    {
      department: "Kitchen",
      raw_text: "2 chiken brest",
      product_name: "chiken brest",
      quantity: 2,
      unit: "case",
      notes: "for Friday",
      confidence: 0.62
    }
  ],
  scanId: "scan-e2e",
  unreadableText: ["lower-right note"]
};

async function expectNoHorizontalOverflow(page: Parameters<typeof test>[0]["page"]) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

test.describe("purchasing whiteboard flow", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("reviews an uncertain whiteboard item before saving a pending recommendation", async ({ page }) => {
    let scanRequests = 0;
    let confirmationBody: unknown;

    await page.route("**/api/purchasing/scan-whiteboard", async (route) => {
      scanRequests += 1;
      await route.fulfill({ json: scanResponse });
    });
    await page.route("**/api/purchasing/whiteboard-scans/scan-e2e/confirm", async (route) => {
      confirmationBody = route.request().postDataJSON();
      await route.fulfill({
        json: {
          items: [
            {
              clientId: (confirmationBody as { items: Array<{ clientId: string }> }).items[0].clientId,
              productName: "Chicken Breast",
              recommendation: {
                currentInventoryQuantity: 7,
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
            }
          ],
          scanId: "scan-e2e",
          status: "Pending"
        }
      });
    });

    await page.goto("/");
    await page.getByRole("link", { name: "采购" }).click();
    await expect(page).toHaveURL(/#purchasing$/);
    await expect(page.getByRole("link", { name: "返回首页" })).toHaveAttribute("href", "#");
    await expect(page.getByRole("button", { name: "选择现有图片" })).toBeVisible();

    await page.getByRole("button", { name: "Scan Purchase Whiteboard" }).click();
    await page.getByLabel("拍摄采购白板").setInputFiles({
      buffer: Buffer.from("whiteboard-image"),
      mimeType: "image/png",
      name: "whiteboard.png"
    });

    await expect(page.getByRole("img", { name: "采购白板预览" })).toBeVisible();
    await expect(page.getByRole("button", { name: "开始识别" })).toBeVisible();
    expect(scanRequests).toBe(0);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "开始识别" }).click();
    await expect(page.getByRole("heading", { name: "核对采购项目" })).toBeVisible();
    await expect(page.getByTestId("purchase-review-row-1")).toBeVisible();
    await expect(page.getByTestId("purchase-review-row-1")).toHaveClass(/purchase-review-row-low-confidence/);
    await expect(page.getByRole("button", { name: "确认保存" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "查看原始图片" })).toHaveAttribute("title", "查看原始图片");
    await expectNoHorizontalOverflow(page);

    await page.getByLabel("产品名称 1").fill("Chicken Breast");
    await page.getByLabel("已人工核对 1").check();
    await page.getByRole("button", { name: "确认保存" }).click();

    await expect(page.getByRole("heading", { name: "采购项目已保存" })).toBeVisible();
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();
    await expect(page.locator(".purchase-recommendation-fields").getByText("Chicken Breast", { exact: true })).toBeVisible();
    await expect(page.getByText("Brakes", { exact: true })).toBeVisible();
    await expect(page.getByText("BRK", { exact: true })).toBeVisible();
    await expect(page.getByText("CHICKEN-1", { exact: true })).toBeVisible();
    await expect(page.getByText("2x5kg", { exact: true })).toBeVisible();
    await expect(page.getByText("£24.50", { exact: true })).toBeVisible();
    await expect(page.getByText("10", { exact: true })).toBeVisible();
    await expect(page.getByText("2026-07-01", { exact: true })).toBeVisible();
    await expect(page.getByText("7", { exact: true })).toBeVisible();
    expect(confirmationBody).toMatchObject({
      items: [expect.objectContaining({ manualReviewed: true, product_name: "Chicken Breast" })]
    });
    await expectNoHorizontalOverflow(page);
  });
});
