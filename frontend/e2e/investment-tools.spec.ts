import { expect, test, type Page, type Route } from "@playwright/test";

type ToolRow = {
  id: number;
  user_id: number;
  name: string;
  url: string;
  description: string;
  category: string;
  pricing: string;
  tags: string[];
  source_url: string | null;
  starred: boolean;
  created_at: string;
  updated_at: string;
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockTools(page: Page) {
  let tools: ToolRow[] = [
    { id: 1, user_id: 1, name: "Signal Lab", url: "https://signal-lab.example/", description: "Turns filings into compact decision signals.", category: "research", pricing: "freemium", tags: ["filings", "AI"], source_url: "https://github.com/example/signal-lab", starred: true, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-15T00:00:00Z" },
    { id: 2, user_id: 1, name: "Backtest Sprint", url: "https://backtest.example/", description: "Tests a compact trading rule against historical bars.", category: "backtest", pricing: "open_source", tags: ["signals", "Python"], source_url: null, starred: false, created_at: "2026-08-02T00:00:00Z", updated_at: "2026-08-14T00:00:00Z" },
  ];
  await page.route("**/api/v1/tools**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = Number(url.pathname.split("/").at(-1));
    if (url.pathname.endsWith("/icon")) return json(route, { icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEvkAAAAASUVORK5CYII=" });
    if (request.method() === "GET") return json(route, tools);
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Omit<ToolRow, "id" | "user_id" | "created_at" | "updated_at">;
      const next = { ...body, id: 3, user_id: 1, created_at: "2026-08-16T00:00:00Z", updated_at: "2026-08-16T00:00:00Z" };
      tools = [next, ...tools];
      return json(route, next, 201);
    }
    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as Partial<ToolRow>;
      const current = tools.find((item) => item.id === id);
      if (!current) return json(route, { detail: "Not found" }, 404);
      const next = { ...current, ...body, updated_at: "2026-08-16T00:00:00Z" };
      tools = tools.map((item) => item.id === id ? next : item);
      return json(route, next);
    }
    tools = tools.filter((item) => item.id !== id);
    return route.fulfill({ status: 204 });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("zb_token", "tools-e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
  });
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return json(route, {id: 1, username: "fixture", nickname: "Fixture"});
    return json(route, []);
  });
  await mockTools(page);
});

test("investment tool directory supports focused collection workflows", async ({ page }, testInfo) => {
  const response = await page.goto("/tools");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Tools built for better investing", exact: true })).toBeVisible();
  await expect(page.getByTestId("tool-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /Open product.*Signal Lab/i })).toHaveAttribute("href", "https://signal-lab.example/");
  await expect(page.getByRole("link", { name: /Open product.*Signal Lab/i })).toHaveAttribute("target", "_blank");

  await page.getByRole("searchbox", { name: "Search tools, use cases or tags…" }).fill("backtest");
  await expect(page.getByTestId("tool-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Backtest Sprint" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByRole("button", { name: "Star Backtest Sprint" }).click();
  await expect(page.getByRole("button", { name: "Remove star from Backtest Sprint" })).toBeVisible();

  await page.getByRole("button", { name: "Add tool" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add an investment tool" });
  await addDialog.getByRole("textbox", { name: "Product name" }).fill("Earnings Copilot");
  await addDialog.getByRole("textbox", { name: "Product URL" }).fill("https://earnings.example");
  await expect(addDialog.locator("img")).toBeVisible();
  await addDialog.getByText("Custom icon", { exact: true }).click();
  await addDialog.getByLabel("Icon image URL").fill("https://earnings.example/custom.png");
  await addDialog.getByRole("textbox", { name: "What is it useful for?" }).fill("Keeps earnings questions and evidence in one place.");
  await addDialog.getByLabel("Category").selectOption("research");
  await addDialog.getByRole("textbox", { name: "Tags" }).fill("earnings, questions");
  await addDialog.getByRole("button", { name: "Save tool" }).click();
  await expect(page.getByRole("heading", { name: "Earnings Copilot" })).toBeVisible();

  const newCard = page.getByTestId("tool-card").filter({ hasText: "Earnings Copilot" });
  if (testInfo.project.name === "mobile") await newCard.locator("summary").click();
  await newCard.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit investment tool" });
  await editDialog.getByText("Custom icon", { exact: true }).click();
  await expect(editDialog.getByLabel("Icon image URL")).toHaveValue("https://earnings.example/custom.png");
  await editDialog.getByRole("button", { name: "Use automatic icon" }).click();
  await expect(editDialog.getByLabel("Icon image URL")).toHaveValue("");
  await editDialog.getByRole("textbox", { name: "Product name" }).fill("Earnings Brief");
  await editDialog.getByRole("button", { name: "Save tool" }).click();
  await expect(page.getByRole("heading", { name: "Earnings Brief" })).toBeVisible();

  const editedCard = page.getByTestId("tool-card").filter({ hasText: "Earnings Brief" });
  if (testInfo.project.name === "mobile") await editedCard.locator("summary").click();
  await editedCard.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete this tool?" });
  await deleteDialog.getByRole("button", { name: "Delete tool" }).click();
  await expect(page.getByRole("heading", { name: "Earnings Brief" })).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".tool-card__mobile-cover").first()).toBeVisible();
    await expect(page.locator(".tools-directory__masonry")).toHaveCSS("column-count", "2");
    await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link")).toHaveCount(4);
  } else {
    await expect(page.locator(".tool-card__mobile-cover").first()).toBeHidden();
  }
});
