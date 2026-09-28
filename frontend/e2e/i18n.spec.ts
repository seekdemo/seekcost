import { expect, test } from "@playwright/test";

const localizedLoginTitles = {
  en: "Log in to SeekCost",
  "zh-CN": "登录 SeekCost",
  "zh-TW": "登入 SeekCost",
  ja: "SeekCost にログイン",
  es: "Entrar en SeekCost",
  fr: "Se connecter à SeekCost",
} as const;

test("English is the default and every supported language can be selected", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(localizedLoginTitles.en);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const switcher = page.getByTestId("language-switcher");
  for (const [locale, title] of Object.entries(localizedLoginTitles)) {
    await switcher.click();
    await page.locator(`[data-locale-option="${locale}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }

  await switcher.click();
  await page.locator('[data-locale-option="zh-CN"]').click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(localizedLoginTitles["zh-CN"]);
  await expect(page.getByTestId("language-switcher")).toHaveAttribute("data-locale", "zh-CN");
});
