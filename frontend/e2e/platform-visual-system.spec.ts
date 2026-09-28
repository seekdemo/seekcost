import { test, expect } from '@playwright/test';
import { mockResearchDetail } from './helpers/research';

test('custom dark research covers keep readable text', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.fulfill({ json: [] }));
  await mockResearchDetail(page, { cover_color: '#14392f' });
  await page.goto('/research');
  const cover = page.locator('.research-card__fallback').first();
  await expect(cover).toHaveCSS('background-color', 'rgb(20, 57, 47)');
  await expect(cover).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('public surfaces share the platform visual system', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('zb_theme', 'light');
    localStorage.setItem('seekcost:locale', 'zh-CN');
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/login', '/register', '/about', '/guide']) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.ui-button').first()).toHaveCSS('border-radius', '8px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/login');
  await expect(page.locator('.auth-card')).toHaveCSS('border-radius', '12px');
  await page.locator('#username').focus();
  await expect(page.locator('#username')).toBeFocused();
  expect(errors).toEqual([]);
});

test('authenticated platform routes remain usable after visual unification', async ({ page }, info) => {
  test.setTimeout(120_000);
  test.skip(!process.env.SEEKCOST_E2E_TOKEN, 'Explicit local readonly test token required');
  await page.addInitScript(token => {
    localStorage.setItem('zb_token', token!);
    localStorage.setItem('zb_theme', 'light');
    localStorage.setItem('seekcost:locale', 'zh-CN');
  }, process.env.SEEKCOST_E2E_TOKEN);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/portfolio', '/assets', '/finance', '/trade', '/profile', '/notifications', '/alerts', '/import/ibkr', '/research', '/research/topics', '/research/guide', '/watchlist/earnings', '/admin']) {
    await page.goto(route);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    await page.screenshot({ path: info.outputPath(route.replaceAll('/', '-') + '.png'), animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});
