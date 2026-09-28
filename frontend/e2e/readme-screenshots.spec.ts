import { test, expect } from "@playwright/test";
import path from "node:path";

// Real application UI; ALL API responses are synthetic. Never log into a real account.
test("capture privacy-safe README tour", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "README uses desktop and phone captures");
  const zh = info.project.name === "mobile";
  await page.addInitScript(({ zh }) => {
    localStorage.setItem("zb_token", "readme-fixture-not-a-real-token");
    localStorage.setItem("zb_user", JSON.stringify({id:1,username:"showcase",nickname:"Demo"}));
    localStorage.setItem("seekcost:locale", zh ? "zh-CN" : "en");
    localStorage.setItem("zb_theme", "emerald");
  }, { zh });
  const symbols = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "TSM", "AMD", "META"];
  const names = ["NVIDIA", "Apple", "Microsoft", "Alphabet", "Amazon", "TSMC", "AMD", "Meta Platforms"];
  const stocks = symbols.map((symbol, i) => ({
    id: i+1, symbol, name:names[i], stage:"radar", sector:"美股", industries:["Technology"], concepts:["Long-term research"],
    current_price:100+i*12, fair_price:110+i*12, strike_price:95+i*12, target_price:125+i*12, planned_capital:0,
    price_change_pct:i % 3 === 1 ? -1.25 : 2.34, tranches:3, first_entry_drop:0, add_on_drop:10,
    notes:"", milestones:[], inspiration:"", thesis:"Review growth, valuation and execution before acting.",
    invalidation:"Reassess if the original evidence changes.", created_at:"2026-01-15T12:00:00Z", updated_at:"2026-01-15T12:00:00Z",
  }));
  const rules = [
    {name:"Watchlist · Near the 20-day average",scope:"watchlist",stock_id:null,period:20,tolerance:2,side:"both",status:"inside"},
    {name:"NVIDIA · Revisit the long-term thesis",scope:"single",stock_id:1,period:60,tolerance:3,side:"above",status:"outside"},
  ].map((rule, i) => ({...rule,id:i+1,enabled:true,cooldown_minutes:1440,symbol:"NVDA",stock_name:"NVIDIA",checked_at:"2026-01-15T12:00:00Z",evidence:null,target_count:8,checked_count:8,inside_count:i ? 0 : 2,unavailable_count:0}));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({json:{id:1,username:"showcase",nickname:"Demo",theme:"emerald"}});
    if (url.pathname.includes("/admin/")) return route.fulfill({status:403,json:{detail:"Not an administrator"}});
    if (url.pathname.endsWith("/watchlist/stocks")) return route.fulfill({json:stocks});
    if (url.pathname.endsWith("/alerts/rules")) return route.fulfill({json:rules});
    if (url.pathname.endsWith("/alerts/notifications")) return route.fulfill({json:{items:[],unread_count:0,next_cursor:null}});
    if (url.pathname.endsWith("/prices/intraday-quote")) {
      const i = Math.max(0,symbols.indexOf(url.searchParams.get("symbol") || ""));
      const base = 100+i*12, change = i % 3 === 1 ? -1.25 : 2.34;
      return route.fulfill({json:{status:"available",previous_close:base,price:base*(1+change/100),change_pct:change,currency:"USD",source:"Synthetic demo",as_of:1768478400,
        points:Array.from({length:40},(_,n)=>({timestamp:1768466700+n*300,price:base*(1+(Math.sin(n*1.7+i)*.3+change*n/39)/100)}))}});
    }
    return route.fulfill({json:[]});
  });
  await page.goto("/watchlist");
  await expect(page.getByTestId("market-quote").first().locator("svg")).toBeVisible();
  // Screenshot caption is deliberately visible in the rendered browser, too.
  const demoLabel = () => {
    const badge=document.createElement("div"); badge.id="readme-demo-label";
    badge.textContent="DEMO · Synthetic data / 虚构演示数据";
    badge.style.cssText="position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:6px 12px;border-radius:20px;background:#12382c;color:#aff2d5;font:11px system-ui;white-space:nowrap";
    document.body.appendChild(badge);
  };
  await page.evaluate(demoLabel);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:path.resolve("../docs/images", zh ? "watchlist-mobile.png" : "watchlist-desktop.png")});
  if (!zh) {
    await page.goto("/alerts");
    await expect(page.getByTestId("alert-rule-card")).toHaveCount(2);
    await page.evaluate(demoLabel);
    await page.screenshot({path:path.resolve("../docs/images/alerts-desktop.png")});
  }
});

test("closed registration explains private setup", async ({page}) => {
  await page.route("**/api/v1/auth/registration", route => route.fulfill({json:{enabled:false}}));
  await page.goto("/register");
  await expect(page.getByRole("status")).toContainText("public registration disabled");
  await expect(page.locator("form")).toHaveCount(0);
});

test("registration check failure offers retry without exposing a form", async ({page}) => {
  let failed = true;
  await page.route("**/api/v1/auth/registration", route => failed ? route.fulfill({status:503,json:{}}) : route.fulfill({json:{enabled:true}}));
  await page.goto("/register");
  await expect(page.getByRole("alert").filter({hasText:"Unable to check registration"})).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  failed = false;
  await page.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(page.locator("form")).toBeVisible();
});
