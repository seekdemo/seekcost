import { expect, test } from "@playwright/test";

test("About is public and explains the private decision loop", async ({ page }) => {
  await page.goto("/about");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Give every investment judgment a traceable basis");
  await expect(page.getByText("Catalog", { exact: true })).toBeVisible();
  await expect(page.getByText("Decide", { exact: true })).toBeVisible();
  await expect(page.getByText("Execute", { exact: true })).toBeVisible();
  await expect(page.getByText("Review", { exact: true })).toBeVisible();
  await expect(page.getByText("SeekCost is designed to keep your records scoped to your account.")).toBeVisible();
  await expect(page.getByText("Market data may be delayed or unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("Intraday observations are provisional and may change.", { exact: true })).toBeVisible();
  await expect(page.getByText("Quantitative signals are evidence for your review, not investment advice.", { exact: true })).toBeVisible();
  await expect(page.getByText("SeekCost does not provide investment advice or trade recommendations.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the guide" })).toHaveAttribute("href", "/guide");
});

test("About has no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);

  const targetHeights = await page.locator(".product-info-nav a, .product-info-actions .ui-button").evaluateAll((links) => links.map((link) => Math.round(link.getBoundingClientRect().height)));
  expect(Math.min(...targetHeights)).toBeGreaterThanOrEqual(44);
});

test("About has Chinese copy and safely falls back to English for other locales", async ({ page }) => {
  await page.goto("/about");
  const switcher = page.getByTestId("language-switcher");

  await switcher.click();
  await page.locator('[data-locale-option="zh-CN"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("让每一次投资判断，都有依据可循");
  await expect(page.getByText("市场数据可能延迟或暂时不可用。", { exact: true })).toBeVisible();
  await expect(page.getByText("盘中观察是暂时性的，可能会发生变化。", { exact: true })).toBeVisible();
  await expect(page.getByText("量化信号是供你复核的证据，不构成投资建议。", { exact: true })).toBeVisible();

  for (const locale of ["zh-TW", "ja", "es", "fr"]) {
    await switcher.click();
    await page.locator(`[data-locale-option="${locale}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Give every investment judgment a traceable basis");
  }
});

test("Guide is public and connects the seven-step loop to real product routes", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Route behavior is covered once; the separate guide test covers every viewport's responsive behavior.");
  await page.goto("/guide");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start with a decision loop you can revisit");
  await expect(page.getByRole("navigation", { name: "Guide contents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. Set up your account and preferences" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "7. Review and iterate" })).toBeVisible();

  const contents = page.getByRole("navigation", { name: "Guide contents" });
  await expect(contents.locator("a")).toHaveCount(7);
  const targetIds = ["step-account", "step-catalog", "step-candidates", "step-anchors", "step-evidence", "step-execution", "step-review"];
  for (const [index, targetId] of targetIds.entries()) {
    await contents.locator("a").nth(index).click({ force: true });
    await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
    await expect(page.locator(`#${targetId}`)).toBeVisible();
  }

  const appLinks = [
    { selector: ".guide-step__action", index: 0, href: "/register", destination: /\/register$/ },
    { selector: ".guide-step__action", index: 1, href: "/assets?create=1", destination: /\/login$/ },
    { selector: ".guide-step__action", index: 2, href: "/watchlist", destination: /\/login$/ },
    { selector: ".guide-step__action", index: 3, href: "/watchlist", destination: /\/login$/ },
    { selector: ".guide-step__action", index: 4, href: "/quant", destination: /\/login$/ },
    { selector: ".guide-step__action", index: 5, href: "/trade", destination: /\/login$/ },
    { selector: ".guide-step__action", index: 6, href: "/decision#investment-review", destination: /\/login$/ },
    { selector: ".guide-area a", index: 0, href: "/", destination: /\/login$/ },
    { selector: ".guide-area a", index: 1, href: "/portfolio", destination: /\/login$/ },
    { selector: ".guide-area a", index: 2, href: "/decision", destination: /\/login$/ },
    { selector: ".guide-area a", index: 3, href: "/tools", destination: /\/login$/ },
  ];
  for (const { selector, index, href, destination } of appLinks) {
    const linkedPage = await context.newPage();
    try {
      await linkedPage.goto("/guide");
      const link = linkedPage.locator(selector).nth(index);
      await expect(link).toHaveAttribute("href", href);
      await Promise.all([
        linkedPage.waitForURL(destination),
        link.click(),
      ]);
    } finally {
      await linkedPage.close();
    }
  }
});

test("Guide has Chinese copy and no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide");
  const switcher = page.getByTestId("language-switcher");

  await switcher.click();
  await page.locator('[data-locale-option="zh-CN"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("从一套可复核的决策闭环开始");
  await expect(page.getByRole("heading", { name: "1. 设置账户与偏好" })).toBeVisible();
  await expect(page.getByText("数据与安全边界", { exact: true })).toBeVisible();

  for (const locale of ["zh-TW", "ja", "es", "fr"]) {
    await switcher.click();
    await page.locator(`[data-locale-option="${locale}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start with a decision loop you can revisit");
  }

  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewportWidth);

  const targetHeights = await page.locator(".guide-contents a, .guide-step__action, .guide-area a").evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
  expect(Math.min(...targetHeights)).toBeGreaterThanOrEqual(44);
});
