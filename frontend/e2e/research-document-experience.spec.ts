import { expect, test, type Page } from "@playwright/test";
import { anchoredComments, coverDataUrl, longMarkdown, mockResearchDetail, sectionedMarkdown, veryLongTitle, wideTableMarkdown } from "./helpers/research";

const note = {
  id: 1,
  user_id: 1,
  title: "Durable company research",
  content: "<h2>Business model</h2><p>Recurring revenue supports reinvestment.</p><h2>Risks</h2><p>Competition can compress margins.</p>",
  format: "rich",
  visibility: "private",
  kind: "company",
  status: "active",
  confidence: 3,
  next_review_at: "2026-09-01T00:00:00Z",
  starred: false,
  cover_image_url: null,
  cover_color: "#DCE7F5",
  allow_comments: true,
  stock_symbols: [],
  knowledge_tags: [],
  tags: ["fundamentals"],
  series: null,
  series_id: null,
  links: [],
  comment_count: 0,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
};

async function installRoutes(page: Page) {
  await page.route("**/api/v1/**", route => route.fulfill({json: []}));
  await page.route("**/api/v1/auth/me", route => route.fulfill({json: {id: 1, username: "fixture"}}));
  await page.route("**/api/v1/alerts/notifications", route => route.fulfill({json: {items: [], unread_count: 0}}));
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/favorites", (route) => route.fulfill({ json: { note_ids: [], series: [] } }));
  await page.route("**/api/v1/notes/series", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1/comments", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/1", (route) => route.fulfill({ json: note }));
  await page.route("**/api/v1/notes?*", (route) => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes", (route) => route.fulfill({ json: [note] }));
}

async function login(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.setItem("zb_token", "e2e-token");
    window.localStorage.setItem("seekcost:locale", "en");
  });
}

test.beforeEach(async ({ page }) => {
  await installRoutes(page);
  await login(page);
});

for (const viewport of [
  { name: "wide desktop", width: 1440, height: 900 },
  { name: "compact desktop", width: 1100, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`${viewport.name} keeps research actions and content accessible`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockResearchDetail(page, { title: veryLongTitle, content: wideTableMarkdown });
    await page.goto("/research/1");
    await expect(page.getByRole("heading", { name: veryLongTitle })).toBeVisible();
    await expect(page.locator(".research-reading-actions__edit")).toBeVisible();
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
    await expect(page.locator(".research-summary-card").first()).toBeVisible();
    const aligned = await page.evaluate(() => {
      const heading = document.querySelector(".research-reading-header h1")!.getBoundingClientRect();
      const articleNode = document.querySelector(".research-document-grid__article")!;
      const article = articleNode.getBoundingClientRect();
      const style = getComputedStyle(articleNode);
      const contentLeft = article.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      return Math.abs(heading.left - contentLeft) < 2;
    });
    expect(aligned).toBe(true);
  });
}

test("comment overlay keeps the article visible behind its translucent backdrop", async ({ page }, testInfo) => {
  await page.goto("/research/1");
  await expect(page.getByRole("heading", { name: note.title })).toBeVisible();
  await page.locator(".research-reading-actions__comments").click();
  const panel = page.locator(".research-responsive-panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".research-document-grid__article")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("comment-overlay.png") });
  await panel.locator(".research-responsive-panel__header button").click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("heading", { name: note.title })).toBeVisible();
});

test("Chinese locale keeps long research actions accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockResearchDetail(page, { title: "一份需要在手机屏幕上完整换行且不能遮挡文稿操作的长期公司研究", content: wideTableMarkdown });
  await page.goto("/research/1");
  await page.getByTestId("language-switcher").click();
  await page.locator('[data-locale-option="zh-CN"]').click();
  await expect(page.locator(".research-reading-actions__edit")).toBeVisible();
  await expect(page.locator(".research-reading-actions__comments")).toContainText("评论");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("missing research shows a localized route-safe failure state", async ({ page }) => {
  await page.route("**/api/v1/notes", (route) => route.fulfill({ json: [] }));
  await page.goto("/research/missing");
  await expect(page.getByRole("heading", { name: "Research unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to research library" })).toBeVisible();
  await expect(page).toHaveURL(/\/research\/missing$/);
});

test("loading research uses a document-shaped reduced-motion skeleton", async ({ page }) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/notes", async (route) => {
    await pending;
    await route.fulfill({ json: [note] });
  });
  const navigation = page.goto("/research/1");
  const skeleton = page.getByRole("status", { name: "Loading research details…" });
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator(".research-detail-loading__title")).toBeVisible();
  await expect(skeleton.locator(".skeleton-block").first()).toHaveCSS("animation-name", "none");
  release?.();
  await navigation;
});

test("broken cover image keeps its figure and can retry", async ({ page }) => {
  let attempts = 0;
  await page.route("https://images.example.test/research-cover.png", async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort("failed");
    else await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+XQAAAABJRU5ErkJggg==", "base64") });
  });
  await mockResearchDetail(page, { cover_image_url: "https://images.example.test/research-cover.png" });
  await page.goto("/research/1");
  const figure = page.locator("[data-research-cover]");
  await expect(figure).toBeVisible();
  const dimensions = await figure.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
  await page.getByRole("button", { name: "Retry image" }).click();
  await expect(page.getByRole("img", { name: "Research cover" })).toBeVisible();
  await expect.poll(() => attempts).toBe(2);
  expect(await figure.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(dimensions);
});

test("empty outline and comment rails stay hidden", async ({ page }) => {
  await mockResearchDetail(page, { content: "A short note without headings.", comments: [] });
  await page.goto("/research/1");
  await expect(page.locator("[data-research-region='outline']")).toBeHidden();
  await expect(page.locator("[data-research-region='annotation-anchors']")).toHaveCount(0);
  await expect(page.locator("[data-research-region='thread']")).toBeHidden();
});

test("research document bar preserves navigation and reveals the compact title", async ({ page }) => {
  await mockResearchDetail(page, { title: "Durable advantage", content: longMarkdown, comments: anchoredComments });
  await page.goto("/research/1");
  const bar = page.getByRole("navigation", { name: "Research document" });
  await expect(bar.getByRole("button", { name: "Back to research library" })).toBeVisible();
  await expect(page.locator(".research-reading-actions__comments")).toHaveAccessibleName("Comments 2");
  await expect(page.locator(".research-reading-actions__more")).toBeVisible();
  await page.locator(".research-reading-actions__more").click();
  await expect(page.getByRole("menuitem", { name: "☆ Star research" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(bar.getByText("Durable advantage", { exact: true })).toBeVisible();
});

test("reading menu opens the created-time control in editing mode", async ({ page }) => {
  await page.goto("/research/1");
  await page.locator(".research-reading-actions__more").click();
  await page.getByRole("menuitem", { name: "Modify created time" }).click();
  await expect(page.getByLabel("Created at")).toBeFocused();
});

test("mobile document actions stay labeled in reading and editing modes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research/1");
  const bar = page.getByRole("navigation", { name: "Research document" });
  await expect(page.locator(".research-reading-actions__comments")).toHaveAccessibleName("Comments 0");
  await page.locator(".research-reading-actions__more").click();
  await expect(page.getByRole("menuitem", { name: "☆ Star research" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".research-reading-actions__edit")).toBeVisible();
  await expect(page.locator(".research-scroll-controls")).toBeVisible();
  await page.locator(".research-reading-actions__edit").click();
  await expect(page.locator(".research-scroll-controls")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Properties" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Done editing" })).toBeVisible();
});

test("first delete selection reveals confirmation without deleting", async ({ page }) => {
  await page.goto("/research/1");
  await page.locator(".research-reading-actions__more").click();
  await page.getByRole("menuitem", { name: "Delete research" }).click();
  await expect(page.getByRole("menuitem", { name: "Confirm delete" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Cancel" })).toBeVisible();
});

test("compact title observer follows the editing title control", async ({ page }) => {
  await mockResearchDetail(page, { content: longMarkdown });
  await page.goto("/research/1");
  const bar = page.getByRole("navigation", { name: "Research document" });
  await page.locator(".research-reading-actions__edit").click();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(bar.getByText("Durable advantage", { exact: true })).toBeVisible();
});

test("new research starts in visual editing mode", async ({ page }) => {
  await page.goto("/research/new");
  await expect(page.getByRole("tab", { name: "Visual" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Research body" })).toHaveAttribute("contenteditable", "true");
});

test("new Markdown research has one responsive edit and preview workflow", async ({ page }, testInfo) => {
  await page.goto("/research/new");
  await page.getByRole("tab", { name: "Markdown" }).click();

  const editor = page.getByRole("region", { name: "Research body" });
  const source = editor.getByRole("textbox", { name: "Research body" });
  await source.fill("# Preview heading\n\n- Revenue is growing\n- Margins are stable");
  await expect(page.getByRole("tab", { name: "Markdown" })).toHaveCount(1);
  await expect(editor.getByRole("heading", { name: "Preview heading" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();

  await expect(editor.getByRole("heading", { name: "Preview heading" })).toBeVisible();
  await expect(editor.getByText("Revenue is growing", { exact: true })).toBeVisible();
  await expect(source).toBeHidden();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(source).toBeVisible();
  await expect(source).toHaveValue(/Preview heading/);
  await expect(editor.getByRole("heading", { name: "Preview heading" })).toHaveCount(0);

  const splitPreview = page.getByRole("button", { name: "Split preview" });
  if (testInfo.project.name === "desktop") {
    await splitPreview.click();
    await expect(page.locator("[data-editor-layout='split']")).toBeVisible();
    await expect(source).toBeVisible();
    await expect(editor.getByRole("heading", { name: "Preview heading" })).toBeVisible();
  } else {
    await expect(splitPreview).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("linked symbols stay compact and can be searched by symbol or company", async ({ page }) => {
  const stocks = [
    { id: 1, symbol: "AAPL", name: "Apple", stage: "radar" },
    { id: 2, symbol: "MSFT", name: "Microsoft", stage: "conviction" },
    ...Array.from({ length: 28 }, (_, index) => ({
      id: index + 3,
      symbol: `TEST${String(index + 1).padStart(2, "0")}`,
      name: `Test Company ${index + 1}`,
      stage: "radar",
    })),
  ];
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: stocks }));
  await page.goto("/research/new");

  const expand = page.getByRole("button", { name: "Expand linked symbols" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("searchbox", { name: "Search by symbol or company name" })).toHaveCount(0);
  await expand.click();

  const search = page.getByRole("searchbox", { name: "Search by symbol or company name" });
  await search.fill("micro");
  await expect(page.getByRole("button", { name: "Toggle linked stock MSFT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle linked stock AAPL" })).toHaveCount(0);
  await search.fill("AAPL");
  await expect(page.getByRole("button", { name: "Toggle linked stock AAPL" })).toBeVisible();

  await search.fill("micro");
  await page.getByRole("button", { name: "Toggle linked stock MSFT" }).click();
  await page.getByRole("button", { name: "Collapse linked symbols" }).click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(page.getByText("$MSFT", { exact: true })).toBeVisible();
  await expect(search).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("AI HTML paste is cleaned and can be undone", async ({ page }) => {
  await page.goto("/research/new");
  const body = page.getByRole("textbox", { name: "Research body" });
  await body.focus();
  await body.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/html", "<h2 style='color:red'>AI thesis</h2><script>alert(1)</script><p><b>Demand</b> improves.</p>");
    clipboard.setData("text/plain", "AI thesis\nDemand improves.");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await expect(page.getByText("Cleaned pasted content")).toBeVisible();
  await expect(body).toContainText("AI thesis");
  await expect(body.locator("script")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo cleaned paste" }).click();
  await expect(body).not.toContainText("AI thesis");
});

test("reading mode skips generated covers and supports rich text outline", async ({ page }, testInfo) => {
  await page.goto("/research/1");
  await expect(page.getByRole("heading", { name: note.title })).toBeVisible();
  await expect(page.locator(".research-detail__cover")).toHaveCount(0);

  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "Risks" }).click();
  } else {
    await page.locator(".research-reading-actions__more").click();
    await page.getByRole("menuitem", { name: "Open outline" }).click();
    await expect(page.getByRole("dialog", { name: "Outline" })).toBeVisible();
    await page.getByRole("button", { name: "Risks" }).click();
  }
  await expect(page.locator("#research-heading-1")).toBeInViewport();
});

test("desktop outline tracks sections while comments stay on demand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockResearchDetail(page, { content: sectionedMarkdown, comments: anchoredComments });
  await page.goto("/research/1");
  await expect(page.getByRole("navigation", { name: "Outline" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Comment thread" })).toHaveCount(0);
  await expect(page.locator(".research-detail__reading-sheet")).toHaveCount(0);
  const articleWidth = await page.locator(".research-document-grid__article").evaluate((article) => Math.round(article.getBoundingClientRect().width));
  expect(articleWidth).toBe(932);
  await page.getByRole("button", { name: "Valuation" }).click();
  await expect(page.locator("#research-heading-2")).toBeInViewport();
  await page.locator(".research-reading-actions__comments").click();
  await expect(page.getByRole("dialog", { name: "Personal notes" })).toBeVisible();
});

test("document controls reach both edges and keep the desktop outline visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockResearchDetail(page, { content: longMarkdown });
  await page.goto("/research/1");
  const topButton = page.getByRole("button", { name: "Back to top" });
  const bottomButton = page.getByRole("button", { name: "Go to bottom" });
  await expect(topButton).toBeDisabled();
  await expect(bottomButton).toBeEnabled();
  await bottomButton.click();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY + window.innerHeight))).toBe(await page.evaluate(() => document.documentElement.scrollHeight));
  await expect(bottomButton).toBeDisabled();
  const outline = page.getByRole("navigation", { name: "Outline" });
  const outlineBox = await outline.boundingBox();
  expect(outlineBox).not.toBeNull();
  // the whole outline rail stays in the right column of the viewport
  expect(outlineBox!.x).toBeGreaterThanOrEqual(0);
  expect(outlineBox!.x + outlineBox!.width).toBeLessThanOrEqual(1440);
  const currentOutlineItem = outline.locator('button[aria-current="location"]');
  // the tracked (current) section item must remain visible even at the very bottom,
  // where the floating action bar changes the scroll geometry
  await expect(currentOutlineItem).toBeInViewport();
  await topButton.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(topButton).toBeDisabled();
});

test("tablet opens outline without narrowing the article", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1000 });
  await mockResearchDetail(page, { content: sectionedMarkdown });
  await page.goto("/research/1");
  await expect(page.getByRole("navigation", { name: "Outline" })).toBeHidden();
  await page.locator(".research-reading-actions__more").click();
  await page.getByRole("menuitem", { name: "Open outline" }).click();
  await expect(page.getByRole("dialog", { name: "Outline" })).toBeVisible();
  const widths = await page.locator(".research-document-grid").evaluate((grid) => ({ grid: grid.getBoundingClientRect().width, article: grid.querySelector<HTMLElement>(".research-document-grid__article")?.getBoundingClientRect().width || 0 }));
  expect(widths.article).toBeGreaterThanOrEqual(widths.grid - 1);
});

test("short reading documents keep their 720px article centered without an outline", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockResearchDetail(page, { content: "# Summary\n\nA concise research note." });
  await page.goto("/research/1");
  const layout = await page.locator(".research-document-grid").evaluate((grid) => {
    const article = grid.querySelector<HTMLElement>(".research-document-grid__article")!;
    const gridBox = grid.getBoundingClientRect();
    const articleBox = article.getBoundingClientRect();
    return { gridLeft: gridBox.left, gridWidth: gridBox.width, articleLeft: articleBox.left, articleWidth: articleBox.width };
  });
  expect(layout.articleWidth).toBeCloseTo(980, 0);
  expect(layout.articleLeft).toBeCloseTo(layout.gridLeft + (layout.gridWidth - layout.articleWidth) / 2, 0);
});

test("editing documents use only the centered 840px article track", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockResearchDetail(page, { content: "# Summary\n\nA concise research note." });
  await page.goto("/research/1");
  await page.locator(".research-reading-actions__edit").click();
  const layout = await page.locator(".research-document-grid.is-editing").evaluate((grid) => {
    const article = grid.querySelector<HTMLElement>(".research-document-grid__article")!;
    const gridBox = grid.getBoundingClientRect();
    const articleBox = article.getBoundingClientRect();
    return { gridLeft: gridBox.left, gridWidth: gridBox.width, articleLeft: articleBox.left, articleWidth: articleBox.width };
  });
  expect(layout.articleWidth).toBeCloseTo(840, 0);
  expect(layout.articleLeft).toBeCloseTo(layout.gridLeft + (layout.gridWidth - layout.articleWidth) / 2, 0);
});

test("rich research preserves safe links", async ({ page }) => {
  await mockResearchDetail(page, { format: "rich", content: '<h2>Sources</h2><p><a href="https://example.com" target="_blank">Primary source</a> <a href="javascript:alert(1)">Unsafe</a></p>' });
  await page.goto("/research/1");
  const safeLink = page.getByRole("link", { name: "Primary source" });
  await expect(safeLink).toHaveAttribute("href", "https://example.com");
  await expect(safeLink).toHaveAttribute("rel", "noreferrer noopener");
  await expect(page.getByText("Unsafe")).not.toHaveAttribute("href", /./);
});

test("lightweight article metadata replaces the decision card", async ({ page }) => {
  await mockResearchDetail(page, {
    kind: "company",
    status: "active",
    confidence: 4,
    next_review_at: "2026-08-01T00:00:00Z",
    series: "AI infrastructure",
    series_id: 7,
    tags: ["moat", "valuation"],
    stock_symbols: ["NVDA"],
  });
  await page.goto("/research/1");

  const meta = page.locator(".research-reading-header__meta");
  await expect(meta).toBeVisible();
  await expect(page.locator(".research-status-pill--kind")).toContainText("Company research");
  await expect(meta).toContainText("min read");
  await expect(page.locator(".research-status-pill")).toContainText(["Active"]);
  await expect(page.locator(".research-reading-header__confidence")).toContainText("4/5");
  await expect(page.locator(".research-review-badge--amber")).toContainText("Review overdue");
  await expect(page.locator(".research-decision-context")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "AI infrastructure" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("desktop outline fades quietly while touch keeps full readability", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockResearchDetail(page, { content: sectionedMarkdown });
  await page.goto("/research/1");
  const outline = page.getByRole("navigation", { name: "Outline" });
  await expect(outline).toHaveAttribute("data-quiet-outline", "true");
  if (testInfo.project.name === "mobile") {
    await expect(outline).toHaveCSS("opacity", "1");
    return;
  }
  await expect(outline).toHaveCSS("opacity", "1");
  await outline.locator("button").first().focus();
  await expect(outline).toHaveCSS("opacity", "1");
});

test("personal notes stay on demand in the document bar", async ({ page }) => {
  await mockResearchDetail(page, { comments: anchoredComments.slice(0, 1) });
  await page.goto("/research/1");
  await expect(page.locator(".research-annotation-toolbar")).toHaveCount(0);
  await page.locator(".research-reading-actions__comments").click();
  await expect(page.getByRole("dialog", { name: "Personal notes" })).toBeVisible();
});

test("known ticker mentions use watchlist values without fabricating data", async ({ page }) => {
  await mockResearchDetail(page, { content: "## Thesis\n\n$NVDA benefits from durable demand. AI stays plain text." });
  await page.goto("/research/1");
  const ticker = page.locator('[data-research-ticker="NVDA"]');
  await expect(ticker).toBeVisible();
  await ticker.getByRole("link").focus();
  const tickerCard = ticker.getByRole("tooltip");
  await expect(tickerCard.getByText("343.20", { exact: true })).toBeVisible();
  await expect(tickerCard.getByText("335.00", { exact: true })).toBeVisible();
  await expect(tickerCard.getByText("380.00", { exact: true })).toBeVisible();
  await expect(page.locator('[data-research-ticker="AI"]')).toHaveCount(0);
  await expect(page.locator(".research-article-prose").getByText(/AI stays plain text/)).toBeVisible();
});

test("linked timestamps keep their real source URL", async ({ page }) => {
  const sourceUrl = "https://www.youtube.com/watch?v=abc&t=99s";
  await mockResearchDetail(page, { content: `## Source\n\nThe segment starts at [01:39](${sourceUrl}).` });
  await page.goto("/research/1");
  const timestamp = page.locator("[data-research-timestamp]");
  await expect(timestamp).toHaveText("01:39");
  await expect(timestamp).toHaveAttribute("href", sourceUrl);
});

test("selected text can become the core thesis for one linked stock", async ({ page }) => {
  let thesisPatch: Record<string, unknown> | null = null;
  await mockResearchDetail(page, { stock_symbols: ["NVDA"] });
  await page.route("**/api/v1/watchlist/stocks/115", async (route) => {
    thesisPatch = route.request().postDataJSON();
    await route.fulfill({ json: { id: 115, symbol: "NVDA", name: "NVIDIA", stage: "strike", ...thesisPatch } });
  });
  await page.goto("/research/1");
  await expect(page.getByText("durable demand matters", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const root = document.querySelector(".note-annotation-scope");
    if (!root) throw new Error("annotation root not found");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text: Node | null = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes("durable demand")) {
        text = walker.currentNode;
        break;
      }
    }
    if (!text) throw new Error("thesis text not found");
    const start = text.textContent?.indexOf("durable demand") || 0;
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + "durable demand".length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Use as core thesis" }).click();
  await expect.poll(() => thesisPatch).toEqual({ thesis: "durable demand" });
  await expect(page.getByText("Core thesis updated", { exact: true })).toBeVisible();
});

test("light theme keeps overdue metadata readable", async ({ page }) => {
  await mockResearchDetail(page, { next_review_at: "2026-08-01T00:00:00Z" });
  await page.goto("/research/1");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await expect(page.locator(".research-review-badge--amber")).toBeVisible();
});

test("real cover follows decision context and no cover leaves no placeholder", async ({ page }) => {
  await mockResearchDetail(page, { cover_image_url: null });
  await page.goto("/research/1");
  await expect(page.locator("[data-research-cover]")).toHaveCount(0);
  await mockResearchDetail(page, { cover_image_url: coverDataUrl });
  await page.reload();
  await expect(page.locator("[data-research-cover]")).toBeVisible();
});

test("selected text stays highlighted while adding a comment", async ({ page }) => {
  await page.route("**/api/v1/notes/1/comments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ json: [] });
      return;
    }
    const payload = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: 9,
        note_id: 1,
        user_id: 1,
        parent_id: null,
        reply_to_user_id: null,
        reply_to_author: null,
        content: payload.content,
        quote_text: payload.quote_text,
        quote_prefix: payload.quote_prefix,
        quote_suffix: payload.quote_suffix,
        start_offset: payload.start_offset,
        end_offset: payload.end_offset,
        block_id: payload.block_id,
        anchor_status: "active",
        reactions: [],
        created_at: "2026-08-10T12:00:00Z",
        updated_at: "2026-08-10T12:00:00Z",
        author: { id: 1, nickname: "You", avatar_url: null },
      },
    });
  });
  await page.goto("/research/1");
  await expect(page.getByText("Recurring revenue supports reinvestment.", { exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const root = document.querySelector(".note-annotation-scope");
    if (!root) throw new Error("annotation root not found");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text: Node | null = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes("Recurring revenue")) {
        text = walker.currentNode;
        break;
      }
    }
    if (!text) throw new Error("annotation text not found");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(17, text.textContent?.length || 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.getByRole("button", { name: "Add comment" })).toBeVisible();
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator("mark.note-annotation-mark.is-pending")).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Comment on this text" });
  await dialog.getByPlaceholder("Write your thought…").fill("Validate retention after earnings 👍");
  await dialog.getByRole("button", { name: "Send comment" }).click();
  await page.locator(".research-reading-actions__comments").click();
  await expect(page.getByRole("dialog", { name: "Personal notes" }).getByText("Validate retention after earnings 👍")).toBeVisible();
  await expect(page.locator("mark.note-annotation-mark").filter({ hasText: "Recurring revenue" })).toBeVisible();
});

test("desktop comment drawer groups anchors and switches context/all", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockResearchDetail(page, { comments: [...anchoredComments.slice(0, 1), { id: 14, note_id: 1, user_id: 1, content: "Standalone review", quote_text: null, parent_id: null, reactions: [], created_at: "2026-08-10T02:00:00Z", author: { id: 1, nickname: "seekdemo" } }] });
  await page.goto("/research/1");
  await expect(page.getByRole("complementary", { name: "Comment thread" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "1 comments on selected text" })).toBeVisible();
  await page.getByRole("button", { name: "1 comments on selected text" }).click();
  const dialog = page.getByRole("dialog", { name: "Personal notes" });
  await expect(dialog.getByText("Recheck after earnings")).toBeVisible();
  await expect(dialog.getByText("Standalone review")).toBeHidden();
  await dialog.getByRole("tab", { name: "All notes" }).click();
  await expect(dialog.getByText("Standalone review")).toBeVisible();
  await dialog.getByText("Standalone review").click();
  await dialog.getByRole("tab", { name: "In context" }).click();
  await expect(dialog.getByText("Standalone review")).toBeHidden();
});

test("mobile document controls leave the first article heading unobstructed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockResearchDetail(page, { content: sectionedMarkdown, comments: anchoredComments.slice(0, 1) });
  await page.goto("/research/1");
  const titleSize = await page.getByRole("heading", { name: "Durable advantage" }).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(titleSize).toBeLessThanOrEqual(30);
  const overlap = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>(".research-mobile-dock")?.getBoundingClientRect();
    const heading = document.querySelector<HTMLElement>(".research-article-prose h1")?.getBoundingClientRect();
    if (!dock || !heading) return false;
    return dock.left < heading.right && dock.right > heading.left && dock.top < heading.bottom && dock.bottom > heading.top;
  });
  expect(overlap).toBe(false);
  const controlsBox = await page.locator(".research-scroll-controls").boundingBox();
  const navigation = page.locator(".mobile-primary-navigation");
  const navigationBox = await navigation.count() ? await navigation.boundingBox() : null;
  expect(controlsBox).not.toBeNull();
  if (navigationBox) expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(navigationBox.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mobile drawer uses the contextual thread and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockResearchDetail(page, { comments: [...anchoredComments.slice(0, 1), { id: 14, note_id: 1, user_id: 1, content: "Standalone review", quote_text: null, parent_id: null, reactions: [], created_at: "2026-08-10T02:00:00Z", author: { id: 1, nickname: "seekdemo" } }] });
  await page.goto("/research/1");
  await expect(page.locator(".research-annotation-layer button")).toBeHidden();
  const trigger = page.locator(".research-reading-actions__comments");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Personal notes" });
  await expect(dialog.getByText("Recheck after earnings")).toBeVisible();
  await expect(dialog.getByText("Standalone review")).toBeHidden();
  await dialog.getByRole("tab", { name: "All notes" }).click();
  await expect(dialog.getByText("Standalone review")).toBeVisible();
  await dialog.getByText("Standalone review").click();
  await dialog.getByRole("tab", { name: "In context" }).click();
  await expect(dialog.getByText("Standalone review")).toBeHidden();
  await dialog.getByRole("button", { name: "Close personal notes" }).last().click();
  await expect(trigger).toBeFocused();
});

test("research surfaces do not overflow the viewport", async ({ page }) => {
  for (const path of ["/research", "/research/1", "/research/new"]) {
    await page.goto(path);
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("reading removes the redundant top bar but retains editing controls", async ({ page }) => {
  await mockResearchDetail(page);
  await page.goto("/research/1");
  await expect(page.locator(".research-reading-actions")).toBeVisible();
  await expect(page.locator(".research-document-bar")).toHaveCount(0);
  await page.locator(".research-reading-actions__edit").click();
  await expect(page.locator(".research-document-bar")).toBeVisible();
});

test("decision overview links every actionable queue into the decision loop", async ({ page }) => {
  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: {
    generated_at: "2026-08-10T00:00:00Z",
    strike_candidates: [{ id: 115, symbol: "NVDA", name: "NVIDIA", current_price: 120, strike_price: 110 }],
    upcoming_events: [],
    due_research: [{ id: 1, title: "Durable company research", kind: "company", status: "active", next_review_at: "2026-08-10T00:00:00Z" }],
    stale_stocks: [],
    incomplete_stocks: [],
    active_plans: [{ id: 4, asset_id: 2, symbol: "MSFT", name: "Microsoft", updated_at: "2026-08-09T00:00:00Z" }],
    unreviewed_transactions: [{ id: 8, asset_id: 2, symbol: "AAPL", name: "Apple", tx_type: "buy", created_at: "2026-08-08T00:00:00Z" }],
  } }));
  await page.route("**/api/v1/watchlist/stocks", (route) => route.fulfill({ json: [{ id: 115, symbol: "NVDA", name: "NVIDIA", stage: "strike" }] }));
  await page.goto("/decision");
  await expect(page.getByText("MSFT · Microsoft")).toBeVisible();
  await expect(page.getByText("AAPL · Apple")).toBeVisible();
  await expect(page.locator('a[href="/assets/2"]')).toBeVisible();
  await expect(page.locator('a[href="/research/new?transaction=8&asset=2"]')).toBeVisible();
});

test("decision guidance is available on demand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/v1/workbench/overview", (route) => route.fulfill({ json: {
    generated_at: "2026-08-16T00:00:00Z",
    strike_candidates: [], upcoming_events: [], due_research: [], stale_stocks: [],
    incomplete_stocks: [], active_plans: [], unreviewed_transactions: [],
  } }));
  await page.goto("/decision");

  const guidance = page.getByRole("heading", { name: "Every plan should answer four questions" });
  await expect(guidance).toBeHidden();
  await page.locator(".decision-guidance summary").click();
  await guidance.scrollIntoViewIfNeeded();
  await expect(guidance).toBeVisible();

  const uncovered = await guidance.evaluate((heading) => {
    const rect = heading.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + 8, rect.top + rect.height / 2);
    return hit === heading || heading.contains(hit);
  });
  expect(uncovered).toBe(true);

  const queueHeight = await page.getByTestId("decision-queue").evaluate((queue) => queue.getBoundingClientRect().height);
  expect(queueHeight).toBeLessThan(400);
});
