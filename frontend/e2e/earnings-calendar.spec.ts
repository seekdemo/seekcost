import { expect, test } from "@playwright/test";

const stock = { id: 87, symbol: "MSFT", name: "Microsoft" };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "earnings-calendar-e2e-token");
    localStorage.setItem("seekcost:locale", "en");
  });
});

test("watchlist earnings calendar is responsive and can create an event", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  let syncRequested = false;
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [stock] }));
  await page.route("**/api/v1/watchlist/earnings**", async (route) => {
    if (route.request().url().endsWith("/earnings/sync")) {
      syncRequested = true;
      await route.fulfill({ json: { checked: 1, created: 0, updated: 0, unchanged: 1, manual_protected: 0, unavailable: 0, skipped: 0, provider_errors: [] } });
      return;
    }
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ json: { id: 1, user_id: 1, stock_id: 87, symbol: "MSFT", name: "Microsoft", event_date: "2026-08-28", fiscal_period: "Q2 FY2026", status: "confirmed", note: "Check margin trend", source: "manual", synced_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto("/watchlist/earnings");
  await expect(page.getByRole("heading", { name: "Earnings calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Sync dates" }).click();
  await expect.poll(() => syncRequested).toBe(true);
  await expect(page.getByText(/Checked 1/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Watchlist symbol" })).toBeVisible();
  await page.getByRole("combobox", { name: "Watchlist symbol" }).selectOption("87");
  await page.getByRole("textbox", { name: "Fiscal period" }).fill("Q2 FY2026");
  await page.getByRole("combobox", { name: "Date confidence" }).selectOption("confirmed");
  await page.getByRole("textbox", { name: "Private note" }).fill("Check margin trend");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect.poll(() => saved).toMatchObject({ stock_id: 87, fiscal_period: "Q2 FY2026", status: "confirmed" });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});

test("calendar more button opens every event for that day", async ({ page }) => {
  const target = new Date();
  target.setDate(15);
  const targetDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-15`;
  const events = ["AAPL", "MSFT", "NVDA", "META"].map((symbol, index) => ({
    id: index + 1,
    user_id: 1,
    stock_id: 87 + index,
    symbol,
    name: `${symbol} Company`,
    event_date: targetDate,
    fiscal_period: "Q2 FY2026",
    status: "estimated",
    note: "",
    source: "yahoo",
    synced_at: "2026-08-08T01:00:00Z",
    created_at: "2026-08-08T01:00:00Z",
    updated_at: "2026-08-08T01:00:00Z",
  }));
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [stock] }));
  await page.route("**/api/v1/watchlist/earnings**", (route) => route.fulfill({ json: events }));

  await page.goto("/watchlist/earnings");
  await page.getByRole("button", { name: /View all 4 earnings on/ }).click();
  const dialog = page.getByRole("dialog", { name: "4 earnings events" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("META · META Company")).toBeVisible();
  await dialog.getByRole("button", { name: /META · META Company/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Edit earnings" })).toBeVisible();
});
