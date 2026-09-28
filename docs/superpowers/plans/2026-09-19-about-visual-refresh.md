# About Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give About a distinctive, readable editorial design without losing administrator-controlled copy or privacy disclosures.

**Architecture:** Share the redesigned AboutStoryView with the administrator preview. Use scoped CSS and semantic text components, not bitmap decoration. Remove duplicate legacy position/capability sections; retain decision loop, disclosures and footer navigation.

**Tech Stack:** Existing Next.js/React, CSS custom properties, Playwright.

## Completion — 2026-09-19

Both tasks completed. Desktop (1440px), tablet (834px), and mobile (390px) Chromium screenshots were inspected, including dark Chinese and light English views. Fixed Chinese phrase wrapping and prevented value-card numbers from shrinking onto two lines. Administrator text, publication workflow, authorization, and disclosures are preserved.

Verification: 28 Playwright tests passed, 2 intentionally skipped duplicate route checks; TypeScript and production webpack build passed; git diff whitespace check passed; /about returned HTTP 200. The first run had one Guide navigation timeout; rerunning the complete suite passed without changing the Guide or its test.

## Global Constraints

- No changes to database content, privileges, public APIs or other page designs.
- Render administrator content as text; preserve paragraph and newline support.
- Maintain English/Chinese, 390px mobile layout, keyboard access, existing guide links and disclosures.
- Execute inline; executing-plans is unavailable. Preserve existing dirty worktree; no commit.

### Task 1: Editorial layout and shared preview

Files: frontend/src/components/AboutStory.tsx, frontend/src/components/AboutStory.css, frontend/src/app/about/AboutContent.tsx.

- [ ] Add a split hero with editable title/intro and four decision questions; render mission as editorial prose, values as numbered cards, roadmap as a timeline. Parse blocks using `text.split(/\n\s*\n/).filter(Boolean)`; a block's first line becomes its heading only when a subsequent line exists.
- [ ] Scope rules under `.about-story` and `.about-editorial`; use `grid-template-columns: minmax(0,1.5fr) minmax(0,1fr)` on desktop, `1fr` below 760px. Use theme variables and `overflow-wrap:anywhere` for editable text.
- [ ] Remove repeated legacy position/capability markup while keeping loop/disclosure strings and links exercised by existing tests.

### Task 2: Verify visuals and functionality

Files: frontend/e2e/about-visual.spec.ts; existing product-info/site-content tests.

- [ ] Check `expect(page.getByTestId('about-story')).toBeVisible()` and `document.documentElement.scrollWidth <= innerWidth` at 1440/834/390px. Capture top and section screenshots, inspect actual Chinese content and a light-theme case.
- [ ] Run `npx playwright test e2e/about-visual.spec.ts e2e/product-info.spec.ts e2e/site-content.spec.ts`, `npx tsc --noEmit`, and `npx next build --webpack`. Verify no content/authorization regression and inspect desktop/mobile screenshots before handing off.
