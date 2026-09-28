# README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public documentation accurately describe the current clean release repository and optional demo setup.

**Architecture:** Keep product and setup documentation in the bilingual root READMEs. Update the linked release checklist and self-hosting notice so they do not contradict the README. Do not change application code or local data.

**Tech Stack:** Markdown, Git.

## Global Constraints

- Current `devel` history has one release commit; do not claim that the old repository's historical paths exist in this repository.
- The SQLite database and source CSV files are not tracked; do not present local demo data counts as repository fixtures.
- `demo/demo123` applies only to an explicitly provisioned isolated local instance, not fresh clones.

---

### Task 1: Refresh bilingual README demo and product descriptions

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`

**Interfaces:**
- Consumes: `backend/app/core/demo_data.py`, `frontend/src/app/research/guide/page.tsx`, repository history.
- Produces: matching English and Chinese setup, demo, and feature descriptions.

- [x] **Step 1: Remove local-instance-specific count claims**

Replace the 346-entry statement with an explanation that watchlist data lives in the operator's database and is not cloned from Git.

- [x] **Step 2: Clarify demo provisioning and optional fixture import**

Keep the intentionally public local trial credential, state that it is absent from new installations, and retain the opt-in seed instructions.

- [x] **Step 3: Align the bilingual product tour**

Add the company research workflow to the English tour with the existing `docs/GUIDED_RESEARCH.md` link.

- [x] **Step 4: Remove obsolete historical release blockers**

Replace old-history warnings with a scoped statement that the current public branch is a new single-commit release; keep the ongoing secret/data audit guidance.

### Task 2: Align linked release guidance

**Files:**
- Modify: `OPEN_SOURCE_CHECKLIST.md`
- Modify: `docs/SELF_HOSTING.md`

**Interfaces:**
- Consumes: current Git history and ignore rules.
- Produces: guidance consistent with the public README.

- [x] **Step 1: Mark the old-history note as superseded**

Describe the one-commit release and preserve a reminder to audit files, credentials, screenshots and future commits.

- [x] **Step 2: Remove the self-hosting publication blocker**

Keep the Docker/PostgreSQL restore caveat, but link to the current release checklist without claiming an old-history blocker.

- [x] **Step 3: Validate Markdown references and repository status**

Run `git diff --check`, inspect the diff, and verify the README links resolve locally.
