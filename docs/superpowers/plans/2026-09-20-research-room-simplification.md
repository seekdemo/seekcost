# Research Room Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox tracking.

**Goal:** Reduce cognitive load and make mobile writing reachable in the first screen without sacrificing evidence or independent research.

**Architecture:** Keep existing persistence and authentication unchanged. Split the question editor into a focused component, use progressive disclosure and independent-mode accordions. Scope mobile navigation simplification to individual research rooms, not the rest of the platform.

**Tech Stack:** React, Next.js 16, CSS modules, Playwright.

## Global Constraints

- Preserve dirty worktree and research records; no commit or account mutations.
- Guided/independent modes still share answers; independent sections may be opened in any order.
- Mobile at 390×844: first answer starts before y=450; no document overflow at 360/390/834/1440 widths.
- One save action and one next/preview action; no floating controls covering the keyboard or text.
- Explanations, counterarguments and evidence remain accessible with keyboard and touch.
- Keep explicit confirmation and private versioned judgment cards.
- Execute inline as sequential UI work; executing-plans skill unavailable.

### Task 1: Regression criteria

Files: frontend/e2e/guided-research.spec.ts.

- [x] Add assertion `expect((await answer.boundingBox())!.y).toBeLessThan(450)` on mobile and test optional sections collapsed initially. Run targeted Playwright before changes and observe failure.
- [x] Adapt mode tests to open the financials accordion, expand uncertainty only when editing, verify state after reload and failed save, and test mobile question picker.

### Task 2: Focused workspace

Files: frontend/src/app/research/guide/GuideRoom.tsx, GuideQuestion.tsx, guide.module.css, page.tsx; frontend/src/components/Navbar.tsx.

Interface: GuideQuestion receives question/answer/existing evidence/mode/onChange; persistence remains GuideDraft and existing API methods.

- [x] Compact header, one mode switch, desktop sidebar and mobile native select using `value={draft.step}` and existing `navigate(Number(event.target.value))`.
- [x] Keep primary answer visible; use details for help, uncertainty and evidence. Independent mode uses named details summaries and retains hidden field state.
- [x] Move save status and the single save button beside next/preview below editor; simplify card preview into read-only sections with optional sources.
- [x] Company picker becomes a searchable compact list instead of marketing hero and large cards.
- [x] Hide mobile secondary/bottom site navigation only for `/research/guide/[id]`; keep the site header and explicit back link. Remove double page padding scoped to the room.

### Task 3: Verification

- [x] Run TypeScript, targeted ESLint, production build and six existing browser scenarios plus new layout cases.
- [x] Capture and inspect viewport screenshots for mobile and desktop, light and dark; check 360px and tablet widths and bottom actions for overlap.
- [x] Update docs/GUIDED_RESEARCH.md and record results here. No backend or database changes.

## Verification — 2026-09-21

- Before change, mobile first-answer position failed the new layout assertion at y=888. After redesign, actual demo mobile first-answer position was approximately y=400; full editor and primary action fit a 390×844 screen with optional panels closed.
- 12 browser tests passed across desktop/tablet/mobile. Coverage includes 360px light theme, optional fields, independent accordions, persisted mode/answers, failed saves, safe URLs, confirmed cards, mobile question selection and restoring site navigation on exit.
- TypeScript, targeted ESLint and production webpack build passed. Screenshot inspection completed for desktop light/dark and mobile dark; read-only live captures at 360/390/834/1440 widths report no document overflow.
- Final screenshots: frontend/test-results/final-redesign-mobile.png, final-redesign-narrow-light.png, final-redesign-tablet.png, final-redesign-desktop-light.png, final-redesign-picker-mobile.png (ignored artifacts).
- No backend/database edits during this redesign; existing unsaved implementation and user records preserved. No commit or push.
