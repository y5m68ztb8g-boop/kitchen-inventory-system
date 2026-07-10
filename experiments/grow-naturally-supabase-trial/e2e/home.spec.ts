import { expect, test } from "@playwright/test";

test("home screen shows the four initial modules", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();
  await expect(page.getByRole("button", { name: "区域" })).toBeVisible();
  await expect(page.getByLabel("未来功能预留")).toBeVisible();
  await expect(page.getByRole("link", { name: "产品库存总金额" })).toBeVisible();
});

test("search module returns locations and stock by product name", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByPlaceholder("输入产品名称").fill("Chicken Breast");

  await expect(page).toHaveURL(/\/#?$/);
  await expect(page.getByText("冷冻库 / A货架 / 1号位置")).toBeVisible();
  await expect(page.getByText("库存：7 Cases")).toBeVisible();
});

test("area module opens warehouse branches and freezer map", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "区域" }).click();
  await page.getByRole("link", { name: "冷冻库" }).click();

  await expect(page.getByRole("heading", { exact: true, name: "冷冻库" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A货架" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "托盘区" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "冷冻库库存总列表" })).toBeVisible();
  await expect(page.getByText("Chicken Breast")).toBeVisible();
  await expect(page.getByText("5 Cases + 2 Bags")).toBeVisible();
  await expect(page.getByText("PT002 · 货号 F13557")).toBeVisible();
});

test("waiting invoice action matches a recorded freezer item", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "匹配 Chicken Breast 发票" }).click();
  await page.getByRole("button", { name: /22CFIL5K/ }).click();

  await expect(page.getByText("Campbells Prime Meat Ltd")).toBeVisible();
  await expect(page.getByText("最后 £35.50")).toBeVisible();

  await page.getByRole("button", { name: "确认匹配" }).click();

  await expect(page.getByText("Campbell / 22CFIL5K")).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑 Chicken Breast 发票" })).toBeVisible();
  await expect(page.getByRole("button", { name: "删除 Chicken Breast" })).toBeVisible();
});

test("confirmed Chunky Chips product appears as an invoice candidate", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "匹配 Chunky Chips 发票" }).click();

  await expect(page.getByRole("button", { name: /135177/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sysco Prem Chunky Skin on Chips/ })).toBeVisible();
});

test("matched freezer items can be edited and deleted", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "匹配 Chicken Breast 发票" }).click();
  await page.getByRole("button", { name: /22CFIL5K/ }).click();
  await page.getByRole("button", { name: "确认匹配" }).click();

  await page.getByRole("button", { name: "编辑 Chicken Breast 发票" }).click();
  await page.getByLabel("搜索发票商品").fill("chicken fillet");
  await page.getByRole("button", { name: /^22CFIL7 · CHICKEN FILLET/ }).click();
  await page.getByRole("button", { name: "确认匹配" }).click();

  await expect(page.getByText("Campbell / 22CFIL7")).toBeVisible();

  await page.getByRole("button", { name: "删除 Chicken Breast" }).click();
  await page.getByRole("button", { name: "是，删除" }).click();

  await expect(page.getByText("Chicken Breast")).toHaveCount(0);

  await page.getByRole("link", { name: "返回首页" }).click();
  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByPlaceholder("输入产品名称").fill("Chicken Breast");

  await expect(page.getByText("冷冻库 / A货架 / 1号位置")).toHaveCount(0);
});

test("recorded cases plus loose packs use invoice pack count for line total", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "匹配 Omega Scottish Hot Smoked Mackerel Fillets 发票" }).click();
  await page.getByRole("button", { name: /26MACKSM/ }).click();
  await page.getByRole("button", { name: "确认匹配" }).click();

  await expect(page.getByText("1 Case + 2 Packs")).toBeVisible();
  await expect(page.getByText("单价 £21.30")).toBeVisible();
  await expect(page.getByText("总价 £26.63")).toBeVisible();
  await expect(page.getByText("总价 £63.90")).toHaveCount(0);
});

test("matched package counts can be adjusted from the freezer list", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "匹配 Ice 发票" }).click();
  await page.getByRole("button", { name: /136145/ }).click();
  await page.getByRole("button", { name: "确认匹配" }).click();

  await expect(page.getByLabel("Ice 整箱数量", { exact: true })).toHaveText("5");
  await expect(page.getByLabel("Ice 散包数量", { exact: true })).toHaveText("2");
  await expect(page.getByText("总价 £18.47")).toBeVisible();

  await page.getByRole("button", { name: "增加 Ice 散包数量" }).click();
  await page.getByRole("button", { name: "减少 Ice 整箱数量" }).click();

  await expect(page.getByLabel("Ice 整箱数量", { exact: true })).toHaveText("4");
  await expect(page.getByLabel("Ice 散包数量", { exact: true })).toHaveText("3");
  await expect(page.getByText("总价 £15.73")).toBeVisible();
});

test("matched single item counts use invoice units and can be adjusted", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "匹配 Sea Bass 发票" }).click();
  await page.getByRole("button", { name: /26SEAPOR/ }).click();
  await page.getByRole("button", { name: "确认匹配" }).click();

  await expect(page.getByText("单位 EACH")).toBeVisible();
  await expect(page.getByLabel("Sea Bass 数量", { exact: true })).toHaveText("4");
  await expect(page.getByText("总价 £7.00")).toBeVisible();

  await page.getByRole("button", { name: "增加 Sea Bass 数量" }).click();

  await expect(page.getByLabel("Sea Bass 数量", { exact: true })).toHaveText("5");
  await expect(page.getByText("总价 £8.75")).toBeVisible();
});

test("freezer entry matches an Excel invoice product and updates valuation", async ({ page }) => {
  await page.goto("/#freezer");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "录入产品" }).click();
  await page.getByLabel("产品名称").fill("chicken");
  await page.getByLabel("位置").selectOption("A3");
  await page.getByLabel("库存数量").fill("1");
  await page.getByLabel("库存单位").fill("盒");
  await page.getByRole("button", { name: "50%" }).click();
  await page.getByRole("button", { name: /22CFIL5K/ }).click();

  await expect(page.getByLabel("产品名称")).toHaveValue("5KG PACK CHICKEN FILLET APPROX 200G+");
  await expect(page.getByText("Campbells Prime Meat Ltd")).toBeVisible();
  await expect(page.getByText("最低 £35.50")).toBeVisible();
  await expect(page.getByText("最后 £35.50")).toBeVisible();

  await page.getByRole("button", { name: "保存产品" }).click();

  await expect(page.getByText("5KG PACK CHICKEN FILLET APPROX 200G+")).toBeVisible();
  await expect(page.getByLabel("5KG PACK CHICKEN FILLET APPROX 200G+ 数量", { exact: true })).toHaveText("1");
  await expect(page.getByText("开封 +50%")).toBeVisible();
  await expect(page.getByText("单位 PACK")).toBeVisible();
  await expect(page.getByText("Campbell / 22CFIL5K")).toBeVisible();
  await expect(page.getByText("单价 £35.50")).toBeVisible();
  await expect(page.getByText("总价 £53.25")).toBeVisible();

  await page.goto("/#valuation");

  await expect(page.getByText("£53.25")).toBeVisible();
  await expect(page.getByText("已录入 1 个库存产品。")).toBeVisible();
});
