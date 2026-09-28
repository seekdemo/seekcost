import { test, expect } from "@playwright/test";

const content = {title:"让每一次投资判断，都有依据可循",intro:"这是一个个人决策工作台，不替用户做决定。",mission:"我为什么开发 SeekCost\n\n记住关注理由、等待条件和失效条件。",values:"减少无关信息\n\n保存自己的投资判断。",roadmap:"这是未来方向，不代表已经上线。\n\n先建立数据可信度，再连接提醒与复盘。"};

test("public About shows published copy safely", async ({page}, info) => {
  await page.addInitScript(() => localStorage.setItem("seekcost:locale","zh-CN"));
  await page.route("**/api/v1/content/about?*", route => route.fulfill({json:{content:{...content, mission:content.mission+'\n\n<script>window.injected=true</script>'},published_at:null}}));
  await page.goto("/about");
  await expect(page.getByRole("heading",{level:1})).toHaveText(content.title);
  await expect(page.getByText("<script>window.injected=true</script>",{exact:true})).toBeVisible();
  expect(await page.evaluate(() => 'injected' in window)).toBeFalsy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:info.outputPath("about-story.png"),fullPage:true});
});

test("ordinary accounts cannot open the content editor", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("zb_token","ordinary-test"));
  await page.route("**/api/v1/admin/me", route => route.fulfill({status:403,json:{detail:"此账户没有管理员权限"}}));
  await page.route("**/api/v1/alerts/notifications?*", route => route.fulfill({json:{items:[],unread_count:0}}));
  await page.goto("/admin");
  await expect(page.getByRole("alert").filter({hasText:"没有管理员权限"})).toBeVisible();
  await expect(page.getByRole("button",{name:"保存草稿",exact:true})).toHaveCount(0);
});

test("admin saves draft before confirmed publication and preserves failures", async ({page},info) => {
  let saved = {...content}; let published = {...content}; let version = 0; let fail = true;
  await page.addInitScript(() => {localStorage.setItem("zb_token","admin-test");localStorage.setItem("seekcost:locale","zh-CN");});
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin/me")) return route.fulfill({json:{username:"test-editor",role:"content_admin"}});
    if (path.endsWith("/content/audit")) return route.fulfill({json:[]});
    if (path.endsWith("/content/about/publish")) {
      expect(route.request().postDataJSON().version).toBe(1);
      published = {...saved};version++;
      return route.fulfill({json:{draft:saved,published,version,published_at:"2026-09-19T01:00:00Z"}});
    }
    if (path.endsWith("/content/about")) {
      if (route.request().method() === "PUT") {
        if (fail) {fail=false;return route.fulfill({status:503,json:{detail:"保存暂不可用"}});}
        saved = route.request().postDataJSON().content;version++;
      }
      return route.fulfill({json:{draft:saved,published,version,published_at:null}});
    }
    return route.fulfill({json:{items:[],unread_count:0}});
  });
  await page.goto("/admin");
  const title = page.getByLabel("页面标题",{exact:false});
  await title.fill("我的开发初衷与未来计划");
  await expect(page.getByRole("button",{name:"发布内容",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"保存草稿",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"保存暂不可用"})).toBeVisible();
  await expect(title).toHaveValue("我的开发初衷与未来计划");
  await page.getByRole("button",{name:"保存草稿",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
  expect(published.title).toBe(content.title);
  await page.getByRole("button",{name:"页面预览",exact:true}).click();
  await expect(page.getByTestId("about-story")).toContainText("我的开发初衷与未来计划");
  await page.evaluate(() => window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:info.outputPath("admin-preview.png"),fullPage:true});
  await page.getByRole("button",{name:"发布内容",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button",{name:"取消",exact:true}).click();
  expect(published.title).toBe(content.title);
  await page.getByRole("button",{name:"发布内容",exact:true}).click();
  await page.getByRole("button",{name:"确认发布",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("发布成功");
  expect(published.title).toBe("我的开发初衷与未来计划");
  await page.getByRole("button",{name:"编辑内容",exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.evaluate(() => window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:info.outputPath("admin-editor.png"),fullPage:true});
});
