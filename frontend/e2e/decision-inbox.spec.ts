import { test, expect } from "@playwright/test";

const overview = {
  generated_at: "2026-09-24T00:00:00Z", stale_stocks: [],
  strike_candidates: [
    { id: 1, symbol: "NVDA", name: "英伟达", current_price: 177, strike_price: 175 },
    { id: 7, symbol: "NOQUOTE", name: "无行情标的", current_price: 0, strike_price: 0 },
  ],
  upcoming_events: [{ stock_id: 6, symbol: "DELL", title: "季度财报", date: "2026-09-26", days: 2 }],
  due_research: [{ id: 2, title: "苹果的长期竞争优势", kind: "company", status: "active", next_review_at: "2026-09-23" }],
  unreviewed_transactions: [{ id: 3, asset_id: 4, symbol: "MSFT", name: "微软", tx_type: "buy", created_at: "2026-09-20" }],
  active_plans: [{ id: 4, asset_id: 5, symbol: "AMZN", name: "亚马逊", updated_at: "2026-09-22" }],
  incomplete_stocks: Array.from({ length: 8 }, (_, i) => ({ id: i + 10, symbol: `COMP${i}`, name: `待研究公司 ${i}`, missing: ["thesis"] })),
  watchlist_summary: { total: 20, radar: 18, conviction: 2, strike: 0 },
};
const note = { id: 2, title: "苹果的长期竞争优势", content: "现金流与竞争优势", tags: ["护城河"], status: "active", updated_at: "2026-09-24", links: [], kind: "company" };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: { id: 1, username: "fixture" } }));
  await page.route("**/api/v1/alerts/notifications*", route => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.route("**/api/v1/workbench/overview", route => route.fulfill({ json: overview }));
  await page.route("**/api/v1/notes?*", route => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes", route => route.fulfill({ json: [note] }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "fixture");
    localStorage.setItem("seekcost:locale", "zh-CN");
    localStorage.setItem("zb_theme", "light");
  });
});

test("only genuine triggers enter the thinking list", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/decision");
  await expect(page.getByRole("tab", { name: /待思考\s*3/ })).toBeVisible();
  await expect(page.locator(".decision-thought")).toHaveCount(3);
  await expect(page.getByText("COMP0")).toHaveCount(0);
  await expect(page.getByText("NOQUOTE")).toHaveCount(0);
  await expect(page.getByText("AMZN")).toHaveCount(0);
  await page.getByRole("button", { name: /价格提醒\s*1/ }).click();
  await expect(page.locator(".decision-thought")).toHaveCount(1);
  await expect(page.locator(".decision-thought")).toContainText("NVDA");
  await page.getByRole("searchbox", { name: "搜索标的或问题" }).fill("不存在");
  await expect(page.getByText("没有匹配的思考事项")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.locator(".decision-thought")).toHaveCount(3);
  await page.locator(".decision-quiet--trade button").click();
  await expect(page.getByRole("link", { name: /MSFT/ })).toHaveAttribute("href", "/research/new?transaction=3&asset=4");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("selection previews a real trigger and links to its context", async ({ page, isMobile }) => {
  await page.goto("/decision");
  await page.getByRole("button", { name: /DELL.*季度财报/ }).click();
  if (isMobile) {
    await expect(page.getByRole("dialog", { name: "DELL 思考预览" })).toBeVisible();
    await page.getByRole("button", { name: "关闭预览" }).click();
    await expect(page.getByRole("dialog", { name: "DELL 思考预览" })).toHaveCount(0);
    const trigger = page.getByRole("button", { name: /DELL.*季度财报/ });
    await trigger.click();
    await page.getByRole("button", { name: "关闭预览" }).press("Escape");
    await expect(page.getByRole("dialog", { name: "DELL 思考预览" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } else {
    await expect(page.locator(".decision-preview--desktop")).toContainText("DELL");
  }
  await page.getByRole("tab", { name: /思考记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(1);
  await page.getByRole("tab", { name: /思考记录/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "阶段回顾", exact: true })).toBeFocused();
});

test("a quiet watchlist does not become an artificial to-do", async ({ page }) => {
  await page.route("**/api/v1/workbench/overview", route => route.fulfill({ json: { ...overview, strike_candidates: [], upcoming_events: [], due_research: [], unreviewed_transactions: [] } }));
  await page.goto("/decision");
  await expect(page.getByRole("tab", { name: /待思考\s*0/ })).toBeVisible();
  await expect(page.getByText("暂时没有需要重新检查的变化")).toBeVisible();
  await expect(page.locator(".decision-thought")).toHaveCount(0);
  await expect(page.locator('.decision-recent-notes a[href="/research/2"]')).toBeVisible();
});

test("recording from a price trigger starts with the company linked", async ({ page, isMobile }) => {
  await page.route("**/api/v1/watchlist/stocks", route => route.fulfill({ json: [{ id: 1, symbol: "NVDA", name: "英伟达", stage: "radar" }] }));
  await page.goto("/decision");
  await page.getByRole("button", { name: /NVDA.*关注区间/ }).click();
  const preview = isMobile ? page.getByRole("dialog", { name: "NVDA 思考预览" }) : page.locator(".decision-preview--desktop");
  await expect(preview.getByRole("link", { name: /记录这次思考/ })).toHaveAttribute("href", "/research/new?stock=1");
  await page.goto("/research/new?stock=1");
  await expect(page.getByRole("region", { name: "关联标的" }).getByRole("button", { name: "展开关联标的" })).toContainText("NVDA");
});

test("stage review draft survives tabs and saving updates records", async ({ page }) => {
  await page.route("**/api/v1/notes", route => route.request().method() === "POST" ? route.fulfill({ json: { ...note, id: 99, title: "新的投资复盘", kind: "review" } }) : route.fulfill({ json: [note] }));
  await page.goto("/decision#investment-review");
  const first = page.getByRole("textbox", { name: /哪个判断是有效的/ });
  await first.fill("现金流判断符合预期");
  await page.getByRole("tab", { name: /思考记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(1);
  await page.getByRole("tab", { name: "阶段回顾", exact: true }).click();
  await expect(first).toHaveValue("现金流判断符合预期");
  await page.getByRole("textbox", { name: /最大的偏差是什么/ }).fill("高估了利润率恢复速度");
  await page.getByRole("textbox", { name: /下一阶段保留哪条原则/ }).fill("关注经营现金流");
  await page.getByRole("button", { name: "保存复盘", exact: true }).click();
  await expect(page.getByText("复盘已保存", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /思考记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(2);
});

test("partial failure is not presented as an empty list and retry recovers", async ({ page }) => {
  let fail = true;
  await page.route("**/api/v1/workbench/overview", route => fail ? route.fulfill({ status: 500, json: { detail: "Unavailable" } }) : route.fulfill({ json: overview }));
  await page.goto("/decision");
  await expect(page.getByText("待思考内容暂不可用", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /思考记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(1);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".decision-error")).toBeHidden();
  await page.getByRole("tab", { name: /待思考/ }).click();
  await expect(page.locator(".decision-thought")).toHaveCount(3);
});

test("post-close volume observation is filterable and its threshold is editable", async ({ page, isMobile }) => {
  let threshold = 1.5;
  const volumeItem = { stock_id: 9, symbol: "COST", name: "好市多", ratio: 1.7, latest_volume: 170, previous_volume: 100, bar_date: "2026-09-28" };
  await page.route("**/api/v1/workbench/overview", route => route.fulfill({ json: {
    ...overview,
    volume_watch: { threshold, items: threshold <= 1.7 ? [volumeItem] : [], scanned_count: 20, total_count: 20, last_evaluated_at: "2026-09-28T21:00:00Z" },
  } }));
  await page.route("**/api/v1/workbench/volume-watch", async route => {
    threshold = (route.request().postDataJSON() as { threshold: number }).threshold;
    await route.fulfill({ json: { threshold } });
  });
  await page.goto("/decision");
  await expect(page.getByRole("tab", { name: /待思考\s*4/ })).toBeVisible();
  await page.getByRole("button", { name: /放量关注\s*1/ }).click();
  await expect(page.locator(".decision-thought")).toHaveCount(1);
  await expect(page.locator(".decision-thought")).toContainText("1.70 倍");
  await expect(page.getByText("完整日 K · 已扫描 20/20")).toBeVisible();
  await page.getByRole("button", { name: "修改放量观察门槛" }).click();
  await page.getByRole("spinbutton", { name: "成交量倍数门槛" }).fill("1.8");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "修改放量观察门槛" })).toContainText("1.8×");
  await expect(page.locator(".decision-thought")).toHaveCount(0);
  await expect(page.getByText("暂无达到 1.8× 的标的")).toBeVisible();
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
