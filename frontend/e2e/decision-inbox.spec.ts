import { test, expect } from "@playwright/test";

const overview = {
  generated_at: "2026-09-24T00:00:00Z", upcoming_events: [], stale_stocks: [],
  strike_candidates: [{ id: 1, symbol: "NVDA", name: "英伟达", current_price: 180, strike_price: 175 }],
  due_research: [{ id: 2, title: "苹果的长期竞争优势", next_review_at: "2026-09-23" }],
  unreviewed_transactions: [{ id: 3, asset_id: 4, symbol: "MSFT", name: "微软", created_at: "2026-09-20" }],
  active_plans: [{ id: 4, asset_id: 5, symbol: "AMZN", name: "亚马逊", updated_at: "2026-09-22" }],
  incomplete_stocks: Array.from({ length: 8 }, (_, i) => ({ id: i + 10, symbol: `COMP${i}`, name: `待研究公司 ${i}`, missing: ["thesis"] })),
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

test("all task types, filters, search and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/decision");
  await expect(page.locator(".decision-task")).toHaveCount(12);
  for (const href of ["/watchlist/1", "/research/2", "/research/new?transaction=3&asset=4", "/assets/5", "/watchlist/17"]) {
    await expect(page.locator(`.decision-task[href="${href}"]`)).toBeVisible();
  }
  await page.getByRole("button", { name: /资料待补充\s*8/ }).click();
  await expect(page.locator(".decision-task")).toHaveCount(8);
  await page.getByRole("searchbox", { name: "搜索待办" }).fill("COMP7");
  await expect(page.locator(".decision-task")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "搜索待办" }).fill("不存在");
  await expect(page.getByText("没有匹配的事项")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.locator(".decision-task")).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("review draft survives tabs and saving updates records without a reload", async ({ page }) => {
  await page.route("**/api/v1/notes", route => route.request().method() === "POST" ? route.fulfill({ json: { ...note, id: 99, title: "新的投资复盘", kind: "review" } }) : route.fulfill({ json: [note] }));
  await page.goto("/decision#investment-review");
  const first = page.getByRole("textbox", { name: /哪个判断是有效的/ });
  await first.fill("现金流判断符合预期");
  await page.getByRole("tab", { name: /判断记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(1);
  await page.getByRole("tab", { name: "投资复盘", exact: true }).click();
  await expect(first).toHaveValue("现金流判断符合预期");
  await page.getByRole("textbox", { name: /最大的偏差是什么/ }).fill("高估了利润率恢复速度");
  await page.getByRole("textbox", { name: /下一阶段保留哪条原则/ }).fill("关注经营现金流");
  await page.getByRole("button", { name: "保存复盘", exact: true }).click();
  await expect(page.getByText("复盘已保存", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /判断记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(2);
});

test("partial failure is not presented as empty tasks and retry recovers", async ({ page }) => {
  let fail = true;
  await page.route("**/api/v1/workbench/overview", route => fail ? route.fulfill({ status: 500, json: { detail: "Unavailable" } }) : route.fulfill({ json: overview }));
  await page.goto("/decision");
  await expect(page.getByText("待办暂不可用", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /判断记录/ }).click();
  await expect(page.locator(".decision-record")).toHaveCount(1);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".decision-error")).toBeHidden();
  await page.getByRole("tab", { name: /待处理/ }).click();
  await expect(page.locator(".decision-task")).toHaveCount(12);
  await page.getByRole("tab", { name: /待处理/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /判断记录/ })).toBeFocused();
  await expect(page.getByRole("tab", { name: /判断记录/ })).toHaveAttribute("aria-selected", "true");
});
