import { expect, test } from "@playwright/test";

test("mobile search is full screen, reusable and explicitly closable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");

  await page.goto("/");
  await page.getByRole("button", { name: "搜索" }).click();

  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeVisible();
  await expect(page.getByRole("button", { name: "区域" })).toBeHidden();
  await expect(page.getByRole("link", { name: "AI录入" })).toBeHidden();
  await expect(page.getByPlaceholder("搜索发票商品 / code")).toBeVisible();

  const product = page.getByPlaceholder("输入产品名称");
  await product.fill("Chicken Breast");
  await expect(page.getByLabel("A1当前位置")).toBeVisible();
  await product.fill("");
  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeVisible();
  await product.fill("Chunky Chips");
  await expect(product).toHaveValue("Chunky Chips");
  await page.getByRole("button", { name: "关闭搜索" }).click();
  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();

  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByPlaceholder("搜索发票商品 / code")).toHaveValue("");
  await expect(product).toHaveValue("");
  await product.fill("Chicken Breast");
  await expect(page.getByLabel("A1当前位置")).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeHidden();
  await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();

  await page.getByRole("button", { name: "搜索" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeHidden();

  await page.getByRole("button", { name: "搜索" }).click();
  await product.fill("Chicken Breast");
  await expect(page.getByLabel("A1当前位置")).toBeVisible();

  const mobileLayout = await page.evaluate(() => {
    const close = document.querySelector<HTMLButtonElement>(".mobile-search-close");
    const map = document.querySelector<HTMLElement>(".result-freezer-mini-map");
    const result = document.querySelector<HTMLElement>(".home-search-results");
    const shell = document.querySelector<HTMLElement>(".home-shell-search-open");
    const viewport = window.innerWidth;

    if (!close || !map || !result || !shell) {
      throw new Error("Expected mobile search layout elements were not rendered.");
    }

    const closeRect = close.getBoundingClientRect();
    const resultRect = result.getBoundingClientRect();
    const mapStyle = window.getComputedStyle(map);
    return {
      closeInViewport:
        closeRect.left >= 0 && closeRect.right <= viewport && closeRect.top >= 0 && closeRect.bottom <= window.innerHeight,
      freezerGridAreas: mapStyle.gridTemplateAreas,
      freezerGridTracks: mapStyle.gridTemplateColumns.split(" ").map(Number.parseFloat),
      noHorizontalOverflow: document.body.scrollWidth <= viewport,
      resultUsesAvailableWidth: resultRect.width >= viewport - 32,
      shellIsFixed: window.getComputedStyle(shell).position === "fixed"
    };
  });

  expect(mobileLayout).toMatchObject({
    closeInViewport: true,
    freezerGridAreas: '"a b c" "p badge d"',
    noHorizontalOverflow: true,
    resultUsesAvailableWidth: true,
    shellIsFixed: true
  });
  expect(mobileLayout.freezerGridTracks).toHaveLength(3);
  expect(mobileLayout.freezerGridTracks).toEqual([76, 118, 118]);

  await page.getByPlaceholder("搜索发票商品 / code").fill("F135-177");
  await expect(page.getByRole("button", { name: "复制 135177" })).toBeVisible();

  const invoiceLayout = await page.evaluate(() => {
    const codeRow = document.querySelector<HTMLElement>(".invoice-code-row");
    const code = document.querySelector<HTMLElement>(".invoice-code-row strong");

    if (!codeRow || !code) {
      throw new Error("Expected invoice code row was not rendered.");
    }

    const rowStyle = window.getComputedStyle(codeRow);
    const codeStyle = window.getComputedStyle(code);
    const codeRect = code.getBoundingClientRect();
    const lineHeight = Number.parseFloat(codeStyle.lineHeight);

    return {
      codeIsHorizontal: codeRect.height <= lineHeight * 2 + 1,
      columns: rowStyle.gridTemplateColumns.split(" ").length,
      rows: rowStyle.gridTemplateRows.split(" ").length
    };
  });

  expect(invoiceLayout).toEqual({ codeIsHorizontal: true, columns: 2, rows: 2 });
});

test("desktop search leaves the home modules available and only dismisses results", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");

  await page.goto("/");
  await page.getByRole("button", { name: "搜索" }).click();

  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeHidden();
  await expect(page.getByRole("button", { name: "区域" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI录入" })).toBeVisible();

  await page.getByPlaceholder("输入产品名称").fill("Chicken Breast");
  await expect(page.getByText("库存：7 Cases")).toBeVisible();
  await page.mouse.click(0, 0);

  await expect(page.getByText("库存：7 Cases")).toBeHidden();
  await expect(page.getByPlaceholder("输入产品名称")).toBeVisible();
  await expect(page.getByRole("button", { name: "区域" })).toBeVisible();
});
