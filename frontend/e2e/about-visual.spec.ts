import {test, expect} from "@playwright/test";

test("editorial About renders actual Chinese content across viewports", async ({page},info) => {
  await page.addInitScript(() => {localStorage.setItem("seekcost:locale","zh-CN"); localStorage.setItem("zb_theme","emerald");});
  await page.goto("/about");
  await expect(page.getByTestId("about-story")).toBeVisible();
  await expect(page.getByRole("heading",{level:1})).toHaveText("让每一次投资判断，都有依据可循");
  await expect(page.locator(".about-values__grid article")).toHaveCount(4);
  await expect(page.locator(".about-compass li")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:info.outputPath("about-hero.png")});
  await page.locator(".about-values").scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath("about-values.png")});
  await page.locator(".about-roadmap").scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath("about-roadmap.png")});
  await page.evaluate(() => window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:info.outputPath("about-full.png"),fullPage:true});
});

test("editorial About respects light theme", async ({page},info) => {
  await page.addInitScript(() => {localStorage.setItem("seekcost:locale","en");localStorage.setItem("zb_theme","light");});
  await page.goto("/about");
  await expect(page.getByTestId("about-story")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:info.outputPath("about-light.png")});
});
