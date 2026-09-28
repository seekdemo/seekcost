import { expect, test } from "@playwright/test";

test("rules can be searched and filtered without losing context", async ({ page }, info) => {
  const base = { stock_id: 1, scope: "single", period: 20, tolerance: 2, side: "both", cooldown_minutes: 1440, enabled: true, checked_at: "2026-09-27T10:30:00Z", evidence: null };
  const rules = [
    { ...base, id: 1, symbol: "NVDA", stock_name: "英伟达", name: "回到中期均线附近", status: "inside" },
    { ...base, id: 2, symbol: "AAPL", stock_name: "苹果", name: "等待回调", status: "outside", enabled: false },
    { ...base, id: 3, scope: "watchlist", name: "全部自选 · 趋势观察", status: "watching", target_count: 10, checked_count: 8, unavailable_count: 2 },
  ];
  await page.addInitScript(() => { localStorage.setItem("zb_token", "fixture"); localStorage.setItem("seekcost:locale", "zh-CN"); });
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/alerts/rules") ? rules : path.endsWith("/watchlist/stocks") ? [{ id: 1, symbol: "NVDA", name: "英伟达" }] : { items: [], unread_count: 0 } });
  });
  await page.goto("/alerts");
  await expect(page.getByTestId("alert-rule-card")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("alerts-list.png"), fullPage: true });
  await page.getByLabel("搜索提醒", { exact: true }).fill("苹果");
  await expect(page.getByTestId("alert-rule-card")).toHaveCount(1);
  await expect(page.getByTestId("alert-rule-card")).toContainText("等待回调");
  await page.getByLabel("搜索提醒", { exact: true }).fill("");
  await page.getByRole("group", { name: "筛选规则" }).getByRole("button", { name: /需留意/ }).click();
  await expect(page.getByTestId("alert-rule-card")).toHaveCount(1);
  await page.getByTestId("alert-rule-card").getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByTestId("alert-rule-card")).toHaveCount(0);
  if (info.project.name === "mobile") {
    await page.locator("#alert-period").scrollIntoViewIfNeeded();
    const save = await page.getByRole("button", { name: "保存提醒", exact: true }).boundingBox();
    const nav = await page.locator(".mobile-primary-navigation").boundingBox();
    expect(save).not.toBeNull();
    expect(save!.y + save!.height).toBeLessThanOrEqual(nav!.y);
    await page.screenshot({ path: info.outputPath("editor-mobile-actions.png") });
  }
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByTestId("alert-rule-card")).toHaveCount(1);
  await page.getByLabel("搜索提醒", { exact: true }).fill("not-found");
  await expect(page.getByRole("heading", { name: "没有匹配的提醒" })).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.getByTestId("alert-rule-card")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
