import { expect, test } from "@playwright/test";

const token = process.env.SEEKCOST_E2E_TOKEN;

const authenticatedRoutes = [
  { path: "/", heading: "量化机会看板" },
  { path: "/watchlist", heading: "个人股票池" },
  { path: "/research", heading: "研究库" },
  { path: "/tools", heading: "为投资工作收集好工具" },
  { path: "/assets", heading: "全部投资" },
  { path: "/dashboard", heading: "资产总览" },
  { path: "/trade", heading: "记录交易" },
  { path: "/finance", heading: "个人财务" },
  { path: "/profile", heading: "个人设置" },
  { path: "/import/ibkr", heading: "导入 IBKR 活动报表" },
] as const;

test.beforeAll(() => {
  if (!token) throw new Error("SEEKCOST_E2E_TOKEN is required");
});

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate((accessToken) => {
    window.localStorage.setItem("zb_token", accessToken);
    window.localStorage.setItem("seekcost:locale", "zh-CN");
  }, token as string);
});

for (const route of authenticatedRoutes) {
  test(`${route.path} keeps its primary surface inside the viewport`, async ({ page }, testInfo) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true }).first()).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      main: document.querySelector("main")?.getBoundingClientRect().width || 0,
    }));
    expect(layout.page).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.main).toBeLessThanOrEqual(layout.viewport + 1);

    if (testInfo.project.name === "mobile") {
      const nav = page.getByRole("navigation", { name: "移动端主导航" });
      await expect(nav).toBeVisible();
      const navBox = await nav.boundingBox();
      expect(navBox?.width || 0).toBeLessThanOrEqual(layout.viewport + 1);

      const touchButtons = await page.locator("main button:visible").evaluateAll((buttons) =>
        buttons.slice(0, 40).map((button) => button.getBoundingClientRect().height),
      );
      expect(touchButtons.every((height) => height >= 40)).toBe(true);
    }

    const visualDirectory = process.env.SEEKCOST_VISUAL_DIR;
    if (visualDirectory) {
      const slug = route.path === "/" ? "workbench" : route.path.slice(1).replaceAll("/", "-");
      await page.screenshot({ path: `${visualDirectory}/${slug}-${testInfo.project.name}.png`, fullPage: true });
    }
  });
}

test("mobile product navigation switches between decision areas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "移动端主导航" });
  const portfolio = navigation.getByRole("link", { name: "投资", exact: true });
  const decision = navigation.getByRole("link", { name: "决策", exact: true });

  await expect(navigation.getByRole("link")).toHaveCount(4);
  await portfolio.click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(portfolio).toHaveClass(/text-accent/);

  await decision.click();
  await expect(page).toHaveURL(/\/decision$/);
  await expect(decision).toHaveClass(/text-accent/);
});

test("standalone review route is absent", async ({ page }) => {
  const response = await page.goto("/review");
  expect(response?.status()).toBe(404);
});

test("standalone cash route is absent and investment creation stays in the catalog", async ({ page }) => {
  const response = await page.goto("/cash");
  expect(response?.status()).toBe(404);

  await page.goto("/assets?create=1");
  await expect(page.locator("#new-investment")).toBeVisible();
});

test("investment overview exposes compact controls and responsive priority", async ({ page }) => {
  await page.goto("/portfolio");

  await expect(page.getByTestId("investment-overview-grid")).toBeVisible();
  await expect(page.getByTestId("portfolio-currency-switcher")).toBeVisible();
  await expect(page.getByTestId("portfolio-zero-toggle")).toBeVisible();
  await expect(page.getByTestId("market-investments-panel")).toBeVisible();
  await expect(page.getByTestId("supporting-investments-column")).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(layout.page).toBeLessThanOrEqual(layout.viewport + 1);
});

test("research cards stay equal and the detail page remains immersive", async ({ page }, testInfo) => {
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "研究库", exact: true })).toBeVisible();
  await expect(page.getByText(/^[1-9]\d* 项研究 ·/)).toBeVisible();
  await expect(page.locator(".research-card").first()).toBeVisible();

  const cardHeights = await page.locator(".research-card").evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().height)),
  );
  expect(cardHeights.length).toBeGreaterThan(1);
  expect(Math.max(...cardHeights) - Math.min(...cardHeights)).toBeLessThanOrEqual(1);

  await page.locator(".research-card").first().getByRole("button", { name: /^查看:/ }).click();
  await expect(page).toHaveURL(/\/research\/\d+$/);
  await expect(page.getByRole("button", { name: /随手记/ })).toBeVisible();
  const detailLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    sheet: document.querySelector(".research-detail__reading-sheet")?.getBoundingClientRect().width || 0,
  }));
  expect(detailLayout.page).toBeLessThanOrEqual(detailLayout.viewport + 1);
  expect(detailLayout.sheet).toBeLessThanOrEqual(detailLayout.viewport + 1);

  const visualDirectory = process.env.SEEKCOST_VISUAL_DIR;
  if (visualDirectory) {
    await page.screenshot({ path: `${visualDirectory}/research-detail-${testInfo.project.name}.png`, fullPage: true });
  }
});
