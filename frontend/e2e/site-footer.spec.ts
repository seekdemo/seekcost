import {test, expect} from "@playwright/test";

for (const admin of [false,true]) {
  test(`footer exposes public links and respects admin permission (${admin})`, async ({page},info) => {
    await page.addInitScript(() => {localStorage.setItem("seekcost:locale","zh-CN");localStorage.setItem("zb_token","footer-test");});
    await page.route("**/api/v1/admin/me", route => route.fulfill({status:admin ? 200 : 403,json:admin ? {username:"test-admin",role:"content_admin"} : {detail:"Forbidden"}}));
    await page.route("**/api/v1/alerts/notifications?*", route => route.fulfill({json:{items:[],unread_count:0}}));
    await page.goto("/about");
    const footer = page.getByTestId("site-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByRole("link",{name:"关于平台",exact:true})).toHaveAttribute("href","/about");
    await expect(footer.getByRole("link",{name:"使用指南",exact:true})).toHaveAttribute("href","/guide");
    await expect(footer.getByRole("link",{name:"管理后台",exact:true})).toHaveCount(admin ? 1 : 0);
    const links = await footer.locator("a").evaluateAll(nodes => nodes.map(node => {const rect=node.getBoundingClientRect();return {height:rect.height,bottom:rect.bottom};}));
    expect(links.every(link => link.height >= 44)).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    if (info.project.name !== "desktop") {
      const mobileNav=await page.locator(".mobile-primary-navigation").boundingBox();
      expect(Math.max(...links.map(link=>link.bottom))).toBeLessThanOrEqual(mobileNav!.y);
    }
    await page.screenshot({path:info.outputPath("footer.png")});
    await footer.getByRole("link",{name:"使用指南",exact:true}).click();
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.getByTestId("site-footer").getByRole("link",{name:"使用指南",exact:true})).toHaveAttribute("aria-current","page");
  });
}
