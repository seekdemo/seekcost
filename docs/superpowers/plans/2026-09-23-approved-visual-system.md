# Approved visual system v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline; unavailable, execute sequentially.

**Goal:** Implement approved A+ cockpit and shared restrained visual language across existing screens.
**Architecture:** Shared CSS tokens/components unify headers, surfaces, controls and tables. Cockpit removes duplicate metrics, emphasizes entry lane, supports collapse and concise monitoring. No strategy or market-data logic changes.
**Tech Stack:** React/Next.js, CSS, Playwright.

## Constraints
- Preserve user theme preference; light adopts approved white/green, dark retains accessible state colors.
- No fabricated DELL signal: show actual returned evidence and counts.
- No live database mutations, no commit. Preserve previous uncommitted work.

## Steps
- [ ] Shared `visual-system.css` imported from layout: light tokens, 28px/18px headers, restrained shadows, 44px touch controls, tables and focus rings. Applies workbench, decision, quant, tools and shared forms.
- [ ] Cockpit: remove repeated metric strip, state-colored expandable lane headers, 1.4fr entry column, concise monitored rows with keyboard/touch accessible details; consolidate metadata in footer.
- [ ] Preserve intraday loading/error handling while refining header, price hierarchy and list spacing.
- [ ] Run TypeScript, cockpit/alerts regression, production build and live multi-page 390/1440 screenshots; inspect for overflow and console exceptions.

## Delivery verification — 2026-09-24

All implementation steps above completed. Cockpit has structural redesign; other routes receive shared visual treatment, not a full workflow rewrite.

- TypeScript and targeted lint passed; production webpack build passed.
- Nine targeted browser checks passed across desktop/tablet/mobile (cockpit, tool collection, inline quotes); cockpit rerun passed all three after price/compact-lane refinements.
- Updated the older personal-decision-loop regression for removal of redundant metrics; three live viewport checks passed without data writes.
- Live `/`, `/decision`, `/watchlist`, `/tools`, `/quant` captured at 1440px and 390px: no horizontal overflow or page exceptions. Screenshots saved to `/tmp/seekcost-approved-*.png`.
- Inspected cockpit desktop/mobile, decision desktop and watchlist mobile. Follow-up refinements reduce watchlist shadow, normalize row dividers and compact empty mobile lanes.
- Actual signals and theme preferences preserved; no database changes or commit. This verification covers UI regression, not load testing or external quote-provider availability.
