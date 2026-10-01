import { expect, test } from "@playwright/test";

const stock = {
  id: 7, symbol: "AAPL", name: "苹果", stage: "radar", sector: "", industries: [], concepts: [],
  inspiration: "长期经营观察", thesis: "", current_price: 100, milestones: [],
  created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-28T00:00:00Z",
};
const note = {
  id: 21, title: "经营现金流研究", content: "继续观察长期经营情况。", format: "markdown",
  stock_symbols: [], knowledge_tags: [], tags: [], status: "active", kind: "company", visibility: "private",
  links: [{ entity_type: "watch_stock", entity_id: 7 }],
  created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-28T00:00:00Z",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: 1, username: "fixture" } }));
  await page.route("**/api/v1/alerts/notifications*", route => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.route("**/api/v1/watchlist/stocks", route => route.fulfill({ json: [stock] }));
  await page.route("**/api/v1/notes*", route => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/prices/intraday-quote*", route => route.fulfill({ json: {
    status: "unavailable", price: null, previous_close: null, change_pct: null, points: [], as_of: null, source: "",
  } }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "fixture");
    localStorage.setItem("zb_user", JSON.stringify({ id: 1, username: "fixture" }));
    localStorage.setItem("seekcost:locale", "zh-CN");
    localStorage.setItem("zb_theme", "light");
  });
});

test("a research request failure preserves the loaded watchlist and can be retried", async ({ page }) => {
  let failing = true;
  await page.route("**/api/v1/notes*", route => failing
    ? route.fulfill({ status: 500, json: { detail: "Notes temporarily unavailable" } })
    : route.fulfill({ json: [note] }));
  await page.goto("/watchlist");

  const row = page.locator('[data-watch-stock-id="7"]');
  await expect(row).toBeVisible();
  await expect(page.getByText("当前筛选下没有标的", { exact: true })).toHaveCount(0);
  const error = page.getByRole("alert").filter({ hasText: "研究加载失败" });
  await expect(error).toBeVisible();
  await expect(error).toContainText("Notes temporarily unavailable");

  failing = false;
  await error.getByRole("button", { name: "重试", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("dialog", { name: "快捷决策" }).getByRole("link", { name: /经营现金流研究/ })).toHaveAttribute("href", "/research/21");
});

test("an explicit watch-stock link associates research without symbol metadata or mentions", async ({ page }, info) => {
  await page.goto("/watchlist");
  const row = page.locator('[data-watch-stock-id="7"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText("经营现金流研究");
  await page.screenshot({ path: info.outputPath("watchlist-restored.png"), fullPage: true });
  await row.click();

  const drawer = page.getByRole("dialog", { name: "快捷决策" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: /经营现金流研究/ })).toHaveAttribute("href", "/research/21");
});
