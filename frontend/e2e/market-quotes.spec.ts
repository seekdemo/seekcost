import { expect, test } from "@playwright/test";

const stocks = [
  { id: 1, symbol: "159516", name: "半导体设备ETF国泰", sector: "", stage: "radar" },
  { id: 2, symbol: "159967", name: "创业板成长ETF华夏", sector: "", stage: "radar" },
  { id: 3, symbol: "513310", name: "中韩半导体ETF华泰柏瑞", sector: "", stage: "radar" },
  { id: 4, symbol: "000001", name: "上证指数", sector: "", stage: "radar" },
  { id: 5, symbol: "NQMAIN", name: "纳斯达克100指数期货主连 (2609)", sector: "", stage: "radar" },
].map((stock) => ({
  ...stock,
  industries: [],
  concepts: [],
  inspiration: "",
  thesis: "",
  invalidation: "",
  current_price: 0,
  fair_price: 0,
  strike_price: 0,
  target_price: 0,
  planned_capital: 0,
  tranches: 3,
  first_entry_drop: 0,
  add_on_drop: 10,
  notes: "",
  milestones: [],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
}));

test("ETF and index refresh sends provider-ready market types", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "market-quotes-e2e-token");
    localStorage.setItem("seekcost:locale", "en");
  });

  let requestItems: unknown[] = [];
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: stocks }));
  await page.route("**/api/v1/notes*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/watchlist/memos*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/prices/quotes", async (route) => {
    requestItems = (route.request().postDataJSON() as { items: unknown[] }).items;
    await route.fulfill({ json: { updated_count: 0, prices: {}, sessions: {}, error: null, message: "checked" } });
  });

  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Watchlist tools" }).click();
  await page.getByRole("menuitem", { name: "Refresh prices" }).click();
  await expect.poll(() => requestItems).toEqual([
    { symbol: "159516", market: "cn" },
    { symbol: "159967", market: "cn" },
    { symbol: "513310", market: "cn" },
    { symbol: "000001", market: "cn_index" },
    { symbol: "NQMAIN", market: "us" },
  ]);
});
