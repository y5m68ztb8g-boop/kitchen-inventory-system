import { expect, test, type Page } from "@playwright/test";

const fixturePath = "e2e/fixtures/ordering-intake.csv";

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function createReadyIntake(page: Page) {
  let intakeId = "";
  page.on("response", async (response) => {
    if (response.url().includes("/ready-for-purchase") && response.request().method() === "POST") {
      const payload = await response.json().catch(() => null) as { intakeId?: string } | null;
      intakeId = payload?.intakeId ?? intakeId;
    }
  });

  await page.goto("/#purchasing");
  await page.getByRole("button", { name: "手动上传录入" }).click();
  await page.getByLabel("选择手动上传文件").setInputFiles(fixturePath);
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.getByRole("button", { name: "匹配发票商品 Brakes The Juice Orange" }).click();
  await page.getByRole("button", { name: "选择 Brakes The Juice Orange", exact: true }).click();
  await page.getByRole("button", { name: "转入采购清单" }).click();
  await expect(page.getByText("已转入采购清单", { exact: true })).toBeVisible();
  await expect.poll(() => intakeId).not.toBe("");
  return intakeId;
}

test.describe("isolated ordering workflow", () => {
  test("calibrates CSV, prepares one shared PO and stops before supplier submission", async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    const intakeId = await createReadyIntake(page);
    await page.getByRole("button", { name: "转入下单模块" }).click();
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

    let acknowledged = 0;
    await page.route("**/api/ordering/batches/*/suppliers/CMP/prepare", async (route) => {
      if (acknowledged < 2) {
        await route.fulfill({
          json: {
            kind: "inventory-review-required",
            items: [
              {
                itemId: "stock-tomatoes",
                productName: "Campbells Chopped Tomatoes",
                totalEquivalentQuantity: 2.5,
                locations: [],
                inventoryLink: "#dry-store?product=tomatoes&location=A1"
              },
              {
                itemId: "stock-oil",
                productName: "Campbells Vegetable Oil",
                totalEquivalentQuantity: 3.2,
                locations: [],
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
    await expect(stockDialog.getByRole("link", { name: "去核查库存" }).first()).toHaveAttribute("href", /#dry-store\?/);
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
});
