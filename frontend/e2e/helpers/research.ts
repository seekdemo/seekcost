import type { Page } from "@playwright/test";

export const longMarkdown = Array.from({ length: 24 }, (_, index) =>
  `## Section ${index + 1}\n\nEvidence and reasoning for this section.`
).join("\n\n");
export const sectionedMarkdown = "# Summary\n\nText\n\n## Business\n\nText\n\n## Valuation\n\nText";
export const wideTableMarkdown = "| Metric | 2024 | 2025 | 2026 |\n|---|---:|---:|---:|\n| Revenue | 1 | 2 | 3 |";
export const veryLongTitle = "A deliberately long research title that must wrap without hiding actions on smaller screens";
export const coverDataUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='525'%3E%3Crect width='1200' height='525' fill='%232f5f62'/%3E%3C/svg%3E";
export const anchoredComments = [
  { id: 11, note_id: 1, user_id: 1, content: "Recheck after earnings", quote_text: "durable demand", quote_prefix: "", quote_suffix: " matters", start_offset: 0, end_offset: 14, parent_id: null, reactions: [], created_at: "2026-08-10T00:00:00Z", author: { id: 1, nickname: "seekdemo" } },
  { id: 12, note_id: 1, user_id: 1, content: "Add current evidence", quote_text: "durable demand", quote_prefix: "", quote_suffix: " matters", start_offset: 0, end_offset: 14, parent_id: null, reactions: [], created_at: "2026-08-10T01:00:00Z", author: { id: 1, nickname: "seekdemo" } },
];

const baseResearch = {
  id: 1, user_id: 1, title: "Durable advantage",
  content: "# Summary\n\ndurable demand matters", format: "markdown",
  visibility: "private", kind: "thesis", status: "active", confidence: 3,
  next_review_at: null, starred: false, cover_image_url: null, cover_color: null,
  allow_comments: true, stock_symbols: [], knowledge_tags: [], tags: [],
  series: null, series_id: null, links: [], comment_count: 0,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
};

export async function mockResearchDetail(page: Page, overrides: Record<string, unknown> = {}) {
  const { comments = [], ...noteOverrides } = overrides;
  const note = { ...baseResearch, ...noteOverrides, comment_count: Array.isArray(comments) ? comments.length : 0 };
  await page.route("**/api/v1/watchlist/stocks", route => route.fulfill({ json: [{
    id: 115,
    symbol: "NVDA",
    name: "NVIDIA",
    stage: "strike",
    current_price: 343.2,
    strike_price: 335,
    fair_price: 360,
    target_price: 380,
    thesis: "Accelerated computing demand remains durable.",
  }] }));
  await page.route("**/api/v1/notes**", route => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes/1", route => route.fulfill({ json: note }));
  await page.route("**/api/v1/notes/1/comments", route => route.fulfill({ json: comments }));
  await page.route("**/api/v1/notes/series", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/favorites", route => route.fulfill({ json: { note_ids: [], series: [] } }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "e2e-token");
    localStorage.setItem("seekcost:locale", "en");
  });
}

export async function mockEditableResearch(page: Page, options: Record<string, unknown> = {}) {
  const { failNextPatch = false, ...noteOptions } = options;
  let failPatch = failNextPatch === true;
  let note = { ...baseResearch, ...noteOptions };
  await mockResearchDetail(page, note);
  await page.route("**/api/v1/notes/1", async route => {
    if (route.request().method() === "PATCH") {
      if (failPatch) return route.fulfill({ status: 500, json: { detail: "save failed" } });
      note = { ...note, ...route.request().postDataJSON(), updated_at: new Date().toISOString() };
    }
    await route.fulfill({ json: note });
  });
  return { allowPatches: () => { failPatch = false; } };
}
