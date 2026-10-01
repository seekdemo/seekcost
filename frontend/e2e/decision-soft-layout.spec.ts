import { expect, test, type Page } from '@playwright/test';

const notes = [
  { id: 2, title: '长期现金流研究', content: '到期研究的原始判断：检查经营现金流。', stock_symbols: [], links: [], tags: [], status: 'active', kind: 'company', updated_at: '2026-09-28' },
  { id: 3, title: '微软续约质量', content: '真实关联笔记：订阅续约与收入质量。', stock_symbols: ['MSFT'], links: [{ entity_type: 'watch_stock', entity_id: 6 }], tags: [], status: 'active', kind: 'company', updated_at: '2026-09-29' },
];
const overview = {
  generated_at: '2026-10-01T12:00:00Z',
  due_research: [{ id: 2, title: '长期现金流研究', next_review_at: '2026-09-30' }],
  upcoming_events: [{ stock_id: 6, symbol: 'MSFT', title: '季度财报', date: '2026-10-05', days: 4 }],
  strike_candidates: [{ id: 1, symbol: 'NVDA', name: '英伟达', current_price: 177, strike_price: 175 }],
  volume_watch: { threshold: 1.5, scanned_count: 10, total_count: 10, items: [{ stock_id: 9, symbol: 'COST', name: '好市多', ratio: 1.7, latest_volume: 170, previous_volume: 100, bar_date: '2026-09-29' }] },
  stale_stocks: [], incomplete_stocks: [], active_plans: [], unreviewed_transactions: [], watchlist_summary: { total: 10 },
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { id: 1, username: 'fixture' } }));
  await page.route('**/api/v1/alerts/notifications*', route => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.route('**/api/v1/workbench/overview', route => route.fulfill({ json: overview }));
  await page.route('**/api/v1/notes{,?*}', route => route.fulfill({ json: notes }));
  await page.addInitScript(() => {
    localStorage.setItem('zb_token', 'fixture');
    localStorage.setItem('seekcost:locale', 'zh-CN');
    if (!localStorage.getItem('zb_theme')) localStorage.setItem('zb_theme', 'light');
  });
});

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('four source fields and real source dates stay readable with a 3:2 desktop table', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/decision');
  const rows = page.locator('.decision-thought');
  await expect(rows).toHaveCount(4);
  for (const [index, category, identity, reason, date] of [
    [0, '到期检查', '长期现金流研究', '到期检查', '2026-09-30'],
    [1, '事件提醒', 'MSFT', '事件临近', '2026-10-05'],
    [2, '价格提醒', 'NVDA', '关注价', ''],
    [3, '放量关注', 'COST', '1.70 倍', '2026-09-29'],
  ] as const) {
    const row = rows.nth(index);
    await expect(row.locator('.decision-thought__category')).toHaveText(category);
    await expect(row.locator('.decision-thought__identity')).toContainText(identity);
    await expect(row.locator('.decision-thought__reason')).toContainText(reason);
    await expect(row.locator('time')).toHaveText(date ? /\d/ : '—');
    if (date) await expect(row.locator('time')).toHaveAttribute('datetime', date);
    else await expect(row.locator('time')).not.toHaveAttribute('datetime');
    for (const field of await row.locator(':scope > *').all()) {
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(await field.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
  }
  const width = page.viewportSize()!.width;
  if (width > 1100) {
    await expect(page.locator('.decision-table-head')).toHaveText(/分类.*标的 \/ 研究主题.*触发原因.*日期/);
    const board = await page.locator('.decision-board').boundingBox();
    const workspace = await page.locator('.decision-workspace').boundingBox();
    expect(board!.width / workspace!.width).toBeCloseTo(0.6, 1);
    expect((await page.locator('.decision-inbox').boundingBox())!.x).toBe(24);
  }
  await expect(page.getByText('观察、判断与回顾', { exact: true })).toHaveCount(0);
  await expect(page.getByText('近期变化', { exact: true })).toHaveCount(0);
  await expect(page.getByText('持续观察', { exact: true })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('light-workspace.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('selection opens actual linked research and mobile Escape restores focus', async ({ page, isMobile }, testInfo) => {
  await page.goto('/decision');
  const trigger = page.locator('.decision-thought').filter({ hasText: 'MSFT' });
  await trigger.click();
  const preview = isMobile ? page.getByRole('dialog', { name: 'MSFT 思考预览' }) : page.locator('.decision-preview--desktop');
  await expect(preview).toContainText('真实关联笔记：订阅续约与收入质量。');
  await expect(preview).not.toContainText('到期研究的原始判断');
  await expect(preview.locator('a[href="/research/3"]')).toBeVisible();
  if (isMobile) {
    await page.screenshot({ path: testInfo.outputPath('light-mobile-reader.png'), fullPage: true });
    await page.getByRole('button', { name: '关闭预览' }).press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  }
  await page.getByRole('button', { name: /放量关注\s*1/ }).click();
  await expect(page.locator('.decision-thought')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '搜索标的或问题' }).fill('COST');
  await expect(page.locator('.decision-thought')).toContainText('好市多');
  await noOverflow(page);
});

test('resizing an open mobile reader releases scroll lock and shows selected desktop research', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/decision');
  await page.locator('.decision-thought').filter({ hasText: 'MSFT' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.decision-preview--desktop')).toContainText('真实关联笔记');
  await expect(page.locator('.decision-preview--desktop')).toBeVisible();
  await noOverflow(page);
});

test('desktop preview stays in view for deep rows and resets reading position on selection', async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 700, 'Phones use the full-screen reader');
  const items = Array.from({ length: 40 }, (_, index) => ({
    stock_id: 1000 + index, symbol: `ROW${index}`, name: `Research company ${index}`,
    ratio: 1.8, latest_volume: 180, previous_volume: 100, bar_date: '2026-09-29',
  }));
  await page.route('**/api/v1/workbench/overview', route => route.fulfill({ json: {
    ...overview, due_research: [], upcoming_events: [], strike_candidates: [],
    volume_watch: { threshold: 1.5, scanned_count: 40, total_count: 40, items },
  } }));
  await page.route('**/api/v1/notes{,?*}', route => route.fulfill({ json: items.map((item, index) => ({
    ...notes[1], id: 1000 + index, title: `Research ${item.symbol}`,
    stock_symbols: [item.symbol], links: [{ entity_type: 'watch_stock', entity_id: item.stock_id }],
    content: Array.from({ length: 100 }, (_, line) => `Research evidence ${line}: ${item.symbol}.`).join('\n\n'),
  })) }));
  await page.goto('/decision');
  const rows = page.locator('.decision-thought');
  await expect(rows).toHaveCount(20);
  await page.getByRole('button', { name: /再显示 20 项/ }).click();
  await expect(rows).toHaveCount(40);
  await rows.nth(18).click();
  const preview = page.locator('.decision-preview--desktop');
  await expect(preview.locator('h2')).toHaveText('ROW18');
  const box = await preview.boundingBox();
  const headerHeight = await page.locator('.app-navigation').evaluate(el => el.getBoundingClientRect().height);
  expect(box!.y).toBeGreaterThanOrEqual(headerHeight);
  expect(box!.y).toBeLessThanOrEqual(headerHeight + 17);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 15);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await preview.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await preview.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await rows.nth(19).click();
  await expect(preview.locator('h2')).toHaveText('ROW19');
  await expect.poll(() => preview.evaluate(el => el.scrollTop)).toBe(0);
  await noOverflow(page);
});

test('dark and custom themes use action and selection tokens with readable source fields', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/decision');
  for (const theme of ['dark', 'custom']) {
    await page.evaluate(theme => {
      localStorage.setItem('zb_theme', theme);
      localStorage.setItem('zb_custom_color', '#8db9aa');
    }, theme);
    await page.reload();
    await expect(page.locator('.decision-thought')).toHaveCount(4);
    const comparisons = await page.evaluate(() => {
      const probe = document.createElement('span'); probe.style.setProperty('transition', 'none', 'important'); document.body.append(probe);
      const color = (token: string) => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
      const action = getComputedStyle(document.querySelector('.decision-primary')!);
      const row = getComputedStyle(document.querySelector('.decision-thought[data-selected=true]')!);
      const result = [[action.color, color('--action-fg')], [action.backgroundColor, color('--action-bg')], [row.backgroundColor, color('--selected-bg')], [row.borderLeftColor, color('--selected-line')]];
      for (const selector of ['.decision-thought__reason', '.decision-thought__date']) result.push([getComputedStyle(document.querySelector(selector)!).color, color('--text-secondary')]);
      probe.remove(); return result;
    });
    for (const [actual, expected] of comparisons) expect(actual).toBe(expected);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-workspace.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
