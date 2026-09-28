# Markdown-first research experience design

## Goal

Make SeekCost comfortable for an AI-first investment workflow: every long-form investment field accepts Markdown by default, previews it safely, and the private research article page becomes a calm reading surface with reliable anchored comments.

## Scope

Included:

- Explicit cleanup of the `seekdemo` account and all owned demo data, while preserving the database schema and migration history.
- A shared Markdown-first editor and renderer for long-form fields across research, watchlist company dossiers, trade plans, reviews, asset explanations, and research-topic descriptions.
- Rich-text editing remains available where it already exists, but Markdown is the canonical saved representation for newly edited long-form fields.
- Research article detail layout, responsive comment placement, anchored highlighting, replies, reactions, keyboard publishing, and failure recovery.

Excluded:

- Public sharing, discovery, recommendations, creator features, or BLEX integration.
- Full Markdown support for short notes, earnings notes, cash-account notes, or comment replies; these remain lightweight inputs.
- Destructive table/schema deletion or removal of old migrations.

## Product behavior

New long-form content opens in Markdown mode. On desktop, editing and preview are shown side by side; on smaller screens they are tabs. Pasting AI output prefers `text/plain`, preserves Markdown syntax, and falls back to sanitized HTML-to-Markdown conversion only when plain text is unavailable. Saving is explicit, displays unsaved/saving/saved/failed state, and never discards a failed draft.

The renderer supports headings, paragraphs, emphasis, links, blockquotes, ordered/unordered lists, task lists, tables, fenced code blocks, and horizontal rules. Raw HTML and unsafe protocols are not rendered. Links open in a new tab with `rel=noreferrer`.

## Research detail experience

The detail page uses a reading-first article column (760–820px) with title metadata, stock/topic links, status/star actions, reading progress, and a generated heading outline. Desktop uses a sticky annotation rail; tablet collapses the rail; mobile places comments in a bottom drawer/summary. The user can switch between side and bottom views, and the preference is saved with the profile.

Selecting text keeps a warm neutral highlight and shows an “Add comment” action. A created comment keeps its highlight, stores quote/offset/block metadata, and can be opened to locate the source text. Comment cards show quote, content, time, edit/delete ownership actions, emoji reactions, and replies. Unanchored review records remain available in the same list. All comment operations are private and owner-scoped.

## Data cleanup

The cleanup command accepts an explicit username and confirmation flag. It reports counts before and after deletion and executes in one transaction. It deletes dependent rows in this order: comment reactions and comments; note links/favorites/series favorites and notes/topics; watch-stock research/memos/earnings and stocks; asset tags, lots, batch items, allocations, transactions, trade plans, fundings and assets; remaining user-owned finance/import rows; social/share rows referencing the user; then the user row. Missing rows are harmless and the command is idempotent.

## Components and boundaries

- `frontend/src/lib/markdown/`: parser, sanitizer, HTML-to-Markdown clipboard conversion, and shared types.
- `frontend/src/components/MarkdownEditor.tsx`: mode switch, toolbar, paste handling, preview, draft status, and responsive layout.
- `frontend/src/components/MarkdownPreview.tsx`: safe GFM rendering shared by cards and detail pages.
- `frontend/src/app/research/[id]/`: article shell, outline, annotation rail, bottom drawer, and comment cards.
- Existing API content strings remain compatible. Research notes keep their existing `format` field; other long-form endpoints accept Markdown strings without changing short-note contracts.

## Error handling and privacy

Client conversion errors fall back to plain text and show a non-blocking warning. Server save failures preserve the draft and return the editor to an editable state. Comment anchor mismatches mark the comment as unresolved without deleting it. Every research, topic, comment, reaction, and linked-entity request is filtered by `current_user.id`; no historical public content is exposed.

## Verification

- Unit tests cover Markdown block rendering, GFM tables/tasks/code, unsafe HTML/URL removal, HTML-to-Markdown paste conversion, and empty input.
- Backend tests cover the demo cleanup report, dependency order/idempotency, and owner isolation for research comments.
- Playwright covers desktop/tablet/mobile editor layouts, paste/preview switching, failed-save draft retention, article outline, side/bottom comment views, selection highlights, locating comments, replies/reactions, and no horizontal overflow.
- Run backend pytest, frontend ESLint, TypeScript, production build, and the full responsive Playwright suite.
