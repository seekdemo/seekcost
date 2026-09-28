import {test, expect} from '@playwright/test';

test('cockpit omits duplicate lanes and retains filters and touch details', async ({page}, info) => {
  const rows = ['entry','watch','extended','risk'].map((disposition,index) => ({
    stock_id: index+1, symbol: ['DELL','NVDA','TSLA','MSFT'][index], name: ['Dell','NVIDIA','Tesla','Microsoft'][index],
    market:'us',stage:'radar',disposition,has_position:false,has_data_issue:false,confirmation_count:0,
    decision_reason:'pullback_confirmed',next_step:'review_risk',signals:[],headline:null,
  }));
  await page.addInitScript(()=>{
    localStorage.setItem('zb_token','fixture');localStorage.setItem('seekcost:locale','zh-CN');localStorage.setItem('zb_theme','light');
  });
  await page.route('**/api/v1/**', route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/auth/me')) return route.fulfill({json:{id:1,username:'fixture',theme:'light'}});
    if(path.endsWith('/workbench/overview')) return route.fulfill({json:{
      quant_cockpit:{enabled_strategy_count:1,available_strategy_count:1,watchlist_count:4,stocks:rows,market_sessions:[],
        summary:{entry_count:1,watch_count:1,extended_count:1,risk_count:1,data_issue_count:0},last_evaluated_at:null},
    }});
    if(path.endsWith('/workbench/intraday-preview')) return route.fulfill({json:{items:[],total_count:0,requested_count:0,is_market_open:false,refreshing:false}});
    return route.fulfill({json:[]});
  });
  await page.goto('/');
  await expect(page.locator('.quant-cockpit-stock-row')).toHaveCount(4);
  await expect(page.locator('.quant-cockpit-metric')).toHaveCount(0);
  await expect(page.locator(".quant-cockpit-lanes-section")).toHaveCount(0);
  await page.locator('.quant-cockpit-filters').getByRole('button',{name:/入场候选/}).click();
  await expect(page.locator('.quant-cockpit-stock-row')).toHaveCount(1);
  await page.locator('.quant-monitor-detail summary').click();
  await expect(page.locator('.quant-monitor-detail p')).toBeVisible();
  await expect(page.locator('.quant-cockpit-stock-row')).toHaveAttribute('href','/watchlist/1');
  await page.locator('.quant-cockpit-filters').getByRole('button',{name:/全部/}).click();
  await page.getByRole('searchbox').fill('Microsoft');
  await expect(page.locator('.quant-cockpit-stock-row')).toHaveCount(1);
  await page.getByRole('searchbox').fill('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('approved-cockpit.png'),fullPage:true,animations:'disabled'});
});
