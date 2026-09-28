import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockDossier(page: Page) {
  let scans = 0;
  let snapshot = {
    id: 41,
    stock_id: 115,
    strategy_key: "chang-five-day-line",
    strategy_version: "1.1.0",
    signal: "entry_pullback",
    reason_codes: ["pullback_to_rising_ma5"],
    metrics: { bar_count: 126, close: 141.2, ma5: 140.1, volume_ratio: 0.72, ma5_bias_pct: 0.0079 },
    bar_date: "2026-08-14",
    source: "yahoo_finance",
    execution_timing: "next_session_open",
    error_code: null,
    evaluated_at: "2026-08-15T01:20:00Z",
  };
  const strategy = {
    strategy_key: "chang-five-day-line",
    name: "Five-day line observation",
    strategy_version: "1.1.0",
    enabled: true,
    parameters: { volume_multiplier: 1.45, break_buffer_pct: 0.075, hard_stop_pct: 0.2, recovery_sessions: 3, pullback_max_bias_pct: 0.02, trend_lookback: 5 },
    disclaimer: "Evidence for review only. This is not investment advice.",
    data_boundary: "Completed daily bars only; actionable signals are reviewed at the next session open.",
    updated_at: "2026-08-15T01:20:00Z",
  };
  const stock = {
    id: 115,
    symbol: "NVDA",
    name: "NVIDIA",
    stage: "conviction",
    sector: "Semiconductors",
    thesis: "Accelerated computing demand remains durable.",
    invalidation: "Demand falls for two consecutive quarters.",
    current_price: 141.2,
    fair_price: 150,
    strike_price: 130,
    target_price: 170,
    updated_at: "2026-08-15T01:00:00Z",
  };

  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "quant-dossier-token");
    localStorage.setItem("seekcost:locale", "en");
  });
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => json(route, {
    stock_id: 115,
    stock,
    research_sections: [],
    memos: [],
    linked_research: [],
  }));
  await page.route("**/api/v1/prices/price-volume**", (route) => json(route, {
    symbol: "NVDA", market: "us", range: "6mo", currency: "USD", exchange_timezone: "America/New_York",
    items: [], moving_averages: [], observation: null, data_quality: "empty", source: "yahoo_finance", as_of: null,
  }));
  await page.route("**/api/v1/quant-strategies**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path.endsWith("/quant-strategies")) return json(route, [strategy]);
    if (request.method() === "GET" && path.endsWith("/stocks")) return json(route, [{
      stock_id: 115,
      symbol: "NVDA",
      name: "NVIDIA",
      stage: "conviction",
      market: "us",
      has_position: true,
      qualification: { stock_id: 115, historical_low: true, valuation_low: true, attention_low: true, note: "Reviewed", complete: true, qualified: true, updated_at: "2026-08-14T01:00:00Z" },
      latest_snapshot: snapshot,
    }]);
    if (request.method() === "POST" && path.endsWith("/stocks/115/scan")) {
      scans += 1;
      snapshot = { ...snapshot, id: 42, signal: "hold_trend", reason_codes: ["ma5_trend_intact"], evaluated_at: "2026-08-16T01:20:00Z" };
      return json(route, snapshot);
    }
    return json(route, { detail: "Not found" }, 404);
  });
  return () => scans;
}

test("stock dossier shows persisted five-day-line evidence and rescans only this stock", async ({ page }) => {
  const scanCount = await mockDossier(page);
  const response = await page.goto("/watchlist/115");
  expect(response?.status()).toBe(200);

  const panel = page.getByTestId("quant-strategy-panel");
  await expect(panel.getByRole("heading", { name: "Five-day-line evidence" })).toBeVisible();
  await expect(panel).toContainText("Formula v1.1.0");
  await expect(panel).toContainText("Aug 14, 2026");
  await expect(panel).toContainText("141.20");
  await expect(panel).toContainText("140.10");
  await expect(panel).toContainText("0.72x");
  await expect(panel).toContainText("Quiet pullback held near a rising MA5");
  await expect(panel).toContainText("Review at the next session open");
  await expect(panel).toContainText("Current conclusion");
  await expect(panel.getByRole("link", { name: "Manage strategy" })).toHaveAttribute("href", "/quant");

  await panel.getByRole("button", { name: "Rescan this stock" }).click();
  await expect(panel).toContainText("Trend intact");
  expect(scanCount()).toBe(1);

  await expect(page.getByRole("heading", { name: "Daily candlestick chart" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
