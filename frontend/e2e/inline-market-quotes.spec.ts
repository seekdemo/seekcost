import { expect, test } from "@playwright/test";

test("inline quotes show real-shape trends, signed changes and honest fallbacks", async ({ page }, info) => {
  const consoleErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  const stocks = ["AAOI", "ACLS", "ACMR", "ZZZ"].map((symbol, i) => ({
    id: i + 1, symbol, name: symbol, stage: "radar", sector: "美股", industries: ["商业航天与国防军工"], concepts: ["商业航天与国防军工"],
    current_price: 99, fair_price: 0, strike_price: 0, target_price: 0, planned_capital: 0,
    price_change_pct: i === 2 ? 99 : null,
    tranches: 3, first_entry_drop: 0, add_on_drop: 10, notes: "", milestones: [],
    inspiration: "", thesis: "", invalidation: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "inline-quotes-test");
    localStorage.setItem("seekcost:locale", "zh-CN");
  });
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { id: 1, username: "demo", nickname: "Demo" } });
    if (url.pathname.endsWith("/watchlist/stocks")) return route.fulfill({ json: stocks });
    if (url.pathname.endsWith("/prices/intraday-quote")) {
      const symbol = url.searchParams.get("symbol");
      const down = symbol === "ACLS";
      return route.fulfill({ json: symbol === "ACMR" ? { status: "unavailable", points: [] } : {
        status: "available", previous_close: 100, price: symbol === "ZZZ" ? 110 : down ? 97.63 : 100.93, change_pct: symbol === "ZZZ" ? 10 : down ? -2.37 : 0.93,
        currency: "USD", source: "Test fixture", as_of: 1789156800,
        points: [100, 100.7, 100.2, 99.8, 101.5, 100.1, down ? 97.63 : 100.93].map((price, i) => ({ timestamp: 1789155000 + i * 300, price })),
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/watchlist");
  const quotes = page.getByTestId("market-quote");
  await quotes.first().scrollIntoViewIfNeeded();
  await expect(quotes.first()).toContainText("+0.93%");
  expect(consoleErrors.filter(message => message.includes("same key"))).toEqual([]);
  await expect(quotes.first()).toHaveAttribute("data-direction", "up");
  await expect(quotes.first().getByTestId("previous-close")).toHaveCount(1);
  await quotes.nth(1).scrollIntoViewIfNeeded();
  await expect(quotes.nth(1)).toContainText("-2.37%");
  await expect(quotes.nth(1)).toHaveAttribute("data-direction", "down");
  await quotes.nth(2).scrollIntoViewIfNeeded();
  await expect(quotes.nth(2)).toContainText("已存价格");
  await expect(quotes.nth(2)).toContainText("分时暂不可用");
  await expect(quotes.nth(2).locator("svg")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const numbers = quotes.first().locator(".market-quote-number");
  const boxes = await numbers.evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top));
  expect(boxes[0]).toBe(boxes[1]);
  await quotes.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("inline-quotes.png") });
  const sort = page.locator("select").first();
  await sort.selectOption("change_desc");
  await expect(page.getByTestId("quote-sort-status")).toContainText("按已获取涨跌幅排序");
  const order = () => page.locator("[data-watch-stock-id]").evaluateAll(nodes => nodes.map(n => n.getAttribute("data-watch-stock-id")));
  await expect.poll(order).toEqual(["4", "1", "2", "3"]);
  await sort.selectOption("change_asc");
  await expect.poll(order).toEqual(["2", "1", "4", "3"]);
  await sort.selectOption("default");
  await expect.poll(order).toEqual(["1", "2", "3", "4"]);
  if (info.project.name !== "mobile") {
    await page.getByTestId("quote-sort-heading").click();
    await expect(sort).toHaveValue("change_desc");
    await page.getByTestId("quote-sort-heading").click();
    await expect(sort).toHaveValue("change_asc");
    await page.getByTestId("quote-sort-heading").click();
    await expect(sort).toHaveValue("default");
  }
  await sort.selectOption("change_desc");
  await sort.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("quote-sorting.png") });
});

test("live demo quote screenshot", async ({ page }, info) => {
  test.skip(!process.env.SEEKCOST_E2E_USERNAME, "Requires local demo");
  test.setTimeout(60000);
  const response = await page.request.post("/api/v1/auth/login", { data: { username: process.env.SEEKCOST_E2E_USERNAME, password: process.env.SEEKCOST_E2E_PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const { access_token } = await response.json();
  await page.addInitScript(token => { localStorage.setItem("zb_token", token); localStorage.setItem("seekcost:locale", "zh-CN"); }, access_token);
  await page.goto("/watchlist");
  const quote = page.getByTestId("market-quote").first();
  await quote.scrollIntoViewIfNeeded();
  await expect(quote.locator("svg")).toBeVisible({ timeout: 40000 });
  await expect(quote).toContainText("非实时");
  await page.screenshot({ path: info.outputPath("live-quotes.png") });
  await page.getByRole("button", { name: "行业", exact: true }).click();
  const cardQuote = page.getByTestId("market-quote").first();
  await cardQuote.scrollIntoViewIfNeeded();
  await expect(cardQuote.locator("svg")).toBeVisible({ timeout: 40000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const sizes = await cardQuote.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  await page.screenshot({ path: info.outputPath("industry-quotes.png") });
  await page.getByRole("button", { name: "价格空间", exact: true }).click();
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  const priceQuote = page.getByTestId("market-quote").first();
  await priceQuote.scrollIntoViewIfNeeded();
  await expect(priceQuote.locator("svg")).toBeVisible({ timeout: 40000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("price-space-quotes.png") });
});
