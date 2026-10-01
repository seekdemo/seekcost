import { expect, test, type Page } from "@playwright/test";

const overview = {
  generated_at: "2026-09-28T00:00:00Z", strike_candidates: [], due_research: [],
  upcoming_events: [{ stock_id: 6, symbol: "MSFT", title: "季度财报", date: "2026-10-05", days: 7 }],
  stale_stocks: [], incomplete_stocks: [], active_plans: [], unreviewed_transactions: [],
  watchlist_summary: { total: 10, radar: 8, conviction: 2, strike: 0 },
  volume_watch: { threshold: 1.5, items: [], scanned_count: 10, total_count: 10 },
};
const note = {
  id: 2, title: "微软 · 收入质量观察", content: "核对续约情况和经营现金流。",
  kind: "company", status: "active", tags: [], stock_symbols: ["MSFT"],
  links: [{ entity_type: "watch_stock", entity_id: 6 }], updated_at: "2026-09-28",
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: 1, username: "fixture" } }));
  await page.route("**/api/v1/alerts/notifications*", route => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.route("**/api/v1/workbench/overview", route => route.fulfill({ json: overview }));
  await page.route("**/api/v1/notes{,?*}", route => route.fulfill({ json: [note] }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "fixture");
    localStorage.setItem("seekcost:locale", "zh-CN");
    if (!localStorage.getItem("zb_theme")) localStorage.setItem("zb_theme", "light");
  });
});

test("light workspace uses the approved soft palette and navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/decision");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 250, 247)");
  const active = page.getByTestId("section-navigation").locator('a[aria-current="page"]');
  await expect(active).toBeVisible();
  await expect(active).toHaveCSS("color", "rgb(95, 115, 128)");
  await expect(active).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await active.evaluate(el => getComputedStyle(el, "::after").backgroundColor)).toBe("rgb(131, 150, 161)");
  const primary = page.viewportSize()!.width >= 768
    ? page.getByTestId("primary-navigation").locator('a[aria-current="page"]')
    : page.locator('.mobile-primary-navigation a[aria-current="page"]');
  await expect(primary).toBeVisible();
  await expect(primary).toHaveCSS("color", "rgb(95, 115, 128)");
  await expect(primary).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const expected = {
    "--page-bg": "#FAFAF7", "--surface": "#FEFEFC", "--text-primary": "#3B4146",
    "--text-secondary": "#67716F", "--accent": "#5F7380", "--border": "#E5E7E2",
    "--selected-bg": "#EEF2F3", "--selected-line": "#8396A1", "--action-bg": "#E3EAED",
    "--action-fg": "#405763", "--action-border": "#C7D2D8",
  };
  expect(await page.evaluate(keys => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(keys.map(key => [key, style.getPropertyValue(key).trim().toUpperCase()]));
  }, Object.keys(expected))).toEqual(expected);
  expect(errors).toEqual([]);
});

async function expectDerivedTokens(page: Page) {
  const colors = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (value: string) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const definitions = {
      "--action-bg": "color-mix(in srgb, var(--accent) 12%, var(--surface))",
      "--action-fg": "var(--accent)",
      "--action-border": "color-mix(in srgb, var(--accent) 30%, var(--border))",
      "--selected-bg": "color-mix(in srgb, var(--accent) 8%, var(--surface))",
      "--selected-line": "var(--accent)",
    };
    const result = Object.entries(definitions).map(([token, definition]) => ({
      token, actual: resolve(`var(${token})`), expected: resolve(definition),
    }));
    probe.remove();
    return result;
  });
  for (const { token, actual, expected } of colors) expect(actual, token).toBe(expected);
}

test("stored dark, custom and legacy themes keep derived controls and custom color", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/decision");
  await page.evaluate(() => localStorage.setItem("zb_theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(22, 23, 25)");
  await expect(page.locator(".decision-thought")).toHaveCount(1);
  await expectDerivedTokens(page);
  await page.screenshot({ path: testInfo.outputPath("dark.png"), fullPage: true });

  await page.evaluate(() => {
    localStorage.setItem("zb_theme", "custom");
    localStorage.setItem("zb_custom_color", "#8db9aa");
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
  const active = page.getByTestId("section-navigation").locator('a[aria-current="page"]');
  await expect(active).toHaveCSS("color", "rgb(141, 185, 170)");
  await expect(page.locator(".decision-thought")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent"))).toBe("#8db9aa");
  await expectDerivedTokens(page);
  await page.screenshot({ path: testInfo.outputPath("custom.png"), fullPage: true });

  await page.evaluate(() => localStorage.setItem("zb_theme", "emerald"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "emerald");
  // Independent values from the retained legacy palette, rather than values
  // calculated from potentially overwritten theme variables.
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(12, 14, 18)");
  await expect(active).toHaveCSS("color", "rgb(52, 211, 153)");
  expect(await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ["--accent", "--surface", "--border"].map(key => style.getPropertyValue(key).trim());
  })).toEqual(["#34d399", "#161920", "#252a34"]);
  await expectDerivedTokens(page);
  await page.evaluate(() => localStorage.setItem("zb_theme", "light"));
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 250, 247)");
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent"))).toBe("");
  expect(await page.evaluate(() => localStorage.getItem("zb_custom_color"))).toBe("#8db9aa");
  expect(errors).toEqual([]);
});
