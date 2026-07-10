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
  await expect(page.getByPlaceholder("搜索发票商品 / code")).toHaveValue("");
  await expect(product).toHaveValue("");
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

  const readFreezerMapStructure = async () =>
    page.evaluate(() => {
      const map = document.querySelector<HTMLElement>(".result-freezer-mini-map");

      if (!map) {
        throw new Error("Expected freezer map structure to be rendered.");
      }

      const mapStyle = window.getComputedStyle(map);
      const areaMatrix = Array.from(mapStyle.gridTemplateAreas.matchAll(/"([^"]+)"/g)).map((match) =>
        match[1].trim().split(/\s+/)
      );

      return {
        gridTemplateAreas: mapStyle.gridTemplateAreas,
        areaMatrix,
        columnTrackCount: mapStyle.gridTemplateColumns.trim().split(/\s+/).length,
        rowTrackCount: mapStyle.gridTemplateRows.trim().split(/\s+/).length
      };
    });

  const freezerMapBeforeViewportChange = await readFreezerMapStructure();
  await page.setViewportSize({ width: 700, height: 844 });
  await expect
    .poll(() => page.evaluate(() => window.matchMedia("(max-width: 560px)").matches))
    .toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => window.matchMedia("(max-width: 560px)").matches))
    .toBe(true);
  await expect(page.getByLabel("A1当前位置")).toBeVisible();
  const freezerMapAfterViewportChange = await readFreezerMapStructure();

  expect(freezerMapAfterViewportChange).toEqual(freezerMapBeforeViewportChange);

  await page.setViewportSize({ width: 390, height: 500 });
  await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(500);
  await page.getByPlaceholder("搜索发票商品 / code").fill("F135-177");
  await expect(page.getByRole("button", { name: "复制 135177" })).toBeVisible();

  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          bodyFitsViewport: document.body.scrollWidth <= document.documentElement.clientWidth,
          documentFitsViewport: document.documentElement.scrollWidth <= window.innerWidth
        })),
      { message: "Invoice results should not overflow the mobile viewport.", timeout: 3000 }
    )
    .toEqual({ bodyFitsViewport: true, documentFitsViewport: true });

  const searchOverlay = page.locator(".home-shell-search-open");
  const invoiceResult = page.locator(".invoice-history-card").first();
  await invoiceResult.scrollIntoViewIfNeeded();
  await searchOverlay.evaluate((overlay) => {
    overlay.scrollTop = overlay.scrollHeight;
  });
  await expect.poll(() => searchOverlay.evaluate((overlay) => overlay.scrollTop)).toBeGreaterThan(0);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const selectors = [
            ".mobile-search-title",
            ".mobile-search-close",
            "#home-invoice-search",
            "#home-product-search"
          ];
          const elements = selectors.map((selector) => document.querySelector<HTMLElement>(selector));
          const overlay = document.querySelector<HTMLElement>(".home-shell-search-open");

          if (elements.some((element) => !element) || !overlay) {
            throw new Error("Expected mobile search controls were not rendered.");
          }

          const viewport = { height: window.innerHeight, width: window.innerWidth };
          const controlsInViewport = elements.every((element) => {
            const rect = element!.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= viewport.width && rect.top >= 0 && rect.bottom <= viewport.height;
          });
          const controlsAreTopmost = elements.every((element) => {
            const rect = element!.getBoundingClientRect();
            const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
            return hit === element || element!.contains(hit);
          });

          return {
            controlsAreTopmost,
            controlsInViewport,
            overlayScrollTop: overlay.scrollTop
          };
        }),
      { message: "Mobile search controls should remain visible above scrolled invoice results.", timeout: 3000 }
    )
    .toMatchObject({ controlsAreTopmost: true, controlsInViewport: true });

  await expect(page.getByRole("heading", { name: "搜索" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭搜索" })).toBeVisible();
  await expect(page.getByPlaceholder("搜索发票商品 / code")).toBeVisible();
  await expect(page.getByPlaceholder("输入产品名称")).toBeVisible();

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
    const buttons = Array.from(codeRow.querySelectorAll<HTMLButtonElement>(":scope > button"));
    const buttonRects = buttons.map((button) => button.getBoundingClientRect());

    return {
      buttonsFitViewport: buttonRects.every((rect) => rect.left >= 0 && rect.right <= window.innerWidth),
      buttonsOnSecondRow:
        buttonRects.length === 2 && buttonRects.every((rect) => rect.top > codeRect.bottom),
      buttonsShareRow:
        buttonRects.length === 2 && Math.abs(buttonRects[0].top - buttonRects[1].top) <= 1,
      codeIsHorizontal: codeRect.height <= lineHeight * 2 + 1,
      columns: rowStyle.gridTemplateColumns.split(" ").length,
      rows: rowStyle.gridTemplateRows.split(" ").length
    };
  });

  expect(invoiceLayout).toEqual({
    buttonsFitViewport: true,
    buttonsOnSecondRow: true,
    buttonsShareRow: true,
    codeIsHorizontal: true,
    columns: 2,
    rows: 2
  });
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
