import {test, expect} from '@playwright/test';
import {mockResearchDetail} from './helpers/research';

test('research cards put one title first and retain accessible actions', async ({page}, info) => {
  await page.route('**/api/v1/**', route => route.fulfill({json: []}));
  await mockResearchDetail(page, {cover_color: '#14392f'});
  await page.addInitScript(() => localStorage.setItem('zb_theme','light'));
  await page.goto('/research');
  const card=page.locator('.research-card').first();
  await expect(card.locator('h2')).toHaveText('Durable advantage');
  await expect(card.locator('.research-card__fallback p')).toHaveCount(0);
  await expect(card.locator('.research-card__star')).toHaveAttribute('aria-pressed','false');
  const edit=card.getByRole('button',{name:'Edit: Durable advantage',exact:true});
  await expect(edit).toBeVisible();
  await edit.focus();
  await expect(edit).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const height=await card.evaluate(node=>node.getBoundingClientRect().height);
  expect(height).toBeLessThan(370);
  await page.screenshot({path:info.outputPath('precision-research.png'),animations:'disabled'});
});
