import { expect, test } from "@playwright/test";

const dashboard = {
  exchange_rates: { CNY: 1, USD: 7 },
  default_currency: "CNY",
};

const holding = {
  id: 41,
  symbol: "INTC",
  name: "Intel",
  zone: "active",
  category: "stock",
  market: "us",
  is_cash: false,
  archived: false,
  quantity: 5,
  broker_cost: 102.54,
  mental_cost: 95,
  current_price: 115.37,
  total_invested: 512.7,
  total_cashed: 0,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("zb_token", "cost-focus-test-token");
    window.localStorage.setItem("seekcost:locale", "zh-CN");
    window.localStorage.setItem("seek_dashboard_display_currency", "CNY");
  });
  await page.route("**/api/v1/dashboard", (route) => route.fulfill({ json: dashboard }));
  await page.route("**/api/v1/assets*", (route) => route.fulfill({ json: [
    holding,
    { ...holding, id: 42, symbol: "COURSE", name: "Research course", zone: "invest" },
    { ...holding, id: 43, symbol: "GOLD", name: "Gold", zone: "base" },
  ] }));
  await page.route("**/api/v1/alerts/notifications*", (route) => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.route("**/api/v1/auth/profile", (route) => route.fulfill({ json: {} }));
});

test("cost workspace prioritizes holdings and keeps CSV import", async ({ page }, testInfo) => {
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "持仓成本", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /导入 IBKR/ }).first()).toHaveAttribute("href", "/import/ibkr");
  await expect(page.getByRole("link", { name: /全部持仓/ })).toHaveAttribute("href", "/assets?zone=active");
  await expect(page.getByRole("link", { name: /INTC/ })).toHaveAttribute("href", "/assets/41");
  await expect(page.getByText("102.54").first()).toBeVisible();
  await expect(page.getByText("95.00").first()).toBeVisible();
  await expect(page.getByTestId("section-navigation").getByRole("link", { name: "个人财务" })).toHaveCount(0);
  await expect(page.getByText("Research course")).toHaveCount(0);
  await expect(page.getByText("Gold", { exact: true })).toHaveCount(0);
  await expect(page.getByText("能力投入", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("cost-workspace.png"), fullPage: true });
});

test("empty portfolio explains the import path without inventing reconciliation", async ({ page }) => {
  await page.route("**/api/v1/assets*", (route) => route.fulfill({ json: [] }));
  await page.goto("/portfolio");
  await expect(page.getByText("还没有在持仓的证券")).toBeVisible();
  await expect(page.getByRole("link", { name: /导入 IBKR/ }).first()).toHaveAttribute("href", "/import/ibkr");
  await expect(page.getByText(/尚未提供独立的 IBKR 成本差异判定/)).toBeVisible();
});

test("search, sorting and currency display work without changing recorded costs", async ({ page }) => {
  await page.route("**/api/v1/assets*", (route) => route.fulfill({ json: [
    holding,
    { ...holding, id: 44, symbol: "AAPL", name: "Apple", quantity: 2, broker_cost: 120, mental_cost: 120, current_price: 130 },
  ] }));
  await page.goto("/portfolio");
  const rows = page.getByTestId("cost-holding-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("INTC");
  await page.getByRole("combobox", { name: "持仓排序" }).selectOption("symbol");
  await expect(rows.first()).toContainText("AAPL");
  await page.getByRole("searchbox", { name: "搜索代码或名称" }).fill("Intel");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("INTC");
  await page.getByRole("group", { name: "显示币种" }).getByRole("button", { name: "USD" }).click();
  await expect(page.getByTestId("cost-summary")).toContainText("US$752.70");
  await expect(rows.first()).toContainText("US$102.54");
});

test("mobile cost workspace has no horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "持仓成本", exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
});
