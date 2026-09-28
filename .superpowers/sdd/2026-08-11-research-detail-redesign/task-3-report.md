# Task 3 report

Implemented the slot-based `ResearchDetailView` and replaced the reading-sheet card with the responsive document grid. Desktop uses outline/article/annotation-anchor/thread regions; tablet and mobile collapse the fixed outline in favor of the existing outline drawer. Outline navigation now accounts for the 88px document bar, honors reduced-motion preferences, tracks the 112px heading threshold, and exposes `aria-current="location"`.

Markdown and rich HTML previews share the `research-article-prose` typography, including headings, links, quotes, lists, tables, code, images, and captions. Rich HTML sanitization now preserves safe table and figure markup, with narrow-screen table scrolling.

Verification:

- `npx tsc --noEmit`
- `npm run lint -- --no-cache`
- `npx playwright test e2e/research-document-experience.spec.ts --project=desktop --project=tablet` (28 passed)

No known blockers.

## Fix round 1

Resolved the review findings in the Task 3 document redesign work.

- Added desktop grid/outline and 1024–1279px outline drawer Playwright coverage, using the localized accessible label `Outline` / `目录` for navigation and dialogs.
- Kept the responsive outline trigger and drawer available below 1280px, including tablet widths; the document article remains full-width while the drawer is open.
- Let editing use an 840px article grid track while reading retains the 760px track.
- Rendered the annotation-anchor rail only for real quoted comments, connecting each anchor button to the corresponding rendered text anchor rather than leaving a blank slot.
- Localized the annotation-region accessibility label, removed the nested `main` landmark, and removed the annotation toolbar’s negative margins.
- Preserved safe `http`, `https`, root-relative, hash, and query links in rich HTML across the browser DOM and SSR sanitizer paths. Unsafe `javascript:` and `data:` protocols remain non-links.
- Corrected the inherited partial edit’s unmatched JSX closing tags in the selection-comment dialog; this had prevented the research page from compiling.

Files changed:

- `frontend/e2e/research-document-experience.spec.ts`
- `frontend/src/app/globals.css`
- `frontend/src/app/notes/page.tsx`
- `frontend/src/app/research/[id]/ResearchCommentDrawer.tsx`
- `frontend/src/app/research/[id]/ResearchCommentRail.tsx`
- `frontend/src/app/research/[id]/ResearchDetailView.tsx`
- `frontend/src/app/research/[id]/ResearchOutline.tsx`
- `frontend/src/lib/i18nResearch.ts`

Verification commands and output:

- `cd frontend && npx tsc --noEmit` — passed.
- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "desktop outline tracks|tablet opens outline|rich research preserves safe links" --project=desktop --project=tablet` — 6 passed.
- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --project=desktop --project=tablet` — 34 passed.
- `cd frontend && npm run lint -- --no-cache` — passed.
- `cd frontend && npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Concerns: The sanitizer’s SSR fallback deliberately preserves only the safe anchor attributes it can validate (`href`, and `_blank` with enforced `rel`); formatting-only anchor attributes are intentionally removed to keep SSR/browser behavior safe and consistent.

## Fix round 2

Resolved the follow-up grid specificity issue. Editing documents now use a centered single 840px track, while outline-free reading documents use a centered single 760px track; outlined reading documents retain the four-region desktop grid. Added focused width/position assertions for both no-outline states.

Files changed:

- `frontend/src/app/globals.css`
- `frontend/e2e/research-document-experience.spec.ts`

Verification:

- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "short reading documents|editing documents use" --project=desktop` — 2 passed.
- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --project=desktop --project=tablet` — 38 passed.
- `cd frontend && npm run lint -- --no-cache` — passed.
- `cd frontend && npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Concerns: none known.
