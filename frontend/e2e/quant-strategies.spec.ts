import { expect, test, type Page, type Route } from "@playwright/test";

type Qualification = {
  stock_id: number;
  historical_low: boolean | null;
  valuation_low: boolean | null;
  attention_low: boolean | null;
  note: string;
  complete: boolean;
  qualified: boolean;
  updated_at: string | null;
};

type StockRow = {
  stock_id: number;
  symbol: string;
  name: string;
  stage: string;
  market: string;
  has_position: boolean;
  qualification: Qualification;
  latest_snapshot: Record<string, unknown> | null;
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockQuant(page: Page) {
  let enabled = false;
  let nextSnapshotId = 10;
  const emptyQualification = (stockId: number): Qualification => ({
    stock_id: stockId,
    historical_low: null,
    valuation_low: null,
    attention_low: null,
    note: "",
    complete: false,
    qualified: false,
    updated_at: null,
  });
  let stocks: StockRow[] = [
    { stock_id: 101, symbol: "AAPL", name: "Apple", stage: "conviction", market: "us", has_position: false, qualification: emptyQualification(101), latest_snapshot: null },
    { stock_id: 102, symbol: "MSFT", name: "Microsoft", stage: "radar", market: "us", has_position: false, qualification: emptyQualification(102), latest_snapshot: null },
  ];
  const strategy = () => ({
    strategy_key: "chang-five-day-line",
    name: "Five-day line observation",
    strategy_version: "1.1.0",
    enabled,
    parameters: { volume_multiplier: 1.45, break_buffer_pct: 0.075, hard_stop_pct: 0.2, recovery_sessions: 3, pullback_max_bias_pct: 0.02, trend_lookback: 5 },
    disclaimer: "Evidence for review only. This is not investment advice.",
    data_boundary: "Completed daily bars only; actionable signals are reviewed at the next session open.",
    updated_at: enabled ? "2026-08-16T10:00:00Z" : null,
  });

  await page.route("**/api/v1/auth/me", (route) => json(route, {
    id: 1, username: "seekdemo", nickname: "Demo", theme: "emerald", default_currency: "USD", nav_items: null, avatar_url: null, created_at: "2026-08-01T00:00:00Z",
  }));
  await page.route("**/api/v1/quant-strategies**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const stockIndex = parts.indexOf("stocks");
    const stockId = stockIndex >= 0 ? Number(parts[stockIndex + 1]) : null;

    if (request.method() === "GET" && url.pathname.endsWith("/quant-strategies")) return json(route, [strategy()]);
    if (request.method() === "PATCH") {
      enabled = Boolean((request.postDataJSON() as { enabled: boolean }).enabled);
      return json(route, strategy());
    }
    if (request.method() === "GET" && url.pathname.endsWith("/stocks")) return json(route, stocks);
    if (request.method() === "PUT" && stockId) {
      const body = request.postDataJSON() as { historical_low: boolean; valuation_low: boolean; attention_low: boolean; note: string };
      const qualification: Qualification = {
        stock_id: stockId,
        ...body,
        complete: true,
        qualified: body.historical_low && body.valuation_low && body.attention_low,
        updated_at: "2026-08-16T10:01:00Z",
      };
      stocks = stocks.map((stock) => stock.stock_id === stockId ? { ...stock, qualification } : stock);
      return json(route, qualification);
    }
    if (request.method() === "POST" && stockId) {
      await new Promise((resolve) => setTimeout(resolve, stockId === 101 ? 180 : 280));
      const entry = stockId === 101;
      const snapshot = {
        id: nextSnapshotId++,
        stock_id: stockId,
        strategy_key: "chang-five-day-line",
        strategy_version: "1.1.0",
        signal: entry ? "entry_breakout" : "hold_trend",
        reason_codes: entry ? ["breakout_volume"] : ["ma5_trend_intact"],
        metrics: entry
          ? { bar_count: 120, close: 210.25, ma5: 205.4, volume_ratio: 1.62 }
          : { bar_count: 120, close: 425.2, ma5: 421.8, volume_ratio: 0.91 },
        bar_date: "2026-08-15",
        source: "yahoo_finance",
        execution_timing: entry ? "next_session_open" : null,
        error_code: null,
        evaluated_at: "2026-08-16T10:02:00Z",
      };
      stocks = stocks.map((stock) => stock.stock_id === stockId ? { ...stock, latest_snapshot: snapshot } : stock);
      return json(route, snapshot);
    }
    return json(route, { detail: "Not found" }, 404);
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("zb_token", "quant-e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
  });
  await mockQuant(page);
});

test("quant plugin monitors watchlist signals with bounded scans", async ({ page }) => {
  const response = await page.goto("/quant");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Quant monitoring", exact: true })).toBeVisible();
  await expect(page.getByText("Completed daily bars only; actionable signals are reviewed at the next session open.", { exact: true })).toBeVisible();
  await expect(page.getByText("Evidence for review only. This is not investment advice.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Needs attention · 2" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox", { name: "Search watchlist" }).fill("MSFT");
  await expect(page.getByTestId("quant-stock-row")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search watchlist" }).fill("");
  await page.getByRole("button", { name: "View rules" }).click();
  await expect(page.getByText("3-day volume threshold", { exact: true })).toBeVisible();

  const strategySwitch = page.getByRole("switch", { name: "Enable five-day line observation" });
  await expect(strategySwitch).toHaveAttribute("aria-checked", "false");
  await strategySwitch.click();
  await expect(strategySwitch).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Scan watchlist" }).click();
  await expect(page.getByTestId("quant-progress")).toHaveText("0 / 2 scanned");
  await expect(page.getByTestId("quant-progress")).toHaveText("2 / 2 scanned");

  await page.getByRole("button", { name: "Matches rule · 2" }).click();
  const result = page.getByTestId("quant-stock-row").filter({ hasText: "AAPL" });
  await expect(result).toHaveAttribute("data-signal", "entry_breakout");
  await expect(result.getByRole("link", { name: "Open dossier" })).toHaveAttribute("href", "/watchlist/101");
  await expect(result.getByRole("link", { name: "Open dossier" })).toHaveAttribute("target", "_blank");
  await expect(result.getByRole("link", { name: "Open dossier" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(result).toContainText("2026-08-15 · Yahoo Finance");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
