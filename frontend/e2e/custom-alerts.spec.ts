import { test, expect } from "@playwright/test";

test("custom alerts can be created, edited, paused and read on every screen", async ({ page }, info) => {
  let rules: Record<string, unknown>[] = [];
  let read = false;
  const note = { id: 41, stock_id: 135, rule_name: "回到中期均线附近", symbol: "NVDA", read_at: null, created_at: "2026-09-15T14:00:00Z", evidence: { price: 101, sma: 100, gap_pct: 1, period: 20, tolerance: 2, side: "both", quote_at: 1789480800, sma_through: "2026-09-14", currency: "USD", source: "Test fixture" } };
  await page.addInitScript(() => { localStorage.setItem("zb_token", "alert-fixture"); localStorage.setItem("seekcost:locale", "zh-CN"); });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path.endsWith("/watchlist/stocks")) return route.fulfill({ json: [{ id: 135, symbol: "NVDA", name: "英伟达" }, { id: 136, symbol: "AAPL", name: "苹果" }] });
    if (path.endsWith("/alerts/rules")) {
      if (method === "POST") {
        const row = { ...route.request().postDataJSON(), id: 11, symbol: "NVDA", stock_name: "英伟达", status: "pending", checked_at: null, last_triggered_at: null, evidence: null };
        rules.push(row); return route.fulfill({ status: 201, json: row });
      }
      return route.fulfill({ json: rules });
    }
    if (path.endsWith("/alerts/rules/11")) {
      if (method === "DELETE") { rules = []; return route.fulfill({ status: 204 }); }
      rules = [{ ...rules[0], ...route.request().postDataJSON() }]; return route.fulfill({ json: rules[0] });
    }
    if (path.endsWith("/read") || path.endsWith("/read-all")) { read = true; return route.fulfill({ json: { ok: true } }); }
    if (path.endsWith("/alerts/notifications")) return route.fulfill({ json: { items: url.searchParams.get("unread") === "true" && read ? [] : [{ ...note, read_at: read ? "2026-09-15T14:01:00Z" : null }], unread_count: read ? 0 : 1, next_cursor: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "从一条值得关注的规则开始" })).toBeVisible();
  await page.getByRole("button", { name: "创建第一条提醒" }).click();
  await page.getByLabel("提醒名称", { exact: true }).fill("回到中期均线附近");
  await page.getByLabel("提醒标的", { exact: true }).selectOption("135");
  await page.getByRole("button", { name: "60", exact: true }).click();
  await expect(page.getByTestId("alert-summary")).toContainText("60 日均线上下 2%");
  await page.screenshot({ path: info.outputPath("alert-editor.png") });
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  const card = page.getByTestId("alert-rule-card");
  await expect(card).toContainText("回到中期均线附近");
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await card.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("距均线百分比（%）", { exact: true }).fill("3");
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  await expect(card).toContainText("上下 3%");
  await page.screenshot({ path: info.outputPath("alert-rules.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByTestId("notification-bell").click();
  await expect(page.getByTestId("alert-notification")).toContainText("101.000");
  await page.screenshot({ path: info.outputPath("alert-inbox.png"), fullPage: true });
  await page.getByRole("button", { name: "标为已读", exact: true }).click();
  await expect(page.getByTestId("notification-bell")).toHaveAttribute("aria-label", "通知中心，0 条未读");
  await page.getByRole("button", { name: "未读 (0)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "暂无未读通知" })).toBeVisible();
  await page.getByRole("link", { name: "管理提醒规则", exact: true }).click();
  await card.locator("summary").click();
  await card.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("已产生的通知仍会保留");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "删除规则", exact: true }).click();
  await expect(card).toHaveCount(0);
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const logo = await page.locator(".navbar-brand").boundingBox();
    const language = await page.getByTestId("language-switcher").boundingBox();
    expect(logo!.x + logo!.width).toBeLessThanOrEqual(language!.x);
    await page.screenshot({ path: info.outputPath("alerts-320.png") });
  }
});

test("failed rule save preserves form input", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("zb_token", "alert-fixture"); localStorage.setItem("seekcost:locale", "zh-CN"); });
  await page.route("**/api/v1/**", route => {
    if (route.request().method() === "POST") return route.fulfill({ status: 503, json: { detail: "暂时无法保存，请重试" } });
    if (route.request().url().endsWith("/watchlist/stocks")) return route.fulfill({ json: [{ id: 1, symbol: "TEST", name: "Test" }] });
    if (route.request().url().endsWith("/alerts/rules")) return route.fulfill({ json: [] });
    return route.fulfill({ json: { items: [], unread_count: 0 } });
  });
  await page.goto("/alerts");
  await page.getByRole("button", { name: "创建第一条提醒" }).click();
  await page.getByLabel("提醒名称", { exact: true }).fill("不要丢失输入");
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "暂时无法保存" })).toBeVisible();
  await expect(page.getByLabel("提醒名称", { exact: true })).toHaveValue("不要丢失输入");
});

test("live demo alert pages load without creating rules", async ({ page }, info) => {
  test.skip(!process.env.SEEKCOST_E2E_USERNAME, "Requires local demo credentials");
  const login = await page.request.post("/api/v1/auth/login", { data: { username: process.env.SEEKCOST_E2E_USERNAME, password: process.env.SEEKCOST_E2E_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { access_token } = await login.json();
  await page.addInitScript(token => { localStorage.setItem("zb_token", token); localStorage.setItem("seekcost:locale", "zh-CN"); }, access_token);
  const rules = await page.request.get("/api/v1/alerts/rules", { headers: { Authorization: `Bearer ${access_token}` } });
  expect(rules.ok()).toBeTruthy();
  expect(Array.isArray(await rules.json())).toBeTruthy();
  await page.goto("/alerts");
  await page.getByRole("button", { name: "＋ 新建提醒", exact: true }).click();
  await expect(page.getByLabel("提醒标的", { exact: true })).not.toHaveValue("");
  await page.getByRole("button", { name: "全部自选股", exact: true }).click();
  await expect(page.getByTestId("alert-coverage")).toContainText("新增");
  await page.screenshot({ path: info.outputPath("live-alert-editor.png") });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByTestId("notification-bell").click();
  await expect(page.getByRole("heading", { name: "通知中心", exact: true })).toBeVisible();
  await expect(page.getByTestId("notification-bell")).not.toHaveAttribute("aria-label", /暂不可用/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath("live-inbox.png") });
});

for (const empty of [false, true]) {
  test(`all-watchlist scope works with ${empty ? "empty" : "populated"} watchlist`, async ({ page }, info) => {
    let rules: Record<string, unknown>[] = [];
    await page.addInitScript(() => { localStorage.setItem("zb_token", "alert-fixture"); localStorage.setItem("seekcost:locale", "zh-CN"); });
    await page.route("**/api/v1/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/watchlist/stocks")) return route.fulfill({ json: empty ? [] : [{ id: 1, symbol: "TEST", name: "Test" }, { id: 2, symbol: "SECOND", name: "Second" }] });
      if (path.endsWith("/alerts/rules")) {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          expect(body.scope).toBe("watchlist"); expect(body.stock_id).toBeNull();
          rules = [{ ...body, id: 1, target_count: empty ? 0 : 2, checked_count: 0, inside_count: 0, unavailable_count: 0, status: "pending" }];
          return route.fulfill({ status: 201, json: rules[0] });
        }
        return route.fulfill({ json: rules });
      }
      return route.fulfill({ json: { items: [], unread_count: 0 } });
    });
    await page.goto("/alerts");
    await page.getByRole("button", { name: "创建第一条提醒" }).click();
    await page.getByRole("button", { name: "全部自选股", exact: true }).click();
    await expect(page.getByLabel("提醒标的", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("alert-coverage")).toContainText(`当前覆盖 ${empty ? 0 : 2} 只标的`);
    if (!empty) {
      await page.getByRole("button", { name: "单只股票", exact: true }).click();
      await expect(page.getByLabel("提醒标的", { exact: true })).toHaveValue("1");
      await page.getByRole("button", { name: "全部自选股", exact: true }).click();
    }
    await page.getByLabel("提醒名称", { exact: true }).fill("全部股票均线提醒");
    await expect(page.getByTestId("alert-summary")).toContainText("全部自选股中任一标的");
    await page.screenshot({ path: info.outputPath("all-scope-editor.png"), fullPage: true });
    await page.getByRole("button", { name: "保存提醒", exact: true }).click();
    await expect(page.getByTestId("alert-rule-card")).toContainText("全部自选股");
    await expect(page.getByTestId("alert-scope-stats")).toContainText(`0/${empty ? 0 : 2}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath("all-scope-card.png"), fullPage: true });
  });
}
