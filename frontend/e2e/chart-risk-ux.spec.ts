import { expect, test } from "@playwright/test";

test("daily chart remains readable and risk checks stay stable across ranges", async ({ page }, testInfo) => {
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Requires a seeded local account and watchlist item");
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("seekcost:locale", "zh-CN"));
  await page.reload();
  await page.locator('input').first().fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator('input[type="password"]').fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto(`/watchlist/${process.env.SEEKCOST_E2E_STOCK_ID || "135"}`);
  const chart = page.getByTestId("kline-svg");
  await expect(chart).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("ma-line-20")).toBeAttached();
  await expect(page.getByTestId("ma-line-250")).toHaveCount(0);
  await chart.focus();
  await chart.press("Home");
  await expect(chart).toHaveAttribute("data-active-index", "0");
  await chart.press("ArrowRight");
  await expect(chart).toHaveAttribute("data-active-index", "1");
  await chart.press("End");
  const risk = page.locator('section[aria-labelledby="risk-title"]');
  await expect(risk).toBeVisible();
  const original = (await risk.textContent())!;
  // Range names are localized; the first button in the chart range group is 1mo.
  await page.locator('section[aria-labelledby="daily-k-title"] button[aria-pressed]').first().click();
  await expect(chart).toBeVisible();
  await expect(risk).toHaveText(original);
  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="kline-svg"]')!;
    return { viewport: innerWidth, page: document.documentElement.scrollWidth, width: svg.getBoundingClientRect().width, viewBox: svg.getAttribute("viewBox"), touch: getComputedStyle(svg).touchAction };
  });
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(Number(geometry.viewBox!.split(" ")[2])).toBeCloseTo(geometry.width, 0);
  expect(geometry.touch).toBe("pan-y");
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("chart.png") });
  await risk.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("risk.png") });
});
