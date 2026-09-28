import { expect, test } from "@playwright/test";

const baseStock = {
  id: 1,
  user_id: 1,
  symbol: "NXPI",
  name: "NXP Semiconductors",
  stage: "radar",
  sector: "",
  industries: [],
  concepts: [],
  inspiration: "",
  entry_reason: "",
  business_summary: "",
  growth_drivers: "",
  fundamental_risks: "",
  fundamental_metrics: [],
  thesis: "",
  invalidation: "",
  current_price: 0,
  price_change: null,
  price_change_pct: null,
  price_session: "",
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
  updated_at: "2026-08-08T00:00:00Z",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "watchlist-classification-token");
    localStorage.setItem("seekcost:locale", "en");
  });
});

test("uploaded groups can be reviewed and actively applied as concepts", async ({ page }) => {
  let applyBody: { groups?: Array<{ key: string; label: string; selected: boolean }> } = {};
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [baseStock] }));
  await page.route("**/api/v1/notes**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/watchlist/memos**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/watchlist/classification/preview", (route) => route.fulfill({
    json: {
      session_id: "preview-session",
      file_count: 2,
      group_count: 2,
      matched_stock_count: 1,
      unmatched_count: 1,
      groups: [
        { key: "group-ai", source_filename: "AI.csv", suggested_name: "AI Infrastructure", row_count: 2, matched_count: 1, unmatched_count: 1, already_assigned_count: 0, sample_symbols: ["NXPI"] },
        { key: "group-space", source_filename: "Space.csv", suggested_name: "Commercial Space", row_count: 1, matched_count: 1, unmatched_count: 0, already_assigned_count: 0, sample_symbols: ["NXPI"] },
      ],
      unmatched_symbols: ["MISSING"],
    },
  }));
  await page.route("**/api/v1/watchlist/classification/apply", async (route) => {
    applyBody = route.request().postDataJSON() as typeof applyBody;
    await route.fulfill({
      json: {
        updated_count: 1,
        assignments_added: 1,
        unchanged_count: 0,
        items: [{ ...baseStock, concepts: ["AI Compute"] }],
      },
    });
  });

  await page.goto("/watchlist");
  const fileInput = page.locator('input[type="file"][multiple]');
  await fileInput.setInputFiles([
    { name: "AI.csv", mimeType: "text/csv", buffer: Buffer.from("Symbol,Name\nNXPI.US,NXP") },
    { name: "Space.csv", mimeType: "text/csv", buffer: Buffer.from("Symbol,Name\nNXPI.US,NXP") },
  ]);

  const dialog = page.getByRole("dialog", { name: "Review concept groups" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1", { exact: true })).toHaveCount(2);
  await dialog.getByRole("textbox", { name: "Concept name from AI.csv" }).fill("AI Compute");
  await dialog.getByRole("checkbox", { name: "Select group Commercial Space" }).uncheck();
  await dialog.getByRole("button", { name: "Apply concepts" }).click();

  await expect.poll(() => applyBody.groups).toEqual([
    { key: "group-ai", label: "AI Compute", selected: true },
    { key: "group-space", label: "Commercial Space", selected: false },
  ]);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Concept view" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Compute", exact: true })).toBeVisible();
  await expect(page.getByText(/Updated 1 symbols with 1 concept assignments/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
