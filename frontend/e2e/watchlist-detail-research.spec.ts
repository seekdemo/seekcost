import { expect, test, type Page } from "@playwright/test";

import { api } from "../src/lib/api";
import type { PriceVolumeResponse, WatchlistResearchProfile } from "../src/lib/types";

export const researchProfileFixture = {
  stock_id: 115,
  stock: {
    id: 115,
    user_id: 1,
    symbol: "KN",
    name: "Knowles",
    stage: "radar",
    sector: "Technology",
    industries: [],
    concepts: [],
    inspiration: "",
    entry_reason: "",
    business_summary: "Precision components company",
    growth_drivers: "",
    fundamental_risks: "",
    fundamental_metrics: [],
    thesis: "",
    invalidation: "",
    current_price: 39.39,
    price_change: null,
    price_change_pct: null,
    price_session: "closed",
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
    updated_at: "2026-08-09T00:00:00Z",
  },
  research_sections: [
    [1, "company_overview", "Precision components company"],
    [2, "industry_moat", "Industry position and competitive context"],
    [3, "growth_financials", ""],
    [4, "risks_invalidation", ""],
    [5, "valuation_decision", "Valuation range and decision anchor"],
  ].map(([id, key, summary]) => ({
    id: id as number,
    user_id: 1,
    stock_id: 115,
    key: key as "company_overview" | "industry_moat" | "growth_financials" | "risks_invalidation" | "valuation_decision",
    summary: summary as string,
    evidence: [],
    open_questions: [],
    reviewed_at: null,
    next_review_at: null,
    review_note: "",
    created_at: "2026-08-09T00:00:00Z",
    updated_at: "2026-08-09T00:00:00Z",
  })),
  memos: [],
  linked_research: [],
} satisfies WatchlistResearchProfile;

const priceItems = Array.from({ length: 130 }, (_item, index) => ({
  date: 1_754_608_000 + index * 86_400,
  open: 30 + index * 0.05,
  high: 31 + index * 0.05,
  low: 29.5 + index * 0.05,
  close: 30.4 + index * 0.05,
  volume: 100_000 + index * 1_000,
}));

export const priceVolumeFixture = {
  symbol: "KN",
  market: "us",
  range: "6mo",
  currency: "USD",
  exchange_timezone: "America/New_York",
  items: priceItems,
  moving_averages: priceItems.map((item, index) => ({
    date: item.date,
    ma5: index >= 4 ? item.close - 0.1 : null,
    ma10: index >= 9 ? item.close - 0.2 : null,
    ma20: index >= 19 ? item.close - 0.4 : null,
    ma60: index >= 59 ? item.close - 0.8 : null,
    ma120: index >= 119 ? item.close - 1.2 : null,
    ma250: 34.8 + index * 0.02,
  })),
  observation: {
    ma20: 38.2,
    ma60: 37.5,
    ma120: 35.9,
    annualized_volatility: 0.224,
    atr14: 1.45,
    max_drawdown: -0.132,
    relative_volume20: 1.37,
    support60: 32.8,
    resistance60: 40.1,
    trend_basis: "Price above MA60 by 5.0%; MA20 is above MA60.",
    volume_basis: "Latest volume is 1.37x the mean of the prior 20 completed sessions.",
    volatility_basis: "Annualized volatility is 22.4% using sample standard deviation scaled by sqrt(252).",
    drawdown_basis: "Maximum drawdown across the loaded range is 13.2%.",
    position_basis: "Latest close 39.39; support 32.80 and resistance 40.10.",
    divergence_basis: "Price and volume moved in the same direction over 20 sessions.",
  },
  data_quality: "complete",
  source: "yahoo_finance",
  as_of: "2026-08-08T20:00:00Z",
} satisfies PriceVolumeResponse;

void api.getWatchlistResearchProfile;
void api.updateWatchResearchSection;
void api.getPriceVolume;

async function authenticate(page: Page) {
  await page.route("**/api/v1/prices/price-volume?*", (route) => route.fulfill({ json: priceVolumeFixture }));
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.setItem("zb_token", "e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
  });
}

test("research detail fixtures keep the typed client boundary", async () => {
  expect(researchProfileFixture.stock.symbol).toBe("KN");
  expect(priceVolumeFixture.data_quality).toBe("complete");
});

test("dossier shell presents five read-only company research modules", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));

  await page.goto("/watchlist/115");
  await expect(page.getByRole("heading", { name: "KN · Knowles" })).toBeVisible();
  await expect(page.getByText("Content completeness", { exact: true })).toBeVisible();
  await expect(page.getByText("Define the core thesis before the next decision.", { exact: true })).toBeVisible();
  for (const heading of ["Company overview", "Industry & moat", "Growth & financial quality", "Risks & invalidation", "Valuation & decision anchors"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
});

test("price-volume and K line render auditable market observations", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));
  await page.goto("/watchlist/115");

  await expect(page.getByRole("heading", { name: "Price-volume observation" })).toBeVisible();
  await expect(page.getByText("Content completeness", { exact: true })).toBeVisible();
  await expect(page.getByText("60%", { exact: true })).toBeVisible();
  await expect(page.getByText("3 / 5 sections", { exact: true })).toBeVisible();
  await expect(page.getByText("Next verification", { exact: true })).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await expect(page.getByText("0 / 20 next steps prepared", { exact: true })).toBeVisible();
  await expect(page.getByText("Price above MA60 by 5.0%; MA20 is above MA60.", { exact: true })).toBeVisible();
  await expect(page.getByText("1.37x", { exact: true })).toBeVisible();
  await expect(page.getByText("22.4%", { exact: true })).toBeVisible();
  await expect(page.getByText("-13.2%", { exact: true })).toBeVisible();
  await expect(page.getByText("32.8 – 40.1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily candlestick chart" })).toBeVisible();
  for (const period of [5, 10, 20, 60, 120, 250]) {
    await expect(page.getByRole("button", { name: new RegExp(`MA${period}`) })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`ma-line-${period}`)).toBeVisible();
  }
  await expect(page.getByTestId("kline-candle")).toHaveCount(priceItems.length);
  await expect(page.getByTestId("kline-price-grid")).toHaveCount(0);

  const chart = page.getByTestId("kline-svg");
  await expect(chart).toHaveAttribute("data-active-index", String(priceItems.length - 1));
  await chart.press("ArrowLeft");
  await expect(chart).toHaveAttribute("data-active-index", String(priceItems.length - 2));
  await chart.press("Home");
  await expect(chart).toHaveAttribute("data-active-index", "0");

  const ma20 = page.getByRole("button", { name: /MA20/ });
  await ma20.click();
  await expect(ma20).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("ma-line-20")).toHaveCount(0);
  await expect(page.getByTestId("ma-line-5")).toBeVisible();

  const hoverVolumeRatio = page.getByRole("checkbox", { name: "Calculate the three-day volume strategy on hover" });
  await expect(hoverVolumeRatio).toBeChecked();
  await expect(page.getByTestId("kline-hover-volume-ratio")).toContainText("1.01x");
  await hoverVolumeRatio.uncheck();
  await expect(page.getByTestId("kline-hover-volume-ratio")).toHaveCount(0);
  await hoverVolumeRatio.check();
  await expect(page.getByTestId("kline-hover-volume-ratio")).toContainText("1.01x");
});

test("Chinese dossier localizes research, price-volume and memo workflows", async ({ page }) => {
  await authenticate(page);
  await page.evaluate(() => window.localStorage.setItem("seekcost:locale", "zh-CN"));
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));
  await page.goto("/watchlist/115");

  await expect(page.getByRole("heading", { name: "量价观察" })).toBeVisible();
  await expect(page.getByText("当前价格高于 MA60 5.0%；MA20 高于 MA60。", { exact: true })).toBeVisible();
  await expect(page.getByText("最新成交量是此前 20 个完整交易日均量的 1.37 倍。", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("记录一条观察、问题或提醒...")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Latest volume is");
  await expect(page.locator("body")).not.toContainText("Capture an observation");

  await page.getByRole("button", { name: "编辑公司概览" }).click();
  await expect(page.getByRole("textbox", { name: "核心观点" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加依据" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存模块" })).toBeVisible();
});

test("K line distinguishes empty data from provider failure", async ({ page }) => {
  await authenticate(page);
  await page.unroute("**/api/v1/prices/price-volume?*");
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));
  await page.route("**/api/v1/prices/price-volume?*", (route) => route.fulfill({ json: { ...priceVolumeFixture, items: [], data_quality: "empty", as_of: null } }));
  await page.goto("/watchlist/115");
  await expect(page.getByText("No daily bars are available for this range.", { exact: true })).toBeVisible();

  await page.unroute("**/api/v1/prices/price-volume?*");
  await page.route("**/api/v1/prices/price-volume?*", (route) => route.fulfill({ status: 503, json: { detail: "Provider unavailable" } }));
  await page.reload();
  await expect(page.getByText("The price provider is temporarily unavailable.", { exact: true })).toBeVisible();
});

test("research dossier adapts without horizontal overflow", async ({ page }, testInfo) => {
  await authenticate(page);
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));
  await page.goto("/watchlist/115");
  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(layout.page).toBeLessThanOrEqual(layout.viewport + 1);
  await expect(page.getByRole("navigation", { name: "Company research modules" })).toBeVisible();
  if (testInfo.project.name !== "desktop") {
    await page.getByRole("button", { name: "Edit Company overview" }).click();
    await expect(page.getByRole("button", { name: "Save module" })).toBeVisible();
    const controls = await page.locator("main button:visible:not([title])").evaluateAll((buttons) => buttons.slice(0, 25).map((button) => button.getBoundingClientRect().height));
    expect(controls.every((height) => height >= 40)).toBe(true);
  }
});

test("editor saves only the active research module", async ({ page }) => {
  await authenticate(page);
  let patchBody: Record<string, unknown> | null = null;
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));
  await page.route("**/api/v1/watchlist/stocks/115/research-sections/company_overview", async (route) => {
    patchBody = route.request().postDataJSON();
    await route.fulfill({ json: { ...researchProfileFixture.research_sections[0], ...patchBody, updated_at: "2026-08-10T00:00:00Z" } });
  });

  await page.goto("/watchlist/115");
  await page.getByRole("button", { name: "Edit Company overview" }).click();
  await expect(page.getByTestId("editor-company_overview")).toBeVisible();
  await page.getByRole("textbox", { name: "Core view" }).fill("Updated company judgment");
  await page.getByRole("button", { name: "Add evidence" }).click();
  await page.getByLabel("Label").fill("Annual report");
  await page.getByLabel("URL").fill("https://example.com/filing");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question").fill("Can margins hold?");
  await page.getByLabel("Next check date").fill("2026-09-01");
  await page.getByRole("button", { name: "Save module" }).click();

  await expect(page.getByTestId("editor-company_overview")).toHaveCount(0);
  expect(patchBody).toMatchObject({
    summary: "Updated company judgment",
    next_review_at: "2026-09-01T00:00:00Z",
  });
  expect(patchBody).not.toHaveProperty("research_sections");
});

test("editor keeps the unsaved draft when the server rejects it", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/watchlist/stocks/115/research-profile", (route) => route.fulfill({ json: researchProfileFixture }));
  await page.route("**/api/v1/watchlist/stocks/115/research-sections/company_overview", (route) => route.fulfill({ status: 500, json: { detail: "Temporary failure" } }));

  await page.goto("/watchlist/115");
  await page.getByRole("button", { name: "Edit Company overview" }).click();
  const editor = page.getByRole("textbox", { name: "Core view" });
  await editor.fill("Draft that must survive");
  await page.getByRole("button", { name: "Save module" }).click();

  await expect(page.getByText("Temporary failure", { exact: true })).toBeVisible();
  await expect(editor).toContainText("Draft that must survive");
});
