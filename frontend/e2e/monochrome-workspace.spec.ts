import { test, expect } from '@playwright/test';

const note = {
  id: 2, title: '微软 · 收入质量观察', content: '收入质量比单日价格重要。核对续约情况和经营现金流。',
  kind: 'company', status: 'active', tags: ['经营质量'], stock_symbols: ['MSFT'],
  links: [{ entity_type: 'watch_stock', entity_id: 6 }], updated_at: '2026-09-28',
};
const overview = {
  generated_at: '2026-09-28T00:00:00Z', strike_candidates: [], due_research: [],
  upcoming_events: [{ stock_id: 6, symbol: 'MSFT', title: '季度财报', date: '2026-10-05', days: 7 }],
  stale_stocks: [], incomplete_stocks: [], active_plans: [], unreviewed_transactions: [],
  watchlist_summary: { total: 10, radar: 8, conviction: 2, strike: 0 },
  volume_watch: { threshold: 1.5, items: [], scanned_count: 10, total_count: 10 },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { id: 1, username: 'fixture' } }));
  await page.route('**/api/v1/alerts/notifications*', route => route.fulfill({ json: { items: [], unread_count: 0 } }));
  await page.route('**/api/v1/workbench/overview', route => route.fulfill({ json: overview }));
  await page.route('**/api/v1/notes?*', route => route.fulfill({ json: [note] }));
  await page.addInitScript(() => {
    localStorage.setItem('zb_token', 'fixture');
    localStorage.setItem('zb_user', JSON.stringify({ id: 1, username: 'fixture' }));
    localStorage.setItem('seekcost:locale', 'zh-CN');
    localStorage.setItem('zb_theme', 'light');
  });
});

test('decision navigation keeps four top-level destinations', async ({ page }) => {
  await page.goto('/decision');
  const nav = page.getByTestId('section-navigation');
  await expect(nav.locator('a')).toHaveCount(4);
  await expect(nav).toContainText('思考');
  await expect(nav).toContainText('股票池');
  await expect(nav).toContainText('研究笔记');
  await expect(nav).toContainText('提醒');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 246, 248)');
  await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);
  if (page.viewportSize()!.width >= 768) {
    const primary = page.getByTestId('primary-navigation');
    await expect(primary).toBeVisible();
    const box = await primary.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(65);
    expect(box!.y).toBeLessThan(65);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('research preview uses a real linked note rather than invented analysis', async ({ page, isMobile }) => {
  await page.goto('/decision');
  await page.getByRole('button', { name: /MSFT.*季度财报/ }).click();
  const preview = isMobile ? page.getByRole('dialog', { name: 'MSFT 思考预览' }) : page.locator('.decision-preview--desktop');
  await expect(preview).toContainText('收入质量比单日价格重要');
  await expect(preview.locator('a[href="/research/2"]')).toBeVisible();
  await expect(preview.getByRole('link', { name: /记录这次思考/ })).toHaveAttribute('href', '/research/new?stock=6');
});

test('legacy reminder routes stay discoverable in the condensed navigation', async ({ page }) => {
  await page.goto('/decision');
  await page.getByTestId('section-navigation').getByRole('link', { name: '提醒', exact: true }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.locator('.alerts-hub-nav a[href="/quant"]')).toBeVisible();
  await expect(page.locator('.alerts-hub-nav a[href="/watchlist/earnings"]')).toBeVisible();
  await expect(page.locator('.alerts-hub-nav a[href="/notifications"]')).toBeVisible();
  await expect(page.locator('.alerts-hub-nav a[href="/alerts"][aria-current="page"]')).toBeVisible();
  await page.locator('.alerts-hub-nav a[href="/quant"]').click();
  await expect(page).toHaveURL(/\/quant$/);
  await expect(page.getByRole('heading', { name: '量化监控', exact: true })).toBeVisible();
  await expect(page.getByTestId('section-navigation').locator('a[aria-current="page"]')).toHaveAttribute('href', '/alerts');
  for (const path of ['/notifications', '/watchlist/earnings']) {
    await page.locator(`.alerts-hub-nav a[href="${path}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('.alerts-hub-nav a')).toHaveCount(4);
    await expect(page.locator('.alerts-hub-nav a[aria-current="page"]')).toHaveAttribute('href', path);
    await expect(page.getByTestId('section-navigation').locator('a[aria-current="page"]')).toHaveAttribute('href', '/alerts');
  }
});

test('a quiet workspace offers existing notes without fabricating trigger rows', async ({ page }) => {
  await page.route('**/api/v1/workbench/overview', route => route.fulfill({ json: { ...overview, upcoming_events: [] } }));
  await page.goto('/decision');
  await expect(page.getByText('暂时没有需要重新检查的变化')).toBeVisible();
  await expect(page.locator('.decision-thought')).toHaveCount(0);
  await expect(page.locator('.decision-recent-notes a[href="/research/2"]')).toBeVisible();
  await expect(page.locator('.decision-quiet--trade')).toHaveCount(0);
});

test('dark controls preserve their readable contrasting foreground', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zb_theme', 'dark'));
  await page.goto('/decision');
  await expect(page.locator('.decision-primary').first()).toHaveCSS('color', 'rgb(237, 237, 238)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('small phones preserve the complete navigation and a usable reading dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/decision');
  await page.getByRole('button', { name: /MSFT.*季度财报/ }).click();
  const dialog = page.getByRole('dialog', { name: 'MSFT 思考预览' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭预览' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /记录这次思考/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: '关闭预览' }).press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('top navigation and account remain reachable with long labels at breakpoint widths', async ({ page }) => {
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { id: 1, username: 'fixture', nickname: 'Un nom personnel volontairement très long pour vérifier la barre' } }));
  await page.goto('/decision');
  await page.evaluate(() => localStorage.setItem('seekcost:locale', 'fr'));
  await page.reload();
  for (const width of [1440, 1180, 834, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const primary = page.getByTestId('primary-navigation');
    if (width >= 768) {
      await expect(primary).toBeVisible();
      await expect(primary.locator('a')).toHaveCount(4);
      await expect(primary.locator('a[aria-current="page"]')).toHaveCount(1);
      const boxes = await primary.locator('a').evaluateAll(links => links.map(link => ({ top: link.getBoundingClientRect().top, right: link.getBoundingClientRect().right })));
      expect(new Set(boxes.map(box => box.top)).size).toBe(1);
      expect(Math.max(...boxes.map(box => box.right))).toBeLessThanOrEqual(width);
    } else {
      await expect(primary).toBeHidden();
      await expect(page.locator('.mobile-primary-navigation')).toBeVisible();
    }
    await expect(page.locator('.workspace-topbar__account a[href="/profile"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('research filters remain usable below a multirow header after scrolling', async ({ page }) => {
  await page.route('**/api/v1/notes?*', route => route.fulfill({ json: Array.from({ length: 15 }, (_, index) => ({ ...note, id: index + 1, title: `研究记录 ${index + 1}` })) }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 1100, 834, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/research');
    const toolbar = page.locator('.research-command-bar');
    await expect(toolbar).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
    await expect.poll(async () => {
      const nav = await page.locator('.app-navigation').boundingBox();
      const bar = await toolbar.boundingBox();
      return bar!.y - (nav!.y + nav!.height);
    }).toBeGreaterThanOrEqual(7);
    await expect(toolbar.getByRole('button').first()).toBeVisible();
  }
});

test('linked rich research is readable without exposing stored HTML markup', async ({ page, isMobile }) => {
  await page.route('**/api/v1/notes?*', route => route.fulfill({ json: [{ ...note, format: 'rich', content: '<h2>核对现金流</h2><p>检查<strong>续约质量</strong>与经营现金流。</p><ul><li>回看年报</li></ul>' }] }));
  await page.goto('/decision');
  await page.getByRole('button', { name: /MSFT.*季度财报/ }).click();
  const preview = isMobile ? page.getByRole('dialog', { name: 'MSFT 思考预览' }) : page.locator('.decision-preview--desktop');
  await expect(preview.getByRole('heading', { name: '核对现金流' })).toBeVisible();
  await expect(preview.locator('strong').filter({ hasText: '续约质量' })).toBeVisible();
  await expect(preview.getByText('回看年报')).toBeVisible();
  await expect(preview).not.toContainText('<h2>');
});

test('a due research item previews its exact note before other notes for the same company', async ({ page, isMobile }) => {
  await page.route('**/api/v1/notes?*', route => route.fulfill({ json: [{ ...note, id: 3, title: '较新的同公司记录', content: '这是另一条记录。' }, note] }));
  await page.route('**/api/v1/workbench/overview', route => route.fulfill({ json: { ...overview, upcoming_events: [], due_research: [{ id: note.id, title: note.title, next_review_at: '2026-10-01' }] } }));
  await page.goto('/decision');
  await page.locator('.decision-thought').click();
  const preview = isMobile ? page.getByRole('dialog', { name: 'MSFT 思考预览' }) : page.locator('.decision-preview--desktop');
  await expect(preview).toContainText('收入质量比单日价格重要');
  await expect(preview).not.toContainText('这是另一条记录');
  await expect(preview.getByRole('link', { name: /继续这条思考/ })).toHaveAttribute('href', '/research/2');
});
