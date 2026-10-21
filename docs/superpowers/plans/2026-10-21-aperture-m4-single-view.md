# Aperture Redesign — Milestone 4: Single View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a gallery frame opens Aperture's single view. It has:
- a large stage image with "Use ← →" under it;
- a thumbnail rail (on the right on desktop, along the bottom on phones);
- a Grid | Single · n / N pill, a close button, and the gallery title kept bottom-left;
- a shareable `?frame=n` URL.

**Architecture:**
- **Server-rendered dialog.** The dialog markup is rendered by `GalleryView.astro`: one lazy stage `<figure>` and one rail button per frame. Stage images are hidden until shown, so lazy loading fetches only what is viewed.
- **Pure URL helpers.** `src/gallery/frame-param.ts` parses and writes `?frame` and is unit-tested.
- **Controller.** `src/gallery/single.ts` owns open, close and step, the URL (`history.replaceState`), the focus trap and focus return, the live region, swipe, and a manual FLIP from the grid frame to the stage (no Flip plugin).
- **Canvas coordination.** The canvas ignores input while `root.dataset.view === 'single'`.
- **Owner decision:** no film links, so the credit line renders only for frames whose credits include a title, client or roles.

**Spec:** §1 Gallery (single view), §4 Single view, §8 E2E.

## Global Constraints

- No new dependencies. Motion values come from `tokens.ts`. Under reduced motion there's no FLIP: the view opens instantly.
- `history.replaceState` only (the spec says so), so Back leaves the gallery. Without JS, `?frame=n` links simply reload the grid.
- Dialog: `role="dialog"`, `aria-modal="true"`, and `aria-label` set to the gallery name. Focus moves to Close on open, Tab is trapped, Escape closes, and focus returns to the frame that was opened.
- The live region announces `t('single.position')` with `{n}` and `{total}` filled in.
- All suites stay green after each task. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `frame-param.ts`

- `parseFrame(search: string, count: number): number | null` accepts only a whole number from 1 to `count`. Anything else returns `null`.
- `withFrame(href: string, n: number | null): string` returns path, search and hash, with `frame` set or removed and every other parameter and the hash kept.
- Tests are in `tests/unit/frame-param.test.ts`. Each of these cases must hold:

| Input | Expected |
| --- | --- |
| `parseFrame('?frame=3', 7)` | 3 |
| `parseFrame('?frame=0', 7)` | null |
| `parseFrame('?frame=8', 7)` | null |
| `parseFrame('?frame=2.5', 7)` | null |
| `parseFrame('?frame=abc', 7)` | null |
| `parseFrame('', 7)` | null |
| `parseFrame('?a=1&frame=7', 7)` | 7 |
| `withFrame('https://x/work/p/?a=1#h', 4)` | `/work/p/?a=1&frame=4#h` |
| `withFrame('https://x/work/p/?frame=4', null)` | `/work/p/` |

Commit: `feat(m4): ?frame URL helpers`.

### Task 2: Single-view markup and styles

In `GalleryView.astro`:
- Add the grid-mode pill `.gallery__toggle`, which holds "Grid" (current) and a `button[data-open]` labelled "Single".
- Add the dialog `[data-single][hidden]` with the parts listed under Interfaces.
- Add these translation keys:

| Key | en | fr | de |
| --- | --- | --- | --- |
| `single.close` | Close | Fermer | Schließen |
| `single.grid` | Grid | Grille | Raster |
| `single.single` | Single | Image | Einzeln |
| `single.hint` | Use ← → | Utilisez ← → | Mit ← → blättern |
| `single.frame` | Frame | Image | Bild |
| `single.position` | {n} of {total} | {n} sur {total} | {n} von {total} |

The build test (in `tests/build/galleries.test.ts`) checks that the dialog exists with role, aria-modal and aria-label, that there are 7 stage figures and 7 rail buttons on `/work/portrait/`, and that there's no film link anywhere.

Commit: `feat(m4): single view markup`.

### Task 3: `single.ts` controller, wiring, and browser tests

**Interfaces:**
- `mountSingle(root: HTMLElement): () => void` is mounted and torn down beside `mountCanvas` in the gallery script, on every device.
- The dialog parts it relies on:
  - `[data-single]` with `data-position`
  - `[data-single-frame=n]`
  - `[data-goto=n]`
  - `[data-close]`
  - `[data-count]`
  - `[data-live]`
  - `[data-stage]`
- The grid pill's `[data-open]` button opens frame 1.

Browser tests in `tests/e2e/single.spec.ts`:
1. Clicking a frame opens the dialog, shows `?frame=n` and the counter "n / 7", shows that frame's alt text on the stage, and puts focus on Close.
2. The arrow keys step and wrap from 7 to 1, and the URL follows.
3. Clicking a rail thumbnail jumps to that frame and moves `aria-current`.
4. Escape closes, clears the query, and returns focus to the opened frame's link.
5. The deep link `?frame=3` opens directly. `?frame=99` and `?frame=abc` stay on the grid.
6. The live region reads "3 of 7".
7. Tab stays inside the dialog.
8. While single view is open, the canvas offset doesn't change under the arrow keys or the wheel.
9. Phone: a tap opens the view and a swipe left moves to the next frame.
10. Reduced motion: the stage image has no transform 50 ms after opening.
11. Navigating away with the view open, then back, leaves it closed.

Then do a single round of screenshots at 1440 and 375px, and fix what it shows.

Commit: `feat(m4): single view with rail, keys, swipe, deep links and focus handling`.
