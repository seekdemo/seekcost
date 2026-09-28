import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", route => route.fulfill({json: []}));
  await page.route("**/api/v1/auth/me", route => route.fulfill({json: {id: 1, username: "fixture"}}));
});

const note = {
  id: 1,
  user_id: 1,
  title: "Initial thesis",
  content: "# Initial thesis\n\nKeep researching the company.",
  format: "markdown",
  visibility: "private",
  kind: "thesis",
  status: "active",
  confidence: null,
  next_review_at: null,
  starred: false,
  cover_image_url: null,
  cover_color: "#DCE7F5",
  allow_comments: true,
  stock_symbols: [],
  knowledge_tags: [],
  tags: [],
  series: null,
  series_id: null,
  links: [],
  comment_count: 0,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-09T00:00:00Z",
};

async function mockEditableResearch(page: import("@playwright/test").Page, options: { failNextPatch?: boolean; holdPatches?: boolean; stocks?: { id: number; symbol: string; name: string }[]; onPatch?: (body: Record<string, unknown>) => void; note?: Partial<typeof note> } = {}) {
  const research = { ...note, ...options.note };
  await page.route("**/api/v1/**", route => route.fulfill({json: []}));
  await page.route("**/api/v1/auth/me", route => route.fulfill({json: {id: 1, username: "fixture"}}));
  await page.route("**/api/v1/alerts/notifications", route => route.fulfill({json: {items: [], unread_count: 0}}));
  const failNextPatch = options.failNextPatch === true;
  let patchesAllowed = !failNextPatch;
  let patchStarted: (() => void) | undefined;
  let releasePatch: (() => void) | undefined;
  const patchStartedPromise = new Promise<void>((resolve) => { patchStarted = resolve; });
  const releasePatchPromise = new Promise<void>((resolve) => { releasePatch = resolve; });
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: options.stocks || [] }));
  await page.route("**/api/v1/notes", (route) => route.fulfill({ json: [research] }));
  await page.route("**/api/v1/notes?*", (route) => route.fulfill({ json: [research] }));
  await page.route("**/api/v1/notes/favorites", (route) => route.fulfill({ json: { note_ids: [], series: [] } }));
  await page.route("**/api/v1/notes/series", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1/comments", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1", async (route) => {
    if (route.request().method() === "PATCH") {
      options.onPatch?.(route.request().postDataJSON() as Record<string, unknown>);
      patchStarted?.();
      if (options.holdPatches) await releasePatchPromise;
      if (failNextPatch && !patchesAllowed) return route.fulfill({ status: 500, json: { detail: "save failed" } });
      return route.fulfill({ json: { ...research, ...route.request().postDataJSON() } });
    }
    return route.fulfill({ json: research });
  });
  await page.goto("/login");
  await page.evaluate(() => { window.localStorage.setItem("zb_token", "e2e-token"); window.localStorage.setItem("seekcost:locale", "en"); });
  return { allowPatches: () => { patchesAllowed = true; }, waitForPatch: () => patchStartedPromise, releasePatch: () => releasePatch?.() };
}

test("markdown preview uses article typography and split mode only on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockEditableResearch(page, { note: { format: "markdown" } });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("region", { name: "Research preview" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveClass(/research-article-prose/);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Split preview" }).click();
  await expect(page.locator("[data-editor-layout='split']")).toBeVisible();
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(page.getByRole("button", { name: "Split preview" })).toBeHidden();
  await expect(page.locator("[data-editor-layout='split']")).toHaveCount(0);
});

test("Markdown Undo restores editor focus", async ({ page }) => {
  await mockEditableResearch(page, { note: { format: "markdown" } });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  const editor = page.getByRole("textbox", { name: "Research body" });
  await editor.focus();
  await editor.evaluate((node) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", "<h2>AI summary</h2><p>Moat</p>");
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  });
  await page.getByRole("button", { name: "Undo cleaned paste" }).click();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(note.content);
});

test("AI rich text paste keeps structure and Undo survives single preview", async ({ page }) => {
  await mockEditableResearch(page, { note: { format: "rich", content: "<p>Existing research</p>" } });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  const editor = page.getByRole("textbox", { name: "Research body" });
  await editor.focus();
  await editor.evaluate((node) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", "<h2 style='color:red'>AI summary</h2><script>bad()</script><ul><li>Moat</li></ul>");
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  });
  await expect(editor.locator("h2")).toHaveText("AI summary");
  await expect(editor.locator("script")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Research preview" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo cleaned paste" })).toBeVisible();
  await page.getByRole("button", { name: "Undo cleaned paste" }).click();
  await expect(editor).toContainText("Existing research");
  await expect(editor).not.toContainText("AI summary");
  await expect(editor).toBeFocused();
});

test("rich paste Undo is invalidated by later image alignment", async ({ page }) => {
  await mockEditableResearch(page, { note: { format: "rich", content: '<p>Existing research</p><p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==" alt="Diagram"></p>' } });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  const editor = page.getByRole("textbox", { name: "Research body" });
  await editor.focus();
  await editor.evaluate((node) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", "<p>AI summary</p>");
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  });
  await expect(page.getByRole("button", { name: "Undo cleaned paste" })).toBeVisible();
  await editor.getByRole("img", { name: "Diagram" }).click();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo cleaned paste" })).toBeHidden();
});

test("editing uses a focused document shell and on-demand properties", async ({ page }) => {
  await mockEditableResearch(page);
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await expect(page.getByRole("region", { name: "Research editor" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Research title" })).toBeVisible();
  await expect(page.getByText("Research type")).toBeHidden();
  await page.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByRole("dialog", { name: "Research properties" })).toBeVisible();
  await expect(page.getByText("Research type")).toBeVisible();
});

test("Escape closes only the topmost overlay and restores trigger focus", async ({ page }) => {
  await mockEditableResearch(page);
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  const propertiesTrigger = page.getByRole("button", { name: "Properties" });
  await propertiesTrigger.click();
  const properties = page.getByRole("dialog", { name: "Research properties" });
  await expect(properties).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole("menu")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(properties).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(properties).toBeHidden();
  await expect(propertiesTrigger).toBeFocused();
});

test("properties manage linked stocks through autosave", async ({ page }) => {
  let savedStockSymbols: string[] = [];
  await mockEditableResearch(page, { stocks: [{ id: 9, symbol: "ACME", name: "Acme Holdings" }], onPatch: (body) => {
    savedStockSymbols = body.stock_symbols as string[];
  }});
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await page.getByRole("button", { name: "Properties" }).click();
  const stockToggle = page.getByRole("button", { name: "Toggle linked stock ACME" });
  await page.getByRole("button", { name: "Expand linked symbols" }).click();
  await expect(stockToggle).toHaveAttribute("aria-pressed", "false");
  await stockToggle.click();
  await expect(stockToggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => savedStockSymbols).toEqual(["ACME"]);
});

test("editor resets properties and reports save state accurately", async ({ page }) => {
  const save = await mockEditableResearch(page, { holdPatches: true });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await page.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByRole("dialog", { name: "Research properties" })).toBeVisible();
  await page.locator(".research-responsive-panel__header").getByRole("button", { name: "Close properties" }).click();
  const title = page.getByRole("textbox", { name: "Research title" });
  const editor = page.getByRole("region", { name: "Research editor" });
  await title.fill("Saving thesis");
  await expect(editor.getByText("Unsaved", { exact: true })).toBeVisible();
  await save.waitForPatch();
  await expect(editor.getByText("Saving…", { exact: true })).toBeVisible();
  save.releasePatch();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done editing" }).click();
  await page.getByRole("button", { name: "Edit research" }).click();
  await expect(page.getByRole("dialog", { name: "Research properties" })).toBeHidden();
});

test("mobile editing hides navigation and applies full-width canvas below 768px", async ({ page }) => {
  await mockEditableResearch(page);
  await page.setViewportSize({ width: 767, height: 844 });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  await expect(page.locator(".research-document-grid.is-editing")).toHaveCSS("margin-top", "12px");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
  await page.setViewportSize({ width: 768, height: 844 });
  await page.getByRole("button", { name: "Edit research" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
});

test("done waits for final save and leaves failed edits open", async ({ page }) => {
  const save = await mockEditableResearch(page, { failNextPatch: true });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await page.getByRole("textbox", { name: "Research title" }).fill("Revised thesis");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("region", { name: "Research editor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  save.allowPatches();
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("region", { name: "Research editor" })).toBeHidden();
});

test("research editor remains open after debounced autosave", async ({ page }) => {
  let saveCount = 0;

  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes", (route) => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes?*", (route) => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes/favorites", (route) => route.fulfill({ json: { note_ids: [], series: [] } }));
  await page.route("**/api/v1/notes/series", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1/comments", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1", async (route) => {
    if (route.request().method() === "PATCH") {
      saveCount += 1;
      await route.fulfill({ json: { ...note, ...route.request().postDataJSON() } });
      return;
    }
    await route.fulfill({ json: note });
  });

  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.setItem("zb_token", "e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
  });
  await page.goto("/research/1");

  await expect(page.getByRole("heading", { name: "Initial thesis" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit research" }).click();
  const titleInput = page.getByPlaceholder("Write a clear title");
  await expect(titleInput).toBeVisible();

  await titleInput.fill("First update");
  await expect.poll(() => saveCount, { timeout: 2_000 }).toBeGreaterThan(0);
  await expect(titleInput).toBeVisible();

  await titleInput.fill("Second update");
  await expect.poll(() => saveCount, { timeout: 2_000 }).toBeGreaterThan(1);
  await expect(titleInput).toBeVisible();
});

test("failed final save keeps the editor open and supports retry", async ({ page }) => {
  let failSave = true;

  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes", (route) => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes?*", (route) => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes/favorites", (route) => route.fulfill({ json: { note_ids: [], series: [] } }));
  await page.route("**/api/v1/notes/series", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1/comments", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1", async (route) => {
    if (route.request().method() === "PATCH") {
      if (failSave) {
        await route.fulfill({ status: 500, json: { detail: "save failed" } });
        return;
      }
      await route.fulfill({ json: { ...note, ...route.request().postDataJSON() } });
      return;
    }
    await route.fulfill({ json: note });
  });

  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.setItem("zb_token", "e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
  });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  const titleInput = page.getByPlaceholder("Write a clear title");
  await titleInput.fill("Keep this local draft");
  await page.getByRole("button", { name: "Done editing" }).click();

  await expect(titleInput).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Research editor" }).getByText("Save failed", { exact: true })).toBeVisible();
  failSave = false;
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(titleInput).toHaveValue("Keep this local draft");
});
