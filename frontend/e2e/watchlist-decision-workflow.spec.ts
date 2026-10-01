import { expect, test, type Page, type Route } from "@playwright/test";

type StockFixture = Record<string, unknown> & { id: number; symbol: string; name: string; stage: string };

function stock(overrides: Partial<StockFixture> & Pick<StockFixture, "id" | "symbol" | "name" | "stage">): StockFixture {
  return {
    sector: "Semiconductors",
    industries: ["Semiconductors"],
    concepts: ["AI infrastructure"],
    inspiration: "Initial industry clue",
    entry_reason: "Worth tracking beyond daily movement",
    business_summary: "Mission-critical components with recurring demand",
    growth_drivers: "Capacity expansion",
    fundamental_risks: "Cyclical demand",
    fundamental_metrics: [],
    thesis: "",
    invalidation: "Demand falls for two consecutive quarters",
    current_price: 100,
    price_change: 4,
    price_change_pct: 4.16,
    price_session: "regular",
    fair_price: 95,
    strike_price: 80,
    target_price: 130,
    planned_capital: 10_000,
    tranches: 3,
    first_entry_drop: 0,
    add_on_drop: 10,
    notes: "",
    milestones: [{ id: "event-1", date: "2026-09-01", title: "Earnings", done: false }],
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

const fixtures = [
  stock({ id: 1, symbol: "RADR", name: "Radar Systems", stage: "radar", thesis: "Track durable demand", price_change: 8, price_change_pct: 8.2 }),
  stock({ id: 2, symbol: "RSCH", name: "Research Holdings", stage: "conviction", thesis: "Validate margin recovery", current_price: 86, strike_price: 80 }),
  stock({ id: 3, symbol: "HIT", name: "Strike Industries", stage: "strike", thesis: "Execute only inside the planned range", current_price: 79, strike_price: 80, price_change: -1.7, price_change_pct: -2.1 }),
];

async function json(route: Route, value: unknown) {
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
}

async function installWatchlist(
  page: Page,
  onPatch?: (id: number, body: Record<string, unknown>) => void,
  stockRows: StockFixture[] = fixtures,
) {
  let stocks = stockRows.map((item) => ({ ...item }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "watchlist-decision-token");
    localStorage.setItem("seekcost:locale", "en");
  });
  // Keep fixture sessions isolated from a running backend and its auth checks.
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/alerts/notifications")) return json(route, { items: [], unread_count: 0, next_cursor: null });
    if (path.endsWith("/prices/intraday-quote")) return json(route, { status: "unavailable", points: [] });
    return route.fulfill({ status: 404, json: { detail: `Unmocked API: ${path}` } });
  });
  await page.route("**/api/v1/watchlist/stocks", (route) => json(route, stocks));
  await page.route(/\/api\/v1\/watchlist\/stocks\/(\d+)$/, async (route) => {
    const id = Number(route.request().url().match(/stocks\/(\d+)$/)?.[1]);
    if (route.request().method() !== "PATCH") return json(route, stocks.find((item) => item.id === id));
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onPatch?.(id, body);
    stocks = stocks.map((item) => item.id === id ? { ...item, ...body, updated_at: "2026-08-16T00:00:00Z" } : item);
    await json(route, stocks.find((item) => item.id === id));
  });
  await page.route("**/api/v1/watchlist/stocks/*/research-profile", (route) => json(route, { stock_id: 1, stock: fixtures[0], research_sections: [], memos: [], linked_research: [] }));
  await page.route("**/api/v1/prices/daily-bars**", (route) => json(route, { items: [] }));
  await page.route("**/api/v1/prices/price-volume**", (route) => json(route, {
    symbol: "RADR", market: "us", range: "6mo", currency: "USD", exchange_timezone: "America/New_York",
    items: [], moving_averages: [], observation: {}, data_quality: "empty", source: "e2e", as_of: null,
  }));
  await page.route("**/api/v1/notes**", (route) => json(route, []));
  await page.route("**/api/v1/watchlist/memos**", (route) => json(route, []));
}

test("the decision funnel isolates radar noise and opens research in a new tab without loading legacy memos", async ({ page }) => {
  const memoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/watchlist/memos")) memoRequests.push(request.url());
  });
  await installWatchlist(page);
  await page.goto("/watchlist");

  const radarRow = page.locator('[data-watch-stock-id="1"]');
  await expect(radarRow).toContainText("Track durable demand");
  await expect(radarRow).not.toContainText("8.20%");
  await radarRow.click();

  const drawer = page.getByRole("dialog", { name: "Quick decision" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Track durable demand", { exact: true })).toBeVisible();
  const [researchPage] = await Promise.all([
    page.context().waitForEvent("page"),
    drawer.getByRole("link", { name: "Full company research" }).click(),
  ]);
  await expect(researchPage).toHaveURL(/\/watchlist\/1$/);
  await expect(page).toHaveURL(/\/watchlist$/);
  expect(memoRequests).toHaveLength(0);
});

test("slash, J K and stage shortcuts operate the active decision row", async ({ page }) => {
  const patches: Array<{ id: number; body: Record<string, unknown> }> = [];
  await installWatchlist(page, (id, body) => patches.push({ id, body }));
  await page.goto("/watchlist");

  await expect(page.locator('[data-watch-stock-id="1"]')).toBeVisible();
  await page.keyboard.press("/");
  const search = page.getByRole("searchbox", { name: "Search watchlist" });
  await expect(search).toBeFocused();
  await search.press("Escape");
  await page.keyboard.press("j");
  await expect(page.locator('[data-watch-stock-id="1"]')).toHaveAttribute("data-active", "true");
  await page.keyboard.press("2");
  await expect.poll(() => patches.at(-1)).toEqual({ id: 1, body: { stage: "conviction" } });
});

test("strike movement and Cmd K filtering stay focused and responsive", async ({ page }) => {
  await installWatchlist(page);
  await page.route("**/api/v1/prices/intraday-quote**", (route) => {
    if (new URL(route.request().url()).searchParams.get("symbol") !== "HIT") return route.fallback();
    return json(route, {
      status: "available", price: 79, previous_close: 80.7, change_pct: -2.1,
      currency: "USD", source: "Workflow quote fixture", as_of: 1789155600,
      session_date: "2026-09-11",
      points: [80.2, 79.8, 79].map((price, index) => ({ timestamp: 1789155000 + index * 300, price })),
    });
  });
  await page.goto("/watchlist");

  await page.getByRole("button", { name: /Strike zone/ }).click();
  await expect(page.locator('[data-watch-stock-id="3"]')).toContainText("-2.10%");

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Watchlist command palette" });
  await palette.getByRole("textbox", { name: "Watchlist command" }).fill("filter planned range");
  await palette.getByRole("textbox", { name: "Watchlist command" }).press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search watchlist" })).toHaveValue("planned range");
  await expect(page.locator('[data-watch-stock-id="3"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("low-frequency tools collapse after clicking outside", async ({ page }) => {
  await installWatchlist(page);
  await page.goto("/watchlist");

  const tools = page.getByRole("button", { name: "Watchlist tools" });
  await tools.click();
  await expect(page.getByRole("menu", { name: "Watchlist tools" })).toBeVisible();
  await page.getByRole("heading", { name: "Personal watchlist" }).click();
  await expect(page.getByRole("menu", { name: "Watchlist tools" })).toHaveCount(0);
});

test("industry navigation rejects narrative data and expands compact groups", async ({ page, isMobile }) => {
  const narrative = "### Core view\n**This is research, not an industry.**\nhttps://example.test/%3FCIK%3D001";
  const rows = [
    stock({ id: 20, symbol: "DIRTY", name: "Narrative sector", stage: "radar", sector: narrative, industries: [] }),
    ...Array.from({ length: 8 }, (_, index) => stock({
      id: 21 + index,
      symbol: `IND${index + 1}`,
      name: `Industry company ${index + 1}`,
      stage: "radar",
      sector: `Industry ${index + 1}`,
      industries: [`Industry ${index + 1}`],
    })),
    ...Array.from({ length: 5 }, (_, index) => stock({
      id: 50 + index,
      symbol: `RAW${index + 1}`,
      name: `Unclassified company ${index + 1}`,
      stage: "radar",
      sector: narrative,
      industries: [],
    })),
  ];
  await installWatchlist(page, undefined, rows);
  await page.goto("/watchlist");

  if (isMobile) {
    await page.getByRole("button", { name: "Industry", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Industry view", exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Core view");
    await expect(page.locator("main")).not.toContainText("%3FCIK");
    const lastIndustry = page.locator("section").filter({ has: page.getByRole("heading", { name: "Industry 8", exact: true }) });
    await expect(lastIndustry.getByRole("heading", { name: "IND8", exact: true })).toBeVisible();

    const unclassified = page.locator("section").filter({ has: page.getByRole("heading", { name: "Unclassified", exact: true }) });
    await expect(unclassified.getByRole("heading", { name: "RAW5", exact: true })).toHaveCount(0);
    await unclassified.getByRole("button", { name: "Show more (1)", exact: true }).click();
    await expect(unclassified.getByRole("heading", { name: "RAW5", exact: true })).toBeVisible();
    await unclassified.getByRole("button", { name: "Collapse unclassified", exact: true }).click();
    await expect(unclassified.getByRole("heading", { name: "RAW5", exact: true })).toHaveCount(0);
    return;
  }

  const industry = page.getByRole("region", { name: "Industry" });
  await expect(industry).toBeVisible();
  await expect(industry).not.toContainText("Core view");
  await expect(industry).not.toContainText("%3FCIK");
  await expect(industry.getByRole("button", { name: /Industry 8/ })).toHaveCount(0);

  const expand = industry.getByRole("button", { name: "Show all 8" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(industry.getByRole("button", { name: /Industry 8/ })).toBeVisible();
  await expect(industry.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
});
