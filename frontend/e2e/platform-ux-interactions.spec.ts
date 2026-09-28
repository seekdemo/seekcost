import { expect, test } from "@playwright/test";

test("navigation, preview disclosure and dialogs remain usable", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Requires local demo");
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("seekcost:locale", "zh-CN"));
  await page.reload();
  await page.locator("input").first().fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator('input[type="password"]').fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);
  expect(await page.locator(".skip-to-content").evaluate(el => getComputedStyle(el).position)).toBe("fixed");
  await expect(page.locator(".intraday-preview-item")).toHaveCount(2, { timeout: 15000 });
  const expand = page.getByRole("button", { name: /展开全部.*条预览/ });
  await expand.click();
  expect(await page.locator(".intraday-preview-item").count()).toBeGreaterThan(2);
  await page.getByRole("button", { name: "收起预览" }).click();
  await expect(page.locator(".intraday-preview-item")).toHaveCount(2);

  await page.goto("/watchlist/earnings");
  const selected = page.getByTestId("section-navigation").locator('[aria-current="page"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveText("财报日历");
  const selectedBox = await selected.boundingBox();
  expect(selectedBox!.x).toBeGreaterThanOrEqual(0);
  expect(selectedBox!.x + selectedBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (testInfo.project.name === "mobile") {
    const day = page.getByRole("button", { name: /查看.*的全部.*项财报/ }).first();
    await day.click();
    const dayDialog = page.getByRole("dialog");
    await expect(dayDialog).toBeVisible();
    await expect(dayDialog.getByRole("button").first()).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("earnings-day.png") });
    await page.keyboard.press("Escape");
    await expect(dayDialog).not.toBeVisible();
    await expect(day).toBeFocused();
  }
  const language = page.getByTestId("language-switcher");
  await language.focus();
  await language.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("listbox").getByRole("option", { selected: true }).press("Home");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(language).toBeFocused();

  await page.goto("/decision");
  const metrics = page.getByTestId("decision-metrics");
  await expect(metrics).toBeVisible();
  const positions = await metrics.locator(":scope > div").evaluateAll(nodes => nodes.map(n => Math.round(n.getBoundingClientRect().x)));
  expect(new Set(positions).size).toBe(testInfo.project.name === "desktop" ? 4 : 2);

  await page.goto("/trade");
  await expect(page.getByRole("heading", { name: "先建立投资，再记录交易" })).toBeVisible();
  await expect(page.getByRole("link", { name: "前往投资目录", exact: true })).toBeVisible();
  await page.goto("/research");
  await expect(page.getByRole("link", { name: "创建第一条研究" })).toBeVisible();

  await page.goto("/tools");
  const add = page.getByRole("button", { name: "添加工具", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const buttons = dialog.getByRole("button");
  await buttons.last().focus();
  await page.keyboard.press("Tab");
  await expect(buttons.first()).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("tool-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
  // A fresh context's local theme preference does not modify server-side data.
  await page.evaluate(() => localStorage.setItem("zb_theme", "light"));
  await page.reload();
  await page.screenshot({ path: testInfo.outputPath("tools-light.png") });
  if (testInfo.project.name !== "desktop") {
    expect(Math.round((await add.boundingBox())!.height)).toBeGreaterThanOrEqual(44);
  }
});
