import { expect, test } from "@playwright/test";

test("opening an asset from a scrolled list starts its detail at the top and Back restores the list", async ({ page }) => {
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Requires local demo data");

  await page.goto("/login");
  await page.locator("#username").fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator("#password").fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);

  await page.goto("/assets");
  const assetLinks = page.locator('a[href^="/assets/"]');
  await expect(assetLinks.first()).toBeVisible();
  const count = await assetLinks.count();
  test.skip(count < 2, "Needs multiple assets to test a scrolled list");

  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
  const listScrollY = await page.evaluate(() => window.scrollY);
  test.skip(listScrollY < 200, "Asset list is too short to test scroll restoration");

  const visibleIndex = await assetLinks.evaluateAll((links) => links.findIndex((link) => {
    const rect = link.getBoundingClientRect();
    return rect.top >= 150 && rect.top < innerHeight - 100;
  }));
  test.skip(visibleIndex < 0, "No asset link is visible at this scroll position");
  const visibleLink = assetLinks.nth(visibleIndex);
  const destination = await visibleLink.getAttribute("href");
  await visibleLink.click();
  await expect(page).toHaveURL(new RegExp(`${destination!.replaceAll("/", "\\/")}$`));
  await expect(page.locator("main .page-shell--wide")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);

  await page.goBack();
  await expect(page).toHaveURL(/\/assets\/?$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(listScrollY - 100);
});

test("opening a research editor from a scrolled decision list starts at the top", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Representative cross-section check");
  test.skip(!process.env.SEEKCOST_E2E_USERNAME || !process.env.SEEKCOST_E2E_PASSWORD, "Requires local demo data");

  await page.goto("/login");
  await page.locator("#username").fill(process.env.SEEKCOST_E2E_USERNAME!);
  await page.locator("#password").fill(process.env.SEEKCOST_E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/login/);

  await page.goto("/decision");
  const researchLinks = page.locator('a[href^="/research/new?transaction="]');
  await expect(researchLinks.first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 1000, behavior: "instant" }));
  test.skip((await page.evaluate(() => window.scrollY)) < 200, "Decision list is too short to test scrolling");

  await researchLinks.last().click();
  await expect(page).toHaveURL(/\/research\/new\?transaction=/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(4);
});
