# Aperture Redesign — Milestone 7: Quality Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the spec §8 quality gates against the finished site, and fix what fails.

**Tooling note:** The Playwright, Chrome DevTools and AccessLint MCP servers were installed this session but are not loaded until Claude Code restarts. Equivalent checks run through the project's own Playwright:
- **axe-core**, the engine AccessLint wraps, is injected from cdnjs at test time only. It is never a dependency and never shipped.
- **Performance** is measured with PerformanceObserver (LCP, CLS) and Event Timing (INP proxy), under CDP CPU and network throttling, against the production build (`astro preview`), not the dev server.

## Tasks

### 1. JavaScript budgets as build tests

`tests/build/budgets.test.ts` takes, for each page, the closure of `<script type="module">` entries and their static imports in `dist/` (gzip):
- home, about and privacy: at most 90 kB;
- gallery: at most 125 kB;
- every page: at most 125 kB.

### 2. Accessibility (WCAG 2.2 AA)

`tests/e2e/a11y.spec.ts` injects axe-core 4.10 and runs the `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` tags on:
- `/`, `/work/portrait/` (grid), `/work/portrait/?frame=3` (single view), `/about/`, `/de/privacy/`;
- at 1440px and at 375px with touch.

It expects zero violations. Fix every finding at its source.

### 3. Performance

`scripts/perf.mjs` runs against `astro preview` with a mid-range mobile profile:
- 375×812 viewport, 4× CPU slowdown;
- network at 1.6 Mbps down and 750 kbps up, with 150 ms RTT.

For `/`, `/work/portrait/` and `/about/`, it reports LCP, CLS and a click-to-paint INP proxy.

Budgets: LCP under 2.5 s, CLS under 0.05, INP under 200 ms. Fix any miss.

### 4. Worst-case content (`break-ui`)

Follow `.claude/skills/break-ui`, then cover in `tests/e2e/stress.spec.ts`:
- a 40-character German gallery title at 375px and 1440px;
- a gallery reduced to one frame, with the canvas re-mounted;
- a gallery of 60 frames;
- long credits in single view.

The checks: no horizontal overflow, no collision with the controls, and the canvas still endless and draggable.

### 5. Design review

Run `/impeccable critique` and `audit` on every page type, then the `web-design-guidelines` pass on the changed files. Fix material findings within scope.

### 6. Final screenshots and handoff

Take screenshots of every page type at 375, 768 and 1440px. Then use `superpowers:finishing-a-development-branch`: present the merge options to the owner, and do not merge or push without their choice.
