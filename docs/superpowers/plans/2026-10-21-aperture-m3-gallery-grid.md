# Aperture Redesign — Milestone 3: Gallery Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each gallery Aperture's endless drag canvas on desktop: images only, a large title bottom-left, a back button bottom-right, and a "Drag to explore" hint. On touch and without JavaScript it falls back to a staggered two-column grid with native scrolling.

**Architecture:**
- **Progressive enhancement.** The server renders an accessible two-column grid of frame links. On fine-pointer devices, `mountCanvas()` adds `.is-canvas` and positions the same `<li>` elements with transforms.
- **Pure layout code.** The positions come from `scatter()`, and the endless wrap from `wrapInto()`. Both are pure and unit-tested.
- **Input.** GSAP's Observer (4 kB) handles pointer drag and wheel. A per-tick follow ease gives the glide, and release velocity gives the throw. This deliberately replaces the spec's Draggable + InertiaPlugin (about 17 kB).
- **Own lifecycle.** The canvas lives outside the motion engine (`astro:page-load` mount, `astro:before-swap` destroy), because dragging must work under reduced motion too, where the engine does nothing.

**Tech Stack:** Astro 5, plain CSS, GSAP 3.15 core + Observer, Vitest, Playwright.

**Spec:** §1 Gallery, §3 Components, §4 Gallery grid. The deviation (Observer instead of Draggable + Inertia) is recorded in this plan.

## Global Constraints

- No new npm dependencies. Plain CSS. Motion values come from `tokens.ts` (`DRAG` is new).
- The resting DOM (no JS) is a complete, usable gallery. JS only enhances.
- **Reduced motion:** the canvas still mounts and drags 1:1, with no glide and no throw.
- **Touch** (no `(hover: hover) and (pointer: fine)`): the canvas never mounts.
- The canvas cleans up everything it creates (Observer, ticker callback, listeners, inline styles) on destroy.
- `window.__gallery = { observers(): number; mounted(): boolean }` is the test hook.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. All suites stay green after every task.

---

### Task 1: `scatter()` and `wrapInto()`

**Files:** Create `src/gallery/scatter.ts` and `src/gallery/wrap.ts`. Test `tests/unit/scatter.test.ts` and `tests/unit/wrap.test.ts`.

**Interfaces (produced):**
- `interface Placed { x: number; y: number; w: number; h: number }`
- `interface Tile { width: number; height: number; placed: Placed[] }`
- `scatter(aspects: number[], opts: { cell: number; seed: number; minWidth?: number; minHeight?: number }): Tile`
  - Frames sit one per cell of a jittered grid, inside a margin of `cell * 0.1`. That guarantees no overlap and a gap of at least `cell * 0.2`.
  - Cells are added (left empty) until the tile is at least `minWidth × minHeight`.
  - Frame sizes keep the image's aspect ratio, and the long side is at most `cell * 0.8`.
  - Output is deterministic for a given seed.
- `wrapInto(value: number, min: number, max: number): number` maps a value into `[min, max)`.

- [ ] **Step 1: Failing tests.**

`tests/unit/wrap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wrapInto } from '../../src/gallery/wrap';

describe('wrapInto', () => {
  it('leaves values inside the range alone', () => expect(wrapInto(5, 0, 10)).toBe(5));
  it('wraps values past the end', () => expect(wrapInto(23, 0, 10)).toBe(3));
  it('wraps negative values', () => expect(wrapInto(-3, 0, 10)).toBe(7));
  it('includes min and excludes max', () => {
    expect(wrapInto(0, 0, 10)).toBe(0);
    expect(wrapInto(10, 0, 10)).toBe(0);
  });
  it('works for ranges that start below zero', () => expect(wrapInto(-150, -100, 300)).toBe(250));
});
```

`tests/unit/scatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scatter, type Placed } from '../../src/gallery/scatter';

const CELL = 380;
const overlap = (a: Placed, b: Placed, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const aspects = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.66, 1, 0.8, 1.78][i % 5]);

describe('scatter', () => {
  it.each([1, 6, 7, 60])('places %i frames with no overlaps and a clear gap', (n) => {
    const { placed } = scatter(aspects(n), { cell: CELL, seed: 3 });
    expect(placed).toHaveLength(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) expect(overlap(placed[i], placed[j], CELL * 0.2 - 0.001), `${i}/${j}`).toBe(false);
  });

  it('keeps every frame inside the tile', () => {
    const tile = scatter(aspects(13), { cell: CELL, seed: 9 });
    for (const p of tile.placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(tile.width);
      expect(p.y + p.h).toBeLessThanOrEqual(tile.height);
    }
  });

  it("keeps each image's aspect ratio and caps its long side", () => {
    const a = aspects(10);
    scatter(a, { cell: CELL, seed: 1 }).placed.forEach((p, i) => {
      expect(p.w / p.h).toBeCloseTo(a[i], 2);
      expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(CELL * 0.8 + 0.001);
    });
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = scatter(aspects(7), { cell: CELL, seed: 42 });
    expect(scatter(aspects(7), { cell: CELL, seed: 42 })).toEqual(a);
    expect(scatter(aspects(7), { cell: CELL, seed: 43 })).not.toEqual(a);
  });

  it('grows the tile with empty cells until it covers the requested area', () => {
    const tile = scatter(aspects(2), { cell: CELL, seed: 5, minWidth: 1800, minHeight: 1260 });
    expect(tile.width).toBeGreaterThanOrEqual(1800);
    expect(tile.height).toBeGreaterThanOrEqual(1260);
    expect(tile.width % CELL).toBe(0);
  });
});
```

- [ ] **Step 2: Run them.** Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement.**

`src/gallery/wrap.ts`:

```ts
/** `value` mapped into [min, max): the position an endlessly repeating item shows at. */
export function wrapInto(value: number, min: number, max: number): number {
  const span = max - min;
  return ((((value - min) % span) + span) % span) + min;
}
```

`src/gallery/scatter.ts`:

```ts
export interface Placed { x: number; y: number; w: number; h: number }
export interface Tile { width: number; height: number; placed: Placed[] }

interface ScatterOptions {
  cell: number;
  seed: number;
  minWidth?: number;
  minHeight?: number;
}

/** mulberry32: small, fast, good enough for layout jitter, and reproducible. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A jittered grid: one frame per cell, each kept `cell * 0.1` inside its cell's
 * edges, so frames never overlap and always keep a gap. Extra cells stay empty,
 * which is what makes the canvas feel sparse and endless rather than tiled.
 */
export function scatter(aspects: number[], { cell, seed, minWidth = 0, minHeight = 0 }: ScatterOptions): Tile {
  const rand = random(seed);
  const n = aspects.length;
  let cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)), Math.ceil(minWidth / cell));
  let rows = Math.max(1, Math.ceil(n / cols), Math.ceil(minHeight / cell));
  // Leave roughly a third of the cells empty so the canvas breathes.
  while (cols * rows < Math.ceil(n * 1.5)) cols * cell <= rows * cell * 1.6 ? cols++ : rows++;

  const cells = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const margin = cell * 0.1;
  const room = cell - 2 * margin;
  const placed = aspects.map((aspect, i) => {
    const long = room * (0.72 + rand() * 0.28);
    const w = aspect >= 1 ? long : long * aspect;
    const h = aspect >= 1 ? long / aspect : long;
    const c = cells[i];
    const x = (c % cols) * cell + margin + rand() * (room - w);
    const y = Math.floor(c / cols) * cell + margin + rand() * (room - h);
    return { x, y, w, h };
  });

  return { width: cols * cell, height: rows * cell, placed };
}
```

The longest side is `room * ≤1 = cell * 0.8`, which satisfies the cap.

- [ ] **Step 4: Run all suites.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(m3): scatter layout and wrap math for the gallery canvas`.

---

### Task 2: Gallery markup, an images-only grid, and the touch/no-JS layout

**Files:** Modify `src/views/GalleryView.astro`, `src/i18n/translations.ts`, `tests/build/image-pipeline.test.ts` (only if its selector breaks), and `tests/build/galleries.test.ts`.

**Interfaces (produced, used by Task 3):**
- `main.gallery[data-gallery][data-seed][data-lenis-prevent]`
- `ol.gallery__frames > li[data-frame][data-aspect] > a.gallery__frame[href="?frame=n"] > img[draggable=false]`
- `.gallery__title` (h1 + years), `a.gallery__back[aria-label]` and `p.gallery__hint[aria-hidden]`
- Translation keys `gallery.drag` and `gallery.back`

- [ ] **Step 1: Failing build test.** Append to `tests/build/galleries.test.ts`:

```ts
describe('gallery markup', () => {
  const html = () => readFileSync('dist/work/portrait/index.html', 'utf8');

  it('shows images only: no captions in the grid', () => {
    expect(html()).not.toContain('<figcaption');
  });

  it('every frame is a link to its single view and carries its aspect ratio', () => {
    const frames = [...html().matchAll(/<li data-frame="(\d+)" data-aspect="([\d.]+)"[^>]*>\s*<a class="gallery__frame" href="\?frame=(\d+)"/g)];
    expect(frames.length).toBe(7);
    for (const f of frames) expect(f[1]).toBe(f[3]);
  });

  it('has a back link home, a drag hint hidden from screen readers, and lets the canvas own the wheel', () => {
    expect(html()).toMatch(/<a class="gallery__back" href="\/" aria-label="Back to all work"/);
    expect(html()).toMatch(/<p class="gallery__hint eyebrow" aria-hidden="true"/);
    expect(html()).toMatch(/<main[^>]*data-gallery[^>]*data-lenis-prevent/);
  });
});
```

- [ ] **Step 2: Run it.** Run `npm run build && npx vitest run tests/build/galleries.test.ts`. Expected: FAIL.

- [ ] **Step 3: Translations.**

| Key | en | fr | de |
| --- | --- | --- | --- |
| `gallery.drag` | `Drag to explore` | `Glisser pour explorer` | `Ziehen zum Entdecken` |
| `gallery.back` | `Back to all work` | `Retour à tous les travaux` | `Zurück zu allen Arbeiten` |

- [ ] **Step 4: Rewrite the `<main>` and `<style>` of `src/views/GalleryView.astro`.** In the frontmatter, add `import { localizedPath } from '../lib/seo';`, remove `roleList`, and add:

```ts
const seed = [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
```

`<main>`:

```astro
  <main id="main-content" class="gallery" data-gallery data-seed={seed} data-lenis-prevent>
    <ol class="gallery__frames">
      {frames.map((f) => (
        <li data-frame={f.index} data-aspect={(f.image.width / f.image.height).toFixed(4)}>
          <a class="gallery__frame" href={`?frame=${f.index}`}>
            <Image
              src={f.image}
              alt={f.credit?.alt ?? `${name}, ${f.index} / ${frames.length}`}
              width={1600}
              widths={[480, 960, 1600]}
              sizes="(max-width: 760px) 50vw, 340px"
              format="webp"
              quality={72}
              loading={f.index <= 6 ? 'eager' : 'lazy'}
              draggable="false"
            />
          </a>
        </li>
      ))}
    </ol>
    <p class="gallery__hint eyebrow" aria-hidden="true">‹&nbsp;&nbsp;{t(lang, 'gallery.drag')}&nbsp;&nbsp;›</p>
    <div class="gallery__title">
      <h1 class="display">{name}</h1>
      <p>{discipline.years}</p>
    </div>
    <a class="gallery__back" href={localizedPath('/', lang)} aria-label={t(lang, 'gallery.back')}>←</a>
  </main>
```

`<style>`:

```css
  /* Resting layout: touch, no JS, and search engines. A staggered two-column grid with native scrolling. */
  .gallery { padding: 96px var(--gutter) 200px calc(var(--gutter) + var(--rail)); }
  .gallery__frames {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100% / 2 - var(--gutter), 260px), 1fr));
    gap: var(--gutter); align-items: start; margin: 0; padding: 0; list-style: none;
  }
  .gallery:not(.is-canvas) li:nth-child(even) { translate: 0 12vh; }
  .gallery__frame { display: block; }
  .gallery__frame img { width: 100%; height: 100%; object-fit: cover; }

  .gallery__title { position: fixed; z-index: 2; left: calc(var(--gutter) + var(--rail)); bottom: 24px; pointer-events: none; }
  .gallery__title h1 { margin: 0; font-size: var(--step-title); }
  .gallery__title p { margin: 4px 0 0; }

  .gallery__back {
    position: fixed; z-index: 2; right: var(--gutter); bottom: 24px;
    width: 40px; height: 40px; display: grid; place-items: center;
    border: 1px solid var(--control-line); border-radius: 50%; text-decoration: none;
    background: color-mix(in srgb, var(--world-bg) 70%, transparent);
    transition: border-color var(--dur-fast) var(--ease-out);
  }
  .gallery__back:hover { border-color: var(--world-accent); }

  .gallery__hint { display: none; }

  /* Canvas mode, added by src/gallery/canvas.ts on fine-pointer devices. */
  .gallery.is-canvas { position: fixed; inset: 0; padding: 0; overflow: hidden; cursor: grab; user-select: none; touch-action: none; }
  .gallery.is-canvas.is-dragging { cursor: grabbing; }
  .gallery.is-canvas .gallery__frames { display: block; }
  .gallery.is-canvas li { position: absolute; left: 0; top: 0; will-change: transform; }
  .gallery.is-canvas .gallery__frame { height: 100%; }
  .gallery.is-canvas .gallery__hint {
    display: block; position: fixed; z-index: 2; left: 50%; bottom: 88px; translate: -50% 0;
    margin: 0; color: var(--ink); pointer-events: none; white-space: nowrap;
  }
```

- [ ] **Step 5: Run all suites.** If `image-pipeline`'s frame selector fails, change it to `/<li data-frame="1"[^>]*>[\s\S]*?<img[^>]*>/` (it already tolerates extra attributes). Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat(m3): images-only gallery markup with a two-column resting layout`.

---

### Task 3: The canvas controller and its lifecycle, with browser tests

**Files:** Create `src/gallery/canvas.ts`. Modify `src/motion/tokens.ts` (add `DRAG`), `src/views/GalleryView.astro` (script) and `tests/e2e/pages.spec.ts` (the eyebrow test ignores canvas images). Test `tests/e2e/gallery.spec.ts`.

**Interfaces:**
- Consumes: `scatter`, `wrapInto` (Task 1) and the markup hooks (Task 2).
- Produces: `CANVAS_QUERY`, `mountCanvas(root: HTMLElement): (() => void) | null`, and `window.__gallery`.

- [ ] **Step 1: Failing browser tests.** Create `tests/e2e/gallery.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

declare global { interface Window { __gallery: { observers(): number; mounted(): boolean } } }

const visibleFrame = (page: Page) =>
  page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const li = [...document.querySelectorAll<HTMLElement>('[data-frame]')].find((el) => {
      const r = el.getBoundingClientRect();
      return r.left > 40 && r.top > 80 && r.right < vw - 40 && r.bottom < vh - 120;
    });
    if (!li) return null;
    const r = li.getBoundingClientRect();
    return { frame: li.dataset.frame!, x: r.left, y: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
const frameRect = (page: Page, frame: string) =>
  page.evaluate((f) => document.querySelector(`[data-frame="${f}"]`)!.getBoundingClientRect().toJSON(), frame);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('on desktop the gallery becomes a canvas of images only', async ({ page }) => {
  await page.goto('/work/portrait/');
  await expect(page.locator('main.gallery')).toHaveClass(/is-canvas/);
  await expect(page.locator('.gallery__hint')).toBeVisible();
  await expect(page.locator('main figcaption')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gallery.mounted())).toBe(true);
});

test('dragging pans the canvas and it glides on', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(420, 450, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const after = await frameRect(page, f.frame);
  expect(f.x - after.x).toBeGreaterThan(250);
});

test('a drag that ends on a frame does not open it', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.move(f.cx, f.cy);
  await page.mouse.down();
  await page.mouse.move(f.cx - 200, f.cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(new URL(page.url()).search).toBe('');
});

test('a plain click on a frame opens its single view', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.click(f.cx, f.cy);
  await page.waitForURL((u) => u.search === `?frame=${f.frame}`);
});

test('the wheel and the arrow keys pan too', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1200);
  const afterWheel = await frameRect(page, f.frame);
  expect(f.y - afterWheel.y).toBeGreaterThan(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1200);
  const afterKey = await frameRect(page, f.frame);
  expect(afterWheel.x - afterKey.x).toBeGreaterThan(250);
});

test('the canvas is endless: far drags never run out of images', async ({ page }) => {
  await page.goto('/work/analog/');
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(1100, 450);
    await page.mouse.down();
    await page.mouse.move(300, 450, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(1500);
  const onScreen = await page.$$eval('[data-frame]', (els) =>
    els.filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).length
  );
  expect(onScreen).toBeGreaterThanOrEqual(1);
});

test('under reduced motion the canvas still drags, exactly 1:1', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(420, 450, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await frameRect(page, f.frame);
  expect(Math.abs(f.x - after.x - 300)).toBeLessThan(20);
  await ctx.close();
});

test('on a phone the gallery is a scrolling two-column grid, not a canvas', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  await expect(page.locator('main.gallery')).not.toHaveClass(/is-canvas/);
  const lefts = await page.$$eval('[data-frame]', (els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
  expect(lefts).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await ctx.close();
});

test('the canvas leaves nothing behind across navigations', async ({ page }) => {
  await page.goto('/work/portrait/');
  for (let i = 0; i < 3; i++) {
    await page.locator('header a[data-nav="home"]').click();
    await page.waitForURL((u) => u.pathname === '/');
    expect(await page.evaluate(() => window.__gallery.observers())).toBe(0);
    await page.locator('a[data-discipline="portrait"]').click();
    await page.waitForURL((u) => u.pathname === '/work/portrait/');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__gallery.observers())).toBe(1);
  }
});
```

In `tests/e2e/pages.spec.ts`'s eyebrow test, change the overlap filter so canvas frames, which are meant to pass under the chrome, are exempt:

```ts
        return others
          .filter((el) => !el.closest('.is-canvas li'))
          .filter((el) => overlaps(el.getBoundingClientRect()))
          .map((el) => el.tagName + '.' + el.className);
```

- [ ] **Step 2: Run them.** Run `npx playwright test tests/e2e/gallery.spec.ts`. Expected: FAIL. Only the phone test passes.

- [ ] **Step 3: Add `DRAG` to `src/motion/tokens.ts`:**

```ts
/** The gallery canvas (src/gallery/canvas.ts). */
export const DRAG = {
  /** Share of the remaining distance the canvas covers per 60fps frame: lower glides longer. */
  follow: 0.1,
  /** Pixels of travel per pixel of wheel delta. */
  wheel: 1,
  /** Seconds of release velocity added as the throw after a drag. */
  throw: 0.18,
  /** Pixels a press may move and still count as a click. */
  clickSlop: 6,
} as const;
```

- [ ] **Step 4: Create `src/gallery/canvas.ts`:**

```ts
import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { DRAG } from '../motion/tokens';
import { scatter, type Tile } from './scatter';
import { wrapInto } from './wrap';

gsap.registerPlugin(Observer);

/** Only real pointers get the canvas; touch keeps the scrolling grid. */
export const CANVAS_QUERY = '(hover: hover) and (pointer: fine)';
const CELL = 380;

export function mountCanvas(root: HTMLElement): (() => void) | null {
  if (!window.matchMedia(CANVAS_QUERY).matches) return null;
  const frames = [...root.querySelectorAll<HTMLElement>('[data-frame]')];
  if (!frames.length) return null;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aspects = frames.map((f) => Number(f.dataset.aspect) || 1);
  const seed = Number(root.dataset.seed) || 1;
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let tile: Tile;
  let travelled = 0;

  function layout() {
    tile = scatter(aspects, { cell: CELL, seed, minWidth: innerWidth + CELL, minHeight: innerHeight + CELL });
    frames.forEach((f, i) => {
      f.style.width = `${tile.placed[i].w}px`;
      f.style.height = `${tile.placed[i].h}px`;
    });
    paint();
  }

  function paint() {
    frames.forEach((f, i) => {
      const p = tile.placed[i];
      const x = wrapInto(p.x + current.x, -p.w, tile.width - p.w);
      const y = wrapInto(p.y + current.y, -p.h, tile.height - p.h);
      f.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }

  function tick() {
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
    const k = reduced ? 1 : 1 - Math.pow(1 - DRAG.follow, gsap.ticker.deltaRatio(60));
    current.x += dx * k;
    current.y += dy * k;
    paint();
  }

  const observer = Observer.create({
    target: root,
    type: 'wheel,pointer',
    dragMinimum: 2,
    preventDefault: true,
    onPress: () => {
      travelled = 0;
      root.classList.add('is-dragging');
    },
    onDrag: (self) => {
      target.x += self.deltaX;
      target.y += self.deltaY;
      travelled += Math.abs(self.deltaX) + Math.abs(self.deltaY);
    },
    onWheel: (self) => {
      target.x -= self.deltaX * DRAG.wheel;
      target.y -= self.deltaY * DRAG.wheel;
    },
    onRelease: (self) => {
      root.classList.remove('is-dragging');
      if (!reduced && travelled > DRAG.clickSlop) {
        target.x += self.velocityX * DRAG.throw;
        target.y += self.velocityY * DRAG.throw;
      }
    },
  });

  function onClick(e: MouseEvent) {
    if (travelled > DRAG.clickSlop) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKey(e: KeyboardEvent) {
    const step = { ArrowLeft: [CELL, 0], ArrowRight: [-CELL, 0], ArrowUp: [0, CELL], ArrowDown: [0, -CELL] }[e.key];
    if (!step || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    target.x += step[0];
    target.y += step[1];
  }

  /** Keyboard users tab through frames in order; bring each one into view as it takes focus. */
  function onFocus(e: FocusEvent) {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-frame]');
    if (!li) return;
    const r = li.getBoundingClientRect();
    if (r.left >= 0 && r.right <= innerWidth && r.top >= 64 && r.bottom <= innerHeight - 96) return;
    target.x += innerWidth / 2 - (r.left + r.width / 2);
    target.y += innerHeight / 2 - (r.top + r.height / 2);
  }

  let resizeFrame = 0;
  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  }

  root.classList.add('is-canvas');
  layout();
  target.x = current.x = -(tile!.width - innerWidth) / 2;
  target.y = current.y = -(tile!.height - innerHeight) / 2;
  paint();

  gsap.ticker.add(tick);
  root.addEventListener('click', onClick, true);
  root.addEventListener('focusin', onFocus);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  return () => {
    observer.kill();
    gsap.ticker.remove(tick);
    cancelAnimationFrame(resizeFrame);
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('focusin', onFocus);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    root.classList.remove('is-canvas', 'is-dragging');
    frames.forEach((f) => f.removeAttribute('style'));
  };
}

export function observerCount(): number {
  return Observer.getAll().length;
}
```

- [ ] **Step 5: Wire the lifecycle.** Append to `src/views/GalleryView.astro`:

```astro
<script>
  import { mountCanvas, observerCount } from '../gallery/canvas';

  let destroy: (() => void) | null = null;

  function teardown() {
    destroy?.();
    destroy = null;
  }

  function mount() {
    teardown();
    const root = document.querySelector<HTMLElement>('[data-gallery]');
    if (root) destroy = mountCanvas(root);
  }

  // astro:page-load fires on first load and after every ClientRouter navigation.
  document.addEventListener('astro:page-load', mount);
  document.addEventListener('astro:before-swap', teardown);

  (window as unknown as Record<string, unknown>).__gallery = {
    observers: observerCount,
    mounted: () => destroy !== null,
  };
</script>
```

- [ ] **Step 6: Run all suites.** Expected: PASS. If the leak test sees `__gallery` undefined on `/`, that's because the script only loads with a gallery page; the first `goto` is a gallery, so the module is already loaded when the test navigates home.

- [ ] **Step 7: Look at it** in one batched round: 1440 (rest and mid-drag), 1024 and 375. Fix what the round shows, confirm once, then stop.

- [ ] **Step 8: Commit** with the message `feat(m3): endless drag canvas for galleries, with glide, wheel, keys and clean teardown`.
