import { expect, test, type Page } from "@playwright/test";

const destinations = ["/alerts", "/quant", "/watchlist/earnings", "/notifications"] as const;
const pageErrors = new WeakMap<Page, string[]>();

test.use({ contextOptions: { reducedMotion: "reduce" } });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "reminder-fixture");
    localStorage.setItem("zb_user", JSON.stringify({ id: 1, username: "fixture" }));
    if (!localStorage.getItem("seekcost:locale")) localStorage.setItem("seekcost:locale", "zh-CN");
    localStorage.setItem("zb_theme", "light");
  });
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { id: 1, username: "fixture" } });
    if (path.endsWith("/alerts/notifications")) return route.fulfill({ json: { items: [], unread_count: 0, next_cursor: null } });
    return route.fulfill({ json: [] });
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function expectSelection(page: Page, path: string) {
  const nav = page.getByTestId("reminder-navigation");
  await expect(nav).toHaveCount(1);
  await expect(nav).toBeVisible();
  await expect(nav.locator("a")).toHaveCount(4);
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("href", path);
  const parent = page.getByTestId("section-navigation").locator('a[aria-current="page"]');
  await expect(parent).toHaveCount(1);
  await expect(parent).toHaveAttribute("href", "/alerts");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const origin of destinations) {
  test(`every sibling stays switchable from ${origin}`, async ({ page }) => {
    await page.goto(origin);
    await expectSelection(page, origin);
    const nav = page.getByTestId("reminder-navigation");
    const start = await nav.boundingBox();
    await nav.locator(`a[href="${origin}"]`).click();
    await expectSelection(page, origin);
    for (const path of destinations.filter(path => path !== origin)) {
      await nav.locator(`a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expectSelection(page, path);
      const box = await nav.boundingBox();
      expect(box!.x).toBeCloseTo(start!.x, 0);
      expect(box!.y).toBeCloseTo(start!.y, 0);
      expect(box!.width).toBeCloseTo(start!.width, 0);
      await nav.locator(`a[href="${origin}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${origin}$`));
      await expectSelection(page, origin);
    }
  });
}

test("direct entries and browser history derive the selected child from the URL", async ({ page }) => {
  for (const path of [...destinations, "/quant?strategy=price-anchor-observation"]) {
    await page.goto(path);
    await expectSelection(page, path.split("?")[0]);
  }
  const nav = page.getByTestId("reminder-navigation");
  await nav.locator('a[href="/watchlist/earnings"]').click();
  await expectSelection(page, "/watchlist/earnings");
  await nav.locator('a[href="/notifications"]').click();
  await expectSelection(page, "/notifications");
  await page.goBack();
  await expectSelection(page, "/watchlist/earnings");
  await page.goBack();
  await expect(page).toHaveURL(/\/quant\?strategy=price-anchor-observation$/);
  await expectSelection(page, "/quant");
  await page.goForward();
  await expectSelection(page, "/watchlist/earnings");
});

test("keyboard Tab and Enter switch to a sibling with visible focus", async ({ page }) => {
  await page.goto("/alerts");
  await expectSelection(page, "/alerts");
  const nav = page.getByTestId("reminder-navigation");
  await nav.locator('a[href="/alerts"]').focus();
  await page.keyboard.press("Tab");
  const quant = nav.locator('a[href="/quant"]');
  await expect(quant).toBeFocused();
  expect(await quant.evaluate(link => getComputedStyle(link).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/quant$/);
  await expectSelection(page, "/quant");
});

test("320px phones wrap complete labels into two columns with 44px targets", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/alerts");
  const nav = page.getByTestId("reminder-navigation");
  const labels = {
    en: ["Price rules", "Notification records"],
    "zh-CN": ["价格规则", "通知记录"],
    "zh-TW": ["價格規則", "通知記錄"],
    ja: ["価格ルール", "通知履歴"],
    es: ["Reglas de precio", "Historial de notificaciones"],
    fr: ["Règles de prix", "Historique des notifications"],
  };
  for (const [locale, [priceRules, records]] of Object.entries(labels)) {
    await page.evaluate(value => localStorage.setItem("seekcost:locale", value), locale);
    await page.reload();
    await expectSelection(page, "/alerts");
    await expect(nav.locator('a[href="/alerts"]')).toHaveText(priceRules);
    await expect(nav.locator('a[href="/notifications"]')).toHaveText(records);
    const targets = await nav.locator("a").evaluateAll(links => links.map(link => {
      const box = link.getBoundingClientRect();
      return { width: box.width, height: box.height, x: box.x, y: box.y, right: box.right, unclipped: link.scrollWidth <= link.clientWidth };
    }));
    expect(new Set(targets.map(target => target.x)).size).toBe(2);
    expect(new Set(targets.map(target => target.y)).size).toBe(2);
    for (const target of targets) {
      expect(Math.round(target.height * 100) / 100).toBeGreaterThanOrEqual(44);
      expect(Math.round(target.width * 100) / 100).toBeGreaterThanOrEqual(44);
      expect(target.right).toBeLessThanOrEqual(320);
      expect(target.unclipped).toBe(true);
    }
    await expect(nav).toHaveAttribute("aria-label", /.+/);
    expect(await nav.innerText()).not.toContain("nav.");
  }
  await page.screenshot({ path: info.outputPath("reminder-light-320.png") });
});

test("navigation remains usable while quant data is delayed", async ({ page }) => {
  let release!: () => void;
  let requested!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route("**/api/v1/quant-strategies", async route => {
    requested();
    await held;
    await route.fulfill({ json: [] });
  });
  try {
    await page.goto("/quant?strategy=price-anchor-observation");
    await started;
    await expectSelection(page, "/quant");
    await page.getByTestId("reminder-navigation").locator('a[href="/notifications"]').click();
    await expectSelection(page, "/notifications");
  } finally {
    release();
  }
});

test("failed quant data leaves sibling navigation available", async ({ page }) => {
  await page.route("**/api/v1/quant-strategies", route => route.fulfill({ status: 503, json: { detail: "Quant fixture unavailable" } }));
  await page.goto("/quant");
  await expect(page.getByText("Quant fixture unavailable")).toBeVisible();
  await expectSelection(page, "/quant");
  await page.getByTestId("reminder-navigation").locator('a[href="/alerts"]').click();
  await expectSelection(page, "/alerts");
});

test("navigation is limited to exact route families and slash-delimited descendants", async ({ page }) => {
  await page.goto("/alerts");
  for (const path of destinations) {
    await page.evaluate(value => window.history.pushState(null, "", `${value}/detail`), path);
    await expectSelection(page, path);
    await page.evaluate(value => window.history.pushState(null, "", `${value}-other`), path);
    await expect(page.getByTestId("reminder-navigation")).toHaveCount(0);
  }
  await page.goto("/watchlist");
  await expect(page.getByTestId("reminder-navigation")).toHaveCount(0);
});

for (const theme of ["light", "dark", "custom"]) {
  test(`${theme} navigation preserves visible selection`, async ({ page }, info) => {
    await page.addInitScript(value => {
      localStorage.setItem("zb_theme", value);
      localStorage.setItem("zb_custom_color", "#a855f7");
    }, theme);
    await page.goto("/alerts");
    await expectSelection(page, "/alerts");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const nav = page.getByTestId("reminder-navigation");
    const selected = nav.locator('a[aria-current="page"]');
    const unselected = nav.locator('a[href="/quant"]');
    const currentColor = await selected.evaluate(link => getComputedStyle(link).backgroundColor);
    expect(currentColor).not.toBe(await unselected.evaluate(link => getComputedStyle(link).backgroundColor));
    await page.screenshot({ path: info.outputPath(`reminder-${theme}-${info.project.name}.png`) });
  });
}
