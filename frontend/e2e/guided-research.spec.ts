import { test, expect, type Page } from "@playwright/test";
import type { GuideDraft } from "../src/lib/researchGuide";

async function fixture(page: Page) {
  let draft: GuideDraft = {
    stock_id: 1,
    version: 0,
    step: 0,
    mode: "guided",
    answers: {},
    published_version: null,
    note_id: null,
    updated_at: null,
  };
  let fail = false;
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "guide-fixture");
    localStorage.setItem("seekcost:locale", "zh-CN");
    localStorage.setItem("zb_theme", "emerald");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const stock = {
      id: 1,
      symbol: "EXAMPLE",
      name: "示例公司",
      sector: "软件",
      stage: "radar",
    };
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          id: 1,
          username: "fixture",
          nickname: "Research",
          theme: "emerald",
        },
      });
    if (path.includes("/admin/"))
      return route.fulfill({ status: 403, json: { detail: "not admin" } });
    if (path.endsWith("/alerts/notifications"))
      return route.fulfill({ json: { items: [], unread_count: 0 } });
    if (path.endsWith("/watchlist/stocks"))
      return route.fulfill({ json: [stock] });
    if (path.endsWith("/research-profile"))
      return route.fulfill({
        json: { stock, stock_id: 1, research_sections: [] },
      });
    if (path.endsWith("/research-guides"))
      return route.fulfill({ json: draft.version ? [draft] : [] });
    if (path.endsWith("/research-guides/1/publish")) {
      draft = { ...draft, published_version: draft.version, note_id: 99 };
      return route.fulfill({ json: draft });
    }
    if (path.endsWith("/research-guides/1")) {
      if (route.request().method() === "PUT") {
        if (fail)
          return route.fulfill({
            status: 409,
            json: { detail: "研究已在另一窗口更新；当前文字仍保留" },
          });
        const body = route.request().postDataJSON();
        draft = { ...draft, ...body, version: draft.version + 1 };
      }
      return route.fulfill({ json: draft });
    }
    return route.fulfill({ json: [] });
  });
  return {
    fail: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
  };
}

test("writing comes first without competing mobile navigation", async ({
  page,
}, info) => {
  await fixture(page);
  await page.goto("/research/guide/1");
  const answer = page.getByLabel("我的理解", { exact: true });
  await expect(answer).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if (info.project.name === "mobile") {
    expect((await answer.boundingBox())!.y).toBeLessThan(450);
    await expect(page.getByTestId("section-navigation")).toBeHidden();
    await expect(page.locator(".mobile-primary-navigation")).toHaveCount(0);
  }
  await expect(
    page.getByLabel("反面理由 / 还需要核实什么？", { exact: true }),
  ).toBeHidden();
  await page.getByRole("link", { name: "← 公司研究", exact: true }).click();
  if (info.project.name !== "desktop")
    await expect(page.locator(".mobile-primary-navigation")).toBeVisible();
});

test("narrow light layout and mobile picker preserve the current answer", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/research/guide/1");
  await page
    .getByLabel("我的理解", { exact: true })
    .fill("需要核实核心业务收入。");
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "light"),
  );
  await page.getByRole("combobox", { name: "研究问题" }).selectOption("3");
  await expect(
    page.getByRole("heading", {
      name: "什么证据可能说明，你现在的理解不成立？",
    }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "研究问题" }).selectOption("0");
  await expect(page.getByLabel("我的理解", { exact: true })).toHaveValue(
    "需要核实核心业务收入。",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("two modes share answers, resume and confirm a private card", async ({
  page,
}, info) => {
  await fixture(page);
  await page.goto("/research/guide");
  await page.getByRole("link", { name: /EXAMPLE/ }).click();
  await expect(
    page
      .getByRole("heading", { name: "这家公司主要靠什么赚钱？", exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "研究提示" }).click();
  await expect(page.getByText(/先不看股价。把公司想成一家店/)).toBeVisible();
  await page
    .getByLabel("我的理解", { exact: true })
    .fill("通过订阅服务向企业客户收费；仍需核实收入构成。");
  await page.getByLabel("当前状态").selectOption("unknown");
  await page.locator("summary").filter({ hasText: "疑问与反证" }).click();
  await page
    .getByLabel("反面理由 / 还需要核实什么？", { exact: true })
    .fill("还不知道客户续费率。");
  await page.getByRole("button", { name: "自主研究", exact: true }).click();
  await expect(page.getByLabel("我的理解", { exact: true })).toHaveCount(6);
  await expect(
    page.getByLabel("我的理解", { exact: true }).first(),
  ).toHaveValue(/订阅服务/);
  await page.locator("summary").filter({ hasText: "经营质量" }).click();
  await page
    .getByLabel("我的理解", { exact: true })
    .nth(2)
    .fill("需要比较连续两年的经营现金流。");
  await page.getByRole("button", { name: "保存进度", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已保存到账号" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "自主研究", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("我的理解", { exact: true }).nth(2)).toHaveValue(
    "需要比较连续两年的经营现金流。",
  );
  await page.screenshot({ path: info.outputPath("independent-room.png") });
  await page.getByRole("button", { name: "引导研究", exact: true }).click();
  await page.getByRole("button", { name: "保存进度", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已保存到账号" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("我的理解", { exact: true })).toHaveValue(
    /订阅服务/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  if (info.project.name !== "desktop")
    expect(
      await page
        .getByRole("combobox", { name: "研究问题" })
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThan(100);
  await page.screenshot({
    path: info.outputPath("guide-room.png"),
    fullPage: true,
  });
  if (info.project.name === "desktop")
    await page
      .getByRole("button", { name: "我的判断卡 ↗", exact: true })
      .click();
  else await page.getByRole("combobox", { name: "研究问题" }).selectOption("6");
  const publish = page.getByRole("button", {
    name: "确认并保存私有判断卡",
    exact: true,
  });
  await expect(publish).toBeDisabled();
  await expect(page.getByText("尚未研究 / 暂不确定").first()).toBeVisible();
  await page.getByRole("checkbox").check();
  await publish.click();
  await expect(
    page.getByRole("link", { name: "查看已保存的判断卡 →" }),
  ).toBeVisible();
  await expect(publish).toHaveCount(0);
});

test("conflicts retain edits and unsafe sources cannot save", async ({
  page,
}) => {
  const mock = await fixture(page);
  await page.goto("/research/guide/1");
  await page
    .getByLabel("我的理解", { exact: true })
    .fill("这是需要保留的研究。");
  mock.fail();
  await page.getByRole("button", { name: "保存并继续 →", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "另一窗口" }),
  ).toBeVisible();
  await expect(page.getByLabel("我的理解", { exact: true })).toHaveValue(
    "这是需要保留的研究。",
  );
  mock.recover();
  await page.getByText("证据与资料 · 0 条已记录", { exact: true }).click();
  await page.getByRole("button", { name: "＋ 添加证据" }).click();
  await page.getByLabel("来源名称（必填）").fill("年报");
  await page
    .getByLabel("来源链接", { exact: true })
    .fill("javascript:alert(1)");
  await expect(page.getByRole("link", { name: "打开来源 ↗" })).toHaveCount(0);
  await page.getByRole("button", { name: "保存进度", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTP(S)" }),
  ).toBeVisible();
  await page
    .getByLabel("来源链接", { exact: true })
    .fill("https://example.com/report");
  await page.getByRole("button", { name: "保存进度", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已保存到账号" }),
  ).toBeVisible();
});
