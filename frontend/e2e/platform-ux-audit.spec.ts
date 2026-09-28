import { expect, test } from "@playwright/test";

const routes = ["/", "/portfolio", "/assets", "/dashboard", "/trade", "/finance", "/decision", "/watchlist", "/watchlist/135", "/quant", "/watchlist/earnings", "/research", "/research/topics", "/tools", "/profile", "/import/ibkr", "/about", "/guide"];

for (const width of [null, 320, 1280]) test(`platform read-only responsive audit${width ? ` ${width}px` : ""}`, async ({ page }, testInfo) => {
  test.setTimeout(180000);
  test.skip(width !== null && testInfo.project.name !== "desktop", "Extra viewport checks run once");
  if (width) await page.setViewportSize({ width, height: 900 });
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Local demo credentials required");
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("seekcost:locale", "zh-CN"));
  await page.reload();
  await page.screenshot({ path: testInfo.outputPath("login.png") });
  await page.goto("/register");
  await page.screenshot({ path: testInfo.outputPath("register.png") });
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.goto("/login");
  await page.locator("input").first().fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator('input[type="password"]').fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);
  const report = [];
  for (const path of routes) {
    await page.goto(path);
    await expect(page.locator("#main-content")).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const layout = await page.evaluate(() => {
      const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return {
        viewport: innerWidth, width: document.documentElement.scrollWidth,
        headings: Array.from(document.querySelectorAll("h1,h2")).map(e => e.textContent),
        smallControls: Array.from(document.querySelectorAll("main button, main select, nav a, nav button")).filter(visible).filter(e => e.getBoundingClientRect().height < 40).slice(0, 20).map(e => ({ text: (e.textContent || e.getAttribute("aria-label") || "").slice(0, 60), height: Math.round(e.getBoundingClientRect().height) })),
        overflow: Array.from(document.querySelectorAll("main section, main header, main input, main select")).slice(0, 500).filter(visible).filter(e => e.getBoundingClientRect().right > innerWidth + 2 && !e.closest('.overflow-x-auto')).slice(0, 10).map(e => ({ tag: e.tagName, text: e.textContent?.slice(0, 50) })),
      };
    });
    report.push({ path, ...layout });
    const slug = path === "/" ? "workbench" : path.slice(1).replaceAll("/", "-");
    await page.screenshot({ path: testInfo.outputPath(`${slug}.png`) });
    if (["/", "/profile", "/quant", "/watchlist/135", "/portfolio", "/guide", "/watchlist/earnings"].includes(path)) {
      await page.evaluate(() => window.scrollTo({ top: 650, behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath(`${slug}-scrolled.png`) });
    }
    expect.soft(layout.width, `${path} horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    await expect.soft(page.locator("body")).not.toContainText("Application error");
  }
  await testInfo.attach("audit.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  console.log(JSON.stringify({ project: testInfo.project.name, width, pages: report.length, issues: report.filter(r => r.width > r.viewport || r.smallControls.length > 0).map(r => ({ path: r.path, smallControls: r.smallControls, width: r.width })) }));
});
