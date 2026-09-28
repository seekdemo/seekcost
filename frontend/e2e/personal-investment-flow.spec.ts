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

test("workbench exposes the personal decision loop", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "量化机会看板" })).toBeVisible();
  await expect(page.locator(".quant-cockpit-lanes-section")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "全部监控标的", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "盘中预警", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("发现");

  const cockpitLayout = await page.evaluate(() => {
    const boxes = (selector: string) => Array.from(document.querySelectorAll(selector)).map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      metrics: boxes(".quant-cockpit-metric"),
      lanes: boxes(".quant-cockpit-lane"),
      search: boxes(".quant-cockpit-search")[0],
      filters: boxes(".quant-cockpit-filters")[0],
      stockParts: boxes(".quant-cockpit-stock-row:first-child > *"),
    };
  });
  expect(cockpitLayout.pageWidth).toBeLessThanOrEqual(cockpitLayout.viewportWidth + 1);

  if (testInfo.project.name === "desktop") {
    expect(cockpitLayout.metrics).toHaveLength(0);
    expect(cockpitLayout.lanes).toHaveLength(0);
    await page.screenshot({ path: "/tmp/seekcost-workbench-desktop.png" });
  } else if (testInfo.project.name === "mobile") {
    expect(cockpitLayout.metrics).toHaveLength(0);
    expect(cockpitLayout.lanes).toHaveLength(0);
    expect(cockpitLayout.search?.y).toBeLessThan(cockpitLayout.filters?.y || 0);
    await page.screenshot({ path: "/tmp/seekcost-workbench-mobile.png" });
  }

  const entryFilter = page.locator(".quant-cockpit-filters").getByRole("button", { name: /入场候选/ });
  const entryCount = Number((await entryFilter.innerText()).match(/\d+/)?.[0]);
  await entryFilter.click();
  await expect(entryFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".quant-cockpit-stock-row")).toHaveCount(entryCount);
});

test("workbench polls an async intraday preview without hiding refreshed rows", async ({ page }) => {
  const previewItem = {
    stock_id: 303,
    symbol: "ASYNC",
    name: "Async Preview Corp",
    market: "us",
    current_price: 42,
    status: "watch",
    warning_code: "quiet",
    severity: "neutral",
    is_provisional: true,
    session: "regular",
    evidence: { current_price: 42 },
    error_code: null,
  };
  const preview = {
    generated_at: "2026-08-30T12:00:00+00:00",
    is_market_open: true,
    provider_errors: 0,
    requested_count: 1,
    total_count: 1,
    cached_at: "2026-08-30T12:00:00+00:00",
    refresh_started_at: "2026-08-30T12:00:00+00:00",
    refresh_error: null,
  };
  let calls = 0;
  const urls: string[] = [];

  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: { generated_at: "" } }));
  await page.route("**/api/v1/workbench/intraday-preview*", async (route) => {
    calls += 1;
    urls.push(route.request().url());
    await route.fulfill({
      json: calls === 1
        ? { ...preview, refreshing: true, items: [] }
        : calls === 2
          ? { ...preview, refreshing: true, items: [previewItem] }
          : { ...preview, refreshing: false, items: [previewItem] },
    });
  });
  await page.goto("/");

  const intradayPreview = page.getByLabel("盘中预警");
  await expect(intradayPreview.getByRole("button", { name: "刷新中…" })).toBeVisible();
  await expect(page.getByText(previewItem.symbol, { exact: true })).toBeVisible();
  await expect(intradayPreview.getByRole("button", { name: "刷新中…" })).toBeVisible();
  await expect.poll(() => calls).toBeGreaterThan(2);
  await intradayPreview.getByRole("button", { name: "刷新盘中预警" }).click();
  await expect.poll(() => urls.some((url) => url.endsWith("/intraday-preview?refresh=true"))).toBe(true);
});

test("workbench ignores a late polling response after its client deadline", async ({ page }) => {
  const previewItem = {
    stock_id: 304,
    symbol: "STALE",
    name: "Cached Preview Corp",
    market: "us",
    current_price: 42,
    status: "watch",
    warning_code: "quiet",
    severity: "neutral",
    is_provisional: true,
    session: "regular",
    evidence: { current_price: 42 },
    error_code: null,
  };
  const lateItem = { ...previewItem, symbol: "LATE" };
  const refreshStartedAt = "2026-08-30T12:00:00+00:00";
  const preview = {
    generated_at: refreshStartedAt,
    is_market_open: true,
    provider_errors: 0,
    requested_count: 1,
    total_count: 1,
    cached_at: refreshStartedAt,
    refresh_started_at: refreshStartedAt,
    refresh_error: null,
  };

  await page.addInitScript(({ first, late, manual, completed }) => {
    const nativeFetch = window.fetch.bind(window);
    let calls = 0;
    let now = Date.parse("2026-08-30T12:06:00+00:00");
    let resolveLate: (() => void) | undefined;
    Date.now = () => now;
    Object.assign(window, {
      __advanceIntradayClock: () => { now += 31_000; },
      __releaseLateIntradayResponse: () => resolveLate?.(),
      __intradayPollCalls: () => calls,
    });
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (!url.includes("/api/v1/workbench/intraday-preview")) return nativeFetch(input, init);
      calls += 1;
      if (calls === 1) return Promise.resolve(new Response(JSON.stringify(first), { headers: { "Content-Type": "application/json" } }));
      if (calls === 2) {
        return new Promise((resolve) => {
          resolveLate = () => resolve(new Response(JSON.stringify(late), { headers: { "Content-Type": "application/json" } }));
        });
      }
      if (calls === 3) return Promise.resolve(new Response(JSON.stringify(manual), { headers: { "Content-Type": "application/json" } }));
      return Promise.resolve(new Response(JSON.stringify(completed), { headers: { "Content-Type": "application/json" } }));
    };
  }, {
    first: { ...preview, refreshing: true, items: [previewItem] },
    late: { ...preview, refreshing: true, items: [lateItem] },
    manual: { ...preview, refreshing: true, items: [previewItem] },
    completed: { ...preview, refreshing: false, items: [{ ...previewItem, symbol: "FRESH" }] },
  });
  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: { generated_at: "" } }));
  await page.goto("/");

  const intradayPreview = page.getByLabel("盘中预警");
  await expect(intradayPreview.getByRole("button", { name: "刷新中…" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __intradayPollCalls: () => number }).__intradayPollCalls())).toBe(2);
  await page.evaluate(() => (window as typeof window & { __advanceIntradayClock: () => void }).__advanceIntradayClock());
  await page.evaluate(() => (window as typeof window & { __releaseLateIntradayResponse: () => void }).__releaseLateIntradayResponse());
  await expect(page.getByText(previewItem.symbol, { exact: true })).toBeVisible();
  await expect(page.getByText(lateItem.symbol, { exact: true })).toHaveCount(0);
  await expect(intradayPreview.getByRole("button", { name: "刷新盘中预警" })).toBeEnabled();
  await intradayPreview.getByRole("button", { name: "刷新盘中预警" }).click();
  await expect(intradayPreview.getByRole("button", { name: "刷新中…" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __intradayPollCalls: () => number }).__intradayPollCalls())).toBe(4);
  await expect(page.getByText("FRESH", { exact: true })).toBeVisible();
});

test("workbench aborts a never-resolving initial preview exactly at its deadline", async ({ page }) => {
  const lateItem = {
    stock_id: 305,
    symbol: "LATE_INITIAL",
    name: "Late Initial Corp",
    market: "us",
    current_price: 42,
    status: "watch",
    warning_code: "quiet",
    severity: "neutral",
    is_provisional: true,
    session: "regular",
    evidence: { current_price: 42 },
    error_code: null,
  };
  const recoveredItem = { ...lateItem, symbol: "INITIAL_RECOVERED" };
  const preview = {
    generated_at: "2026-08-30T12:00:00+00:00",
    is_market_open: true,
    provider_errors: 0,
    requested_count: 1,
    total_count: 1,
    cached_at: "2026-08-30T12:00:00+00:00",
    refresh_started_at: "2026-08-30T12:00:00+00:00",
    refresh_error: null,
    refreshing: false,
  };

  await page.addInitScript(({ late, recovered }) => {
    const nativeFetch = window.fetch.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window);
    let calls = 0;
    let initialAborted = false;
    let deadlineDelay = 0;
    let fireDeadline: (() => void) | undefined;
    let resolveInitial: (() => void) | undefined;
    window.setTimeout = ((...args: Parameters<typeof window.setTimeout>) => {
      const [handler, timeout, ...timerArgs] = args;
      if (timeout === 30_000 && typeof handler === "function") {
        deadlineDelay = timeout;
        fireDeadline = () => handler(...timerArgs);
        return 1;
      }
      return nativeSetTimeout(...args);
    }) as typeof window.setTimeout;
    Object.assign(window, {
      __initialIntradayAborted: () => initialAborted,
      __initialIntradayDeadlineMs: () => deadlineDelay,
      __fireInitialIntradayDeadline: () => fireDeadline?.(),
      __releaseLateInitialIntradayResponse: () => resolveInitial?.(),
      __initialIntradayCalls: () => calls,
    });
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (!url.includes("/api/v1/workbench/intraday-preview")) return nativeFetch(input, init);
      calls += 1;
      if (calls === 1) {
        init?.signal?.addEventListener("abort", () => { initialAborted = true; });
        return new Promise((resolve) => {
          resolveInitial = () => resolve(new Response(JSON.stringify(late), { headers: { "Content-Type": "application/json" } }));
        });
      }
      return Promise.resolve(new Response(JSON.stringify(recovered), { headers: { "Content-Type": "application/json" } }));
    };
  }, {
    late: { ...preview, items: [lateItem] },
    recovered: { ...preview, items: [recoveredItem] },
  });
  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: { generated_at: "" } }));
  await page.goto("/");

  const intradayPreview = page.getByLabel("盘中预警");
  await expect(intradayPreview.getByRole("button", { name: "刷新中…" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __initialIntradayDeadlineMs: () => number }).__initialIntradayDeadlineMs())).toBe(30_000);
  await page.evaluate(() => (window as typeof window & { __fireInitialIntradayDeadline: () => void }).__fireInitialIntradayDeadline());
  await expect(page.getByText("盘中预警请求超时，可再次尝试。", { exact: true })).toBeVisible();
  await expect(intradayPreview.getByRole("button", { name: "刷新盘中预警" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __initialIntradayAborted: () => boolean }).__initialIntradayAborted())).toBe(true);
  await page.evaluate(() => (window as typeof window & { __releaseLateInitialIntradayResponse: () => void }).__releaseLateInitialIntradayResponse());
  await expect(page.getByText(lateItem.symbol, { exact: true })).toHaveCount(0);

  await intradayPreview.getByRole("button", { name: "刷新盘中预警" }).click();
  await expect(page.getByText(recoveredItem.symbol, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __initialIntradayCalls: () => number }).__initialIntradayCalls())).toBe(2);
});

test("workbench recovers cached rows after a manual timeout, failed retry, and late response", async ({ page }) => {
  const cachedItem = {
    stock_id: 306,
    symbol: "CACHED_MANUAL",
    name: "Cached Manual Corp",
    market: "us",
    current_price: 42,
    status: "watch",
    warning_code: "quiet",
    severity: "neutral",
    is_provisional: true,
    session: "regular",
    evidence: { current_price: 42 },
    error_code: null,
  };
  const lateItem = { ...cachedItem, symbol: "LATE_MANUAL" };
  const recoveredItem = { ...cachedItem, symbol: "MANUAL_RECOVERED" };
  const preview = {
    generated_at: "2026-08-30T12:00:00+00:00",
    is_market_open: true,
    provider_errors: 0,
    requested_count: 1,
    total_count: 1,
    cached_at: "2026-08-30T12:00:00+00:00",
    refresh_started_at: "2026-08-30T12:00:00+00:00",
    refresh_error: null,
    refreshing: false,
  };

  await page.addInitScript(({ cached, late, recovered }) => {
    const nativeFetch = window.fetch.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window);
    let calls = 0;
    let manualAborted = false;
    let deadlineDelay = 0;
    let fireDeadline: (() => void) | undefined;
    let resolveManual: (() => void) | undefined;
    window.setTimeout = ((...args: Parameters<typeof window.setTimeout>) => {
      const [handler, timeout, ...timerArgs] = args;
      if (timeout === 30_000 && typeof handler === "function") {
        deadlineDelay = timeout;
        fireDeadline = () => handler(...timerArgs);
        return 1;
      }
      return nativeSetTimeout(...args);
    }) as typeof window.setTimeout;
    Object.assign(window, {
      __manualIntradayAborted: () => manualAborted,
      __manualIntradayDeadlineMs: () => deadlineDelay,
      __fireManualIntradayDeadline: () => fireDeadline?.(),
      __releaseLateManualIntradayResponse: () => resolveManual?.(),
      __manualIntradayCalls: () => calls,
    });
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (!url.includes("/api/v1/workbench/intraday-preview")) return nativeFetch(input, init);
      calls += 1;
      if (calls === 1) return Promise.resolve(new Response(JSON.stringify(cached), { headers: { "Content-Type": "application/json" } }));
      if (calls === 2) {
        init?.signal?.addEventListener("abort", () => { manualAborted = true; });
        return new Promise((resolve) => {
          resolveManual = () => resolve(new Response(JSON.stringify(late), { headers: { "Content-Type": "application/json" } }));
        });
      }
      if (calls === 3) return Promise.reject(new Error("manual retry failed"));
      return Promise.resolve(new Response(JSON.stringify(recovered), { headers: { "Content-Type": "application/json" } }));
    };
  }, {
    cached: { ...preview, items: [cachedItem] },
    late: { ...preview, items: [lateItem] },
    recovered: { ...preview, items: [recoveredItem] },
  });
  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: { generated_at: "" } }));
  await page.goto("/");

  const intradayPreview = page.getByLabel("盘中预警");
  await expect(page.getByText(cachedItem.symbol, { exact: true })).toBeVisible();
  await intradayPreview.getByRole("button", { name: "刷新盘中预警" }).click();
  await expect(intradayPreview.getByRole("button", { name: "刷新中…" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __manualIntradayDeadlineMs: () => number }).__manualIntradayDeadlineMs())).toBe(30_000);
  await page.evaluate(() => (window as typeof window & { __fireManualIntradayDeadline: () => void }).__fireManualIntradayDeadline());
  await expect(page.getByText(cachedItem.symbol, { exact: true })).toBeVisible();
  await expect(intradayPreview.getByRole("button", { name: "刷新盘中预警" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __manualIntradayAborted: () => boolean }).__manualIntradayAborted())).toBe(true);
  await page.evaluate(() => (window as typeof window & { __releaseLateManualIntradayResponse: () => void }).__releaseLateManualIntradayResponse());
  await expect(page.getByText(lateItem.symbol, { exact: true })).toHaveCount(0);

  await intradayPreview.getByRole("button", { name: "刷新盘中预警" }).click();
  await expect(page.getByText("manual retry failed", { exact: true })).toBeVisible();
  await expect(page.getByText(cachedItem.symbol, { exact: true })).toBeVisible();
  await expect(intradayPreview.getByRole("button", { name: "刷新盘中预警" })).toBeEnabled();

  await intradayPreview.getByRole("button", { name: "刷新盘中预警" }).click();
  await expect(page.getByText(recoveredItem.symbol, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __manualIntradayCalls: () => number }).__manualIntradayCalls())).toBe(4);
});

test("workbench uses refresh start time for cooldown and shows refresh errors", async ({ page }) => {
  const preview = {
    generated_at: "2026-08-30T11:50:00+00:00",
    is_market_open: false,
    provider_errors: 0,
    requested_count: 0,
    total_count: 0,
    cached_at: "2026-08-30T11:50:00+00:00",
    refresh_started_at: new Date().toISOString(),
    refresh_error: "Provider retry is still cooling down",
    refreshing: false,
    items: [],
  };
  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: { generated_at: "" } }));
  await page.route("**/api/v1/workbench/intraday-preview*", (route) => route.fulfill({ json: preview }));
  await page.goto("/");

  const intradayPreview = page.getByLabel("盘中预警");
  await expect(intradayPreview.getByText("最近一次刷新未完成：Provider retry is still cooling down。正在显示上一次可用预览。", { exact: true })).toBeVisible();
  await expect(intradayPreview.getByText("五分钟后可再次刷新", { exact: true })).toBeVisible();
  await expect(intradayPreview.getByRole("button", { name: "刷新盘中预警" })).toBeDisabled();
});

test("research library is private, structured and keeps both views", async ({ page }, testInfo) => {
  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "研究库" })).toBeVisible();
  await expect(page.getByText("你的研究默认且始终仅本人可见", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "卡片视图" })).toBeVisible();
  await expect(page.getByRole("button", { name: "文稿视图" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("公开内容");
  // Wait for the authenticated research request to finish before asserting the
  // rendered library or taking the visual snapshot. The header itself renders
  // with an initial zero count while the request is still in flight.
  await expect(page.getByRole("heading", { name: "观察仓", exact: true })).toBeVisible();
  await expect(page.getByText(/^13 项研究 ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "全部研究 13", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "待复核 0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "星标 1", exact: true })).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/tmp/seekcost-research-desktop.png", fullPage: true });
  }
});

test("research creation is a standalone private workflow", async ({ page }) => {
  await page.goto("/research/new");
  await expect(page).toHaveURL(/\/research\/new$/);
  await expect(page.getByRole("heading", { name: "新建研究" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存研究" })).toBeVisible();
  await expect(page.getByText("封面设置", { exact: true })).toBeVisible();
  await expect(page.getByText("下次复核", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "信心等级" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("公开可见");
  await expect(page.locator("body")).not.toContainText("空间内可见");
});

test("research detail has a stable private URL", async ({ page }) => {
  await page.goto("/research/14");
  await expect(page).toHaveURL(/\/research\/14$/);
  await expect(page.getByRole("button", { name: /随手记/ })).toBeVisible();
});

test("profile contains only local account settings", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "个人设置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "修改密码", exact: true })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
});

test("authentication uses username and password only", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录 SeekCost" })).toBeVisible();
  await expect(page.getByLabel("用户名")).toBeVisible();
  await expect(page.getByLabel("密码")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "注册 SeekCost" })).toBeVisible();
  await expect(page.getByLabel("用户名")).toBeVisible();
  await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
  await expect(page.getByLabel("确认密码")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
});

test("research topics are a dedicated private management surface", async ({ page }) => {
  await page.goto("/research/topics");
  await expect(page.getByRole("heading", { name: "研究专题" })).toBeVisible();
  await expect(page.getByText("将同一投资问题下的研究组织成连续脉络。", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("公开专题");
});

test("stock detail is a full page with the five research blocks", async ({ page }, testInfo) => {
  await page.goto("/watchlist/303");
  await expect(page).toHaveURL(/\/watchlist\/303$/);
  await expect(page.getByRole("heading", { name: "公司概览" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "行业与护城河" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "增长与财务质量" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "风险与证伪" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "估值与决策锚点" })).toBeVisible();
  await expect(page.getByRole("region", { name: "量价观察" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日 K 线" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "速记" })).toBeVisible();
  await expect(page.getByPlaceholder("记录一条观察、问题或提醒...")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Capture an observation");

  await page.getByRole("button", { name: "编辑公司概览" }).click();
  await expect(page.getByRole("textbox", { name: "当前判断" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加证据" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存模块" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.locator("body")).not.toContainText("博弈闪盘");
  if (testInfo.project.name === "mobile") {
    await page.screenshot({ path: "/tmp/seekcost-stock-mobile.png", fullPage: true });
  }
});

test("responsive navigation does not overflow and legacy notes links redirect", async ({ page }, testInfo) => {
  await page.goto("/notes?series=价值研究");
  await expect(page).toHaveURL(/\/research\?series=/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  const navigation = page.getByRole("navigation", {
    name: testInfo.project.name === "desktop" ? "主导航" : "移动端主导航",
  });
  await expect(navigation.getByRole("link", { name: "工作台", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "投资", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "决策", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "复盘", exact: true })).toBeVisible();
});
