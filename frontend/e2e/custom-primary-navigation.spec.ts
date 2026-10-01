import { expect, test } from "@playwright/test";

const initialUser = {
  id: 801, username: "navtest", nickname: "Navigation tester", theme: "light",
  default_currency: "CNY", nav_items: null as string[] | null,
  avatar_url: null, created_at: "2026-09-01T00:00:00Z",
};

test.beforeEach(async ({ page }) => {
  let user = { ...initialUser };
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "navigation-test-token");
    localStorage.setItem("seekcost:locale", "zh-CN");
  });
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/auth/profile", async (route) => {
    const body = route.request().postDataJSON() as { nav_items?: string[] };
    if (body.nav_items) user = { ...user, nav_items: body.nav_items };
    await route.fulfill({ json: user });
  });
  await page.route("**/api/v1/alerts/notifications*", (route) => route.fulfill({ json: { items: [], unread_count: 0 } }));
});

test("each first-level menu can be hidden, reordered and restored", async ({ page }, testInfo) => {
  await page.goto("/profile");
  const menu = page.getByRole("region", { name: "一级菜单" });
  await expect(menu).toBeVisible();
  await menu.getByRole("switch", { name: "在一级菜单显示持仓成本" }).click();
  await menu.getByRole("button", { name: "上移决策" }).click();
  await menu.getByRole("button", { name: "保存菜单" }).click();
  await expect(menu.getByRole("status")).toHaveText("菜单已保存");
  await menu.screenshot({ path: testInfo.outputPath("menu-settings.png") });

  const nav = page.getByRole("navigation", { name: testInfo.project.name === "mobile" ? "移动端主导航" : "主导航" });
  await expect(nav.getByRole("link", { name: "持仓成本", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "决策", exact: true })).toBeVisible();
  const links = await nav.getByRole("link").allTextContents();
  expect(links.findIndex((label) => label.includes("决策"))).toBeLessThan(links.findIndex((label) => label.includes("工作台")));

  await page.reload();
  await expect(menu.getByRole("switch", { name: "在一级菜单显示持仓成本" })).toHaveAttribute("aria-checked", "false");
  await menu.getByRole("button", { name: "恢复默认" }).click();
  await menu.getByRole("button", { name: "保存菜单" }).click();
  await expect(nav.getByRole("link", { name: "持仓成本", exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(width.page).toBeLessThanOrEqual(width.viewport + 1);
});

test("last visible menu cannot be hidden", async ({ page }, testInfo) => {
  await page.goto("/profile");
  const menu = page.getByRole("region", { name: "一级菜单" });
  for (const name of ["持仓成本", "决策", "工具导航"]) {
    await menu.getByRole("switch", { name: `在一级菜单显示${name}` }).click();
  }
  await menu.getByRole("switch", { name: "在一级菜单显示工作台" }).click();
  await expect(menu.getByRole("status")).toHaveText("至少保留一个可见菜单。");
  await expect(menu.getByRole("switch", { name: "在一级菜单显示工作台" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("button", { name: "保存菜单" }).click();
  const nav = page.getByRole("navigation", { name: testInfo.project.name === "mobile" ? "移动端主导航" : "主导航" });
  await expect(nav.getByRole("link", { name: "工作台", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "持仓成本", exact: true })).toHaveCount(0);
});

test("a failed save keeps the visible navigation unchanged", async ({ page }, testInfo) => {
  await page.route("**/api/v1/auth/profile", (route) => route.fulfill({ status: 503, json: { detail: "暂时无法保存" } }));
  await page.goto("/profile");
  const menu = page.getByRole("region", { name: "一级菜单" });
  await menu.getByRole("switch", { name: "在一级菜单显示持仓成本" }).click();
  await menu.getByRole("button", { name: "保存菜单" }).click();
  await expect(menu.getByRole("status")).toHaveText("暂时无法保存");
  const nav = page.getByRole("navigation", { name: testInfo.project.name === "mobile" ? "移动端主导航" : "主导航" });
  await expect(nav.getByRole("link", { name: "持仓成本", exact: true })).toBeVisible();
});

test("legacy page-level preferences do not unexpectedly hide today's menus", async ({ page }, testInfo) => {
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: { ...initialUser, nav_items: ["/assets", "/watchlist"] } }));
  await page.goto("/profile");
  const nav = page.getByRole("navigation", { name: testInfo.project.name === "mobile" ? "移动端主导航" : "主导航" });
  for (const name of ["工作台", "持仓成本", "决策", "工具导航"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
});
