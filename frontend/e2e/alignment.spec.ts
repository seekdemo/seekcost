import { expect, test } from "@playwright/test";

test("watchlist headings share one vertical center", async ({ page }, testInfo) => {
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Requires local demo");
  test.skip(testInfo.project.name === "mobile", "The desktop table header is hidden on mobile");

  await page.goto("/login");
  await page.locator("#username").fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator("#password").fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);
  await page.evaluate(() => localStorage.setItem("seekcost:locale", "en"));
  await page.goto("/watchlist");

  const header = page.locator(".watchlist-market-header");
  await expect(header).toBeVisible();
  const centers = await header.evaluate((element) => {
    const columns = Array.from(element.children).flatMap((child) =>
      child.classList.contains("market-quote-heading") ? Array.from(child.children) : [child]
    ).filter((column) => getComputedStyle(column).display !== "none");
    return columns.map((column) => {
      const walker = document.createTreeWalker(column, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }
      const rect = column.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
  });
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("quote-sort-heading")).toBeEnabled();

  const selection = header.getByRole("checkbox", { name: "Select all" });
  await expect(selection).toHaveAttribute("aria-checked", "false");
  if (await page.locator(".watchlist-market-row").count()) {
    await selection.click();
    await expect(header.getByRole("checkbox", { name: "Clear selection" })).toHaveAttribute("aria-checked", "true");
  }

  const sortTextSpace = await page.locator('select[aria-label="Stock sort"]').evaluate((element) => {
    const select = element as HTMLSelectElement;
    const style = getComputedStyle(select);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = style.font;
    return {
      available: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      required: context.measureText(select.selectedOptions[0].text).width,
    };
  });
  expect(sortTextSpace.available).toBeGreaterThan(sortTextSpace.required + 4);
});

test("mobile action groups stay aligned without page overflow", async ({ page }, testInfo) => {
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Requires local demo");
  test.skip(testInfo.project.name !== "mobile", "Mobile layout only");

  await page.goto("/login");
  await page.locator("#username").fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator("#password").fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);

  await page.goto("/assets");
  const filterStrip = page.locator("main div.flex-nowrap.overflow-x-auto");
  await expect(filterStrip).toBeVisible();
  const filterCenters = await filterStrip.evaluate((element) =>
    Array.from(element.querySelectorAll(":scope > button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return rect.top + rect.height / 2;
    })
  );
  expect(Math.max(...filterCenters) - Math.min(...filterCenters)).toBeLessThanOrEqual(1);

  await page.goto("/research");
  const search = page.locator(".research-search");
  const create = page.locator(".research-create-button");
  await expect(create).toBeVisible();
  expect(Math.abs((await create.boundingBox())!.width - (await search.boundingBox())!.width)).toBeLessThanOrEqual(1);

  await page.goto("/quant");
  const tabs = page.locator(".quant-strategy-switcher [role=tab]");
  await expect(tabs).toHaveCount(3);
  const leftEdges = await tabs.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
  expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
