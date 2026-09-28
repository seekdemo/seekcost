import { expect, test, type Page, type Route } from "@playwright/test";

const stock = {
  id: 87,
  symbol: "MSFT",
  name: "Microsoft",
  stage: "radar",
  sector: "Software",
  industries: ["Enterprise software"],
  concepts: ["Cloud computing"],
  inspiration: "Recurring revenue and durable distribution",
  entry_reason: "Review the transition from seat growth to usage growth.",
  business_summary: "Subscription software and cloud infrastructure.",
  growth_drivers: "Azure consumption and Copilot adoption.",
  fundamental_risks: "Cloud competition and slower enterprise budgets.",
  fundamental_metrics: [{ name: "Operating margin", value: "45%", period: "FY2025" }],
  thesis: "Legacy plain thesis",
  invalidation: "Two quarters of decelerating cloud growth.",
  current_price: 410,
  fair_price: 420,
  strike_price: 360,
  target_price: 500,
  planned_capital: 10000,
  tranches: 3,
  first_entry_drop: 0,
  add_on_drop: 10,
  notes: "",
  milestones: [],
  created_at: "2026-01-05T12:00:00Z",
  updated_at: "2026-08-01T12:00:00Z",
};

async function json(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockCandidateApi(page: Page, onSave: (body: Record<string, unknown>) => void) {
  const sections = [
    [1, "company_overview", stock.business_summary],
    [2, "industry_moat", ""],
    [3, "growth_financials", stock.growth_drivers],
    [4, "risks_invalidation", stock.invalidation],
    [5, "valuation_decision", stock.thesis],
  ].map(([id, key, summary]) => ({ id, user_id: 1, stock_id: 87, key, summary, evidence: [], open_questions: [], reviewed_at: null, next_review_at: null, review_note: "", created_at: stock.created_at, updated_at: stock.updated_at }));
  await page.route("**/api/v1/watchlist/stocks/87/research-profile", async (route) => json(route, { stock_id: 87, stock: { ...stock, user_id: 1, price_change: null, price_change_pct: null, price_session: "closed" }, research_sections: sections, memos: [], linked_research: [] }));
  await page.route("**/api/v1/watchlist/stocks/87/research-sections/*", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onSave(body);
    const key = route.request().url().split("/").at(-1);
    const section = sections.find((item) => item.key === key) || sections[0];
    await json(route, { ...section, ...body });
  });
  await page.route("**/api/v1/prices/price-volume?*", async (route) => json(route, {
    symbol: "MSFT", market: "us", range: "6mo", currency: "USD", exchange_timezone: "America/New_York", items: [],
    observation: { ma20: null, ma60: null, ma120: null, annualized_volatility: null, atr14: null, max_drawdown: null, relative_volume20: null, support60: null, resistance60: null, trend_basis: null, volume_basis: null, volatility_basis: null, drawdown_basis: null, position_basis: null, divergence_basis: null },
    data_quality: "empty", source: "yahoo_finance", as_of: null,
  }));
  await page.route("**/api/v1/watchlist/stocks", async (route) => json(route, [stock]));
  await page.route("**/api/v1/watchlist/stocks/87", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    onSave(body);
    await json(route, { ...stock, ...body });
  });
  await page.route("**/api/v1/notes*", async (route) => json(route, []));
  await page.route("**/api/v1/watchlist/memos*", async (route) => json(route, []));
  await page.route("**/api/v1/prices/daily-bars*", async (route) => json(route, {
    symbol: "MSFT",
    market: "us",
    range: "6mo",
    currency: "USD",
    exchange_timezone: "America/New_York",
    items: [],
  }));
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: 1, username: "fixture" } }));
  await page.route("**/api/v1/alerts/notifications*", route => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.addInitScript(() => {
    window.localStorage.setItem("zb_token", "rich-text-e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
    window.localStorage.setItem("seekcost_watchlist_backend_migrated_v1", "1");
  });
});

test("candidate narrative fields provide a responsive Markdown-first workflow", async ({ page }, testInfo) => {
  const saves: Record<string, unknown>[] = [];
  await mockCandidateApi(page, (body) => saves.push(body));
  const response = await page.goto("/watchlist/87");
  expect(response?.status()).toBe(200);

  await page.getByRole("button", { name: "Edit Valuation & decision anchors" }).click();
  const thesis = page.getByRole("textbox", { name: "Core view" });
  await expect(thesis).toBeVisible();
  await expect(thesis).toHaveValue("Legacy plain thesis");
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);

  if (testInfo.project.name === "desktop") {
    const editor = page.getByRole("region", { name: "Core view" });
    await thesis.fill("Durable margins");
    await thesis.press("ControlOrMeta+A");
    await editor.getByRole("button", { name: "Highlight" }).click();
    await expect(thesis).toHaveValue("**Durable margins**");

    await thesis.fill("");
    await thesis.evaluate((node) => {
      const data = new DataTransfer();
      data.setData("text/html", '<p style="color:red" onclick="alert(1)"><strong>Clean evidence</strong><script>alert(1)</script><img src="https://tracker.example/pixel.gif"></p>');
      node.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(thesis).toHaveValue("**Clean evidence**");
    expect(await thesis.inputValue()).not.toMatch(/script|onclick|style=|<img/i);

    await thesis.fill("Primary source");
    await thesis.press("ControlOrMeta+A");
    await editor.getByRole("button", { name: "Link", exact: true }).click();
    await expect(thesis).toHaveValue("[Primary source](https://)");

    await page.getByRole("button", { name: "Save module", exact: true }).click();
    await expect.poll(() => saves.length).toBeGreaterThan(0);
    expect(String(saves.at(-1)?.summary)).toContain("[Primary source](https://)");
  }
});

test("each company module prepares a sourced AI prompt and paste-ready editor", async ({ page }) => {
  await mockCandidateApi(page, () => {});
  await page.goto("/watchlist/87");

  await expect(page.getByRole("button", { name: /^Ask AI about / })).toHaveCount(5);
  await page.getByRole("button", { name: "Ask AI about Industry & moat" }).click();

  const dialog = page.getByRole("dialog", { name: "Ask AI · Industry & moat" });
  const prompt = dialog.getByRole("textbox", { name: "Research prompt" });
  await expect(prompt).toHaveValue(/Microsoft \(MSFT\)/);
  await expect(prompt).toHaveValue(/switching costs/i);
  await expect(prompt).toHaveValue(/counter-evidence/i);
  await expect(prompt).toHaveValue(/Markdown/i);
  await expect(prompt).toHaveValue(/roughly one screen/i);
  await expect(dialog.getByRole("link", { name: /Gemini/ })).toHaveAttribute("href", "https://gemini.google.com/app");
  await expect(dialog.getByRole("link", { name: /Grok/ })).toHaveAttribute("href", "https://grok.com/");

  await dialog.getByRole("button", { name: "Open editor to paste" }).click();
  await expect(page.getByRole("textbox", { name: "Core view" })).toBeFocused();
});

test("shared writing surface preserves drafts through formatting and preview", async ({ page }) => {
  const saves: Record<string, unknown>[] = [];
  await mockCandidateApi(page, body => saves.push(body));
  await page.goto("/watchlist/87");
  await page.getByRole("button", { name: "Edit Valuation & decision anchors" }).click();
  const editor = page.getByRole("region", { name: "Core view" });
  const input = editor.getByRole("textbox");
  await input.fill("Cash flow evidence");
  await input.press("ControlOrMeta+A");
  await editor.locator('[data-action="heading"]').click();
  await expect(input).toHaveValue("## Cash flow evidence");
  await expect(input).toBeFocused();
  await editor.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(input).toBeHidden();
  await expect(editor.getByRole("heading", { name: "Cash flow evidence", level: 2 })).toBeVisible();
  await expect(editor.locator('[data-action="bold"]')).toBeDisabled();
  await editor.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(input).toHaveValue("## Cash flow evidence");
  await expect(input).toBeFocused();
  await input.press("Control+Enter");
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0].summary).toBe("## Cash flow evidence");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("candidate quick decision keeps a path to the stable detail page", async ({ page }) => {
  await mockCandidateApi(page, () => {});

  const response = await page.goto("/watchlist");
  expect(response?.status()).toBe(200);

  const candidate = page.locator('button:has-text("MSFT"):has-text("Microsoft")').first();
  await expect(candidate).toBeVisible();
  await candidate.click();

  const drawer = page.getByRole("dialog", { name: "Quick decision" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Full company research" }).click();
  await expect(page).toHaveURL(/\/watchlist\/87$/);
  await expect(page.getByRole("heading", { name: "MSFT Microsoft" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Company overview" })).toBeVisible();
});

test("memo autosave creates once, queues edits and confirms deletion", async ({ page }, testInfo) => {
  await mockCandidateApi(page, () => {});
  const writes: {method:string; content?:string}[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/watchlist/memos", async route => {
    const body = route.request().postDataJSON();
    writes.push({method:"POST",content:body.content});
    await held;
    await route.fulfill({json:{id:91,stock_id:87,user_id:1,pinned:false,content:body.content,created_at:"2026-09-27T14:10:00Z",updated_at:"2026-09-27T14:10:00Z"}});
  });
  await page.route("**/api/v1/watchlist/memos/91", async route => {
    const body = route.request().method() === "PATCH" ? route.request().postDataJSON() : {};
    writes.push({method:route.request().method(),content:body.content});
    await route.fulfill({json:{id:91,stock_id:87,user_id:1,pinned:false,content:body.content,created_at:"2026-09-27T14:10:00Z",updated_at:"2026-09-27T14:11:00Z"}});
  });
  await page.goto("/watchlist/87");
  const pad = page.locator(".quick-memo-pad");
  const input = pad.getByRole("textbox");
  await input.fill("Check the next earnings report");
  await expect.poll(() => writes.length).toBe(1);
  await input.fill("Check the next earnings report and cash flow");
  await pad.getByRole("button",{name:"Done",exact:true}).click();
  await expect(pad.getByRole("button",{name:"Finishing…",exact:true})).toBeDisabled();
  release();
  await expect.poll(() => writes.length).toBe(2);
  await expect(input).toHaveValue("");
  expect(writes.map(item=>item.method)).toEqual(["POST","PATCH"]);
  await expect(pad.locator("article")).toHaveCount(1);
  await pad.screenshot({path:testInfo.outputPath("memo-saved.png")});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pad.locator("article").getByRole("button",{name:"Edit",exact:true}).click();
  await expect(input).toHaveValue("Check the next earnings report and cash flow");
  await expect(pad.locator("article textarea")).toHaveCount(1);
  await expect(pad.locator("article > p")).toHaveCount(0);
  await pad.getByRole("button",{name:"Done",exact:true}).click();
  await pad.locator("article summary").click();
  await pad.locator("article").getByRole("button",{name:"Delete",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Cancel"}).click();
  await expect(pad.locator("article")).toHaveCount(1);
  await pad.locator("article").getByRole("button",{name:"Delete",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Delete",exact:true}).click();
  await expect(pad.locator("article")).toHaveCount(0);
  await expect(input).toHaveValue("");
});

test("failed memo autosave retains text and supports deliberate retry", async ({ page }) => {
  await mockCandidateApi(page, () => {});
  let fail = true;
  await page.route("**/api/v1/watchlist/memos", route => fail ? route.fulfill({status:500,json:{detail:"Offline"}}) : route.fulfill({json:{id:92,stock_id:87,user_id:1,content:route.request().postDataJSON().content,pinned:false,created_at:"2026-09-27",updated_at:"2026-09-27"}}));
  await page.goto("/watchlist/87");
  const pad = page.locator(".quick-memo-pad");
  await pad.getByRole("textbox").fill("Do not lose this thought");
  await expect(pad.getByRole("status")).toContainText("Save failed");
  await expect(pad.getByRole("textbox")).toHaveValue("Do not lose this thought");
  await expect(pad.locator("article")).toHaveCount(0);
  fail = false;
  await pad.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(pad.getByRole("status")).toHaveText("✓ Saved");
  await expect(pad.locator("article")).toHaveCount(0);
  await pad.getByRole("button",{name:"Done",exact:true}).click();
  await expect(pad.locator("article")).toHaveCount(1);
});
