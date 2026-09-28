import { expect, test } from "@playwright/test";

const token = process.env.SEEKCOST_E2E_TOKEN;

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

test("asset reviews stay beside transaction records and remain concise", async ({ page }) => {
  await page.route("**/api/v1/notes", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    const now = new Date().toISOString();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 99991, user_id: 1, title: "TEST trade review", content: String(payload.content),
        format: "markdown", visibility: "private", kind: "review", status: "active",
        confidence: null, next_review_at: null, starred: false, cover_image_url: null,
        cover_color: null, allow_comments: true, stock_symbols: payload.stock_symbols,
        knowledge_tags: [], tags: [], series: null, series_id: null, links: payload.links,
        comment_count: 0, created_at: now, updated_at: now,
      }),
    });
  });
  await page.goto("/assets/1");
  await page.getByRole("button", { name: "交易记录", exact: true }).click();

  await expect(page.getByRole("heading", { name: "个股交易复盘", exact: true })).toBeVisible();
  const outcome = page.getByRole("textbox", { name: /这次发生了什么/ });
  const deviation = page.getByRole("textbox", { name: /执行与原计划偏差在哪/ });
  const nextChange = page.getByRole("textbox", { name: /下一次只改哪一件事/ });
  const save = page.getByRole("button", { name: "保存复盘", exact: true });
  await expect(outcome).toBeVisible();
  await expect(deviation).toBeVisible();
  await expect(nextChange).toBeVisible();
  await expect(save).toBeDisabled();
  await outcome.fill("结果符合预期，但波动大于计划。");
  await deviation.fill("建仓节奏偏快，没有等待确认信号。");
  await nextChange.fill("下一次分两批建仓。");
  await expect(nextChange).toHaveAttribute("maxlength", "180");
  await expect(save).toBeEnabled();
  const savedRequestPromise = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/v1/notes"));
  await nextChange.press("Control+Enter");
  const savedPayload = (await savedRequestPromise).postDataJSON() as Record<string, unknown>;
  await expect(page.getByText("复盘已保存", { exact: true })).toBeVisible();
  expect(savedPayload).toMatchObject({ kind: "review", status: "active", format: "markdown" });
  expect(savedPayload?.links).toEqual([{ entity_type: "asset", entity_id: 1 }]);
  expect(String(savedPayload?.content)).toContain("## 这次发生了什么？");
  expect(String(savedPayload?.content)).toContain("## 执行与原计划偏差在哪？");

  const viewport = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(viewport.scroll).toBeLessThanOrEqual(viewport.client + 1);
});

test("decision records expose a portfolio review in the same workspace", async ({ page }) => {
  await page.route("**/api/v1/notes", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    const now = new Date().toISOString();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 99992, user_id: 1, title: "TEST investment review", content: String(payload.content),
        format: "markdown", visibility: "private", kind: "review", status: "active",
        confidence: null, next_review_at: null, starred: false, cover_image_url: null,
        cover_color: null, allow_comments: true, stock_symbols: [], knowledge_tags: [], tags: [],
        series: null, series_id: null, links: payload.links, comment_count: 0,
        created_at: now, updated_at: now,
      }),
    });
  });
  await page.goto("/decision");

  const action = page.getByRole("tab", { name: "投资复盘", exact: true });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.getByRole("heading", { name: "投资复盘", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/decision#investment-review$/);
  await page.getByRole("textbox", { name: /哪个判断是有效的/ }).fill("仓位纪律有效控制了回撤。");
  await page.getByRole("textbox", { name: /最大的偏差是什么/ }).fill("低估了组合相关性。");
  await page.getByRole("textbox", { name: /下一阶段保留哪条原则/ }).fill("先看组合风险，再看单笔机会。");
  const savedRequestPromise = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/v1/notes"));
  await page.getByRole("button", { name: "保存复盘", exact: true }).click();
  const savedPayload = (await savedRequestPromise).postDataJSON() as Record<string, unknown>;
  await expect(page.getByText("复盘已保存", { exact: true })).toBeVisible();
  expect(savedPayload.links).toEqual([]);
  expect(savedPayload.stock_symbols).toEqual([]);
});
