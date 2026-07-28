# Mobile Defect Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the horizontal page overflow, make every photograph reachable on touch via an endless swipeable carousel, and bring seven undersized tap targets up to the 44×44 minimum.

**Architecture:** The carousel's mobile auto-advance is rewritten to drive `scrollLeft` on the scroll container rather than `transform` on the track, collapsing two competing mechanisms into one so the strip can auto-scroll and be swiped simultaneously. Desktop keeps its existing `transform` marquee and drag handler untouched. Every fix is guarded by a new Playwright spec running at mobile viewport.

**Tech Stack:** Astro 5 (static), GSAP (via the existing motion engine), Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-mobile-defects-design.md`

## Global Constraints

- Repo is `astro-portfolio/`. The outer `design_handoff_portfolio/src/` tree is a **stale duplicate** — never edit it.
- Branch is `fix/mobile-defects`. **Never commit to `main`** — `main` deploys live to nickygrey.com on push.
- **Never introduce a second RAF loop.** Animation frames come from `gsap.ticker` only. Any ticker callback must be a **named** function so it can be passed to `gsap.ticker.remove()`.
- Anything a motion handler creates that is not attached to a ScrollTrigger — timelines, DOM event listeners, ticker callbacks — must be cleaned up by the handler itself in its `onKill`. The e2e leak test counts ScrollTriggers only and will not catch these.
- Touch is detected with `(hover: none) and (pointer: coarse)` — the same query `isTouch()` uses in `src/motion/engine.ts`. Do not invent a second definition.
- All motion runs inside the engine's `gsap.matchMedia()` reduced-motion gate. Under reduced motion nothing animates, but the carousel must remain swipeable.
- **Desktop behaviour must not change.** The `transform` marquee and the mouse drag handler stay exactly as they are.
- Existing suites must stay green: 56 unit (`npm test`), 42 build-output (`npm run test:build`, needs a prior build), 6 Playwright (`npm run test:e2e`).
- `npm run build` must pass reporting `6 page(s) built`.
- Line numbers are indicative, not authoritative. Locate by `grep -n`; content wins.

---

### Task 1: Kill the horizontal overflow

The page is 414px wide in a 390px viewport. `.photo-carousel` bleeds edge-to-edge with a negative margin on both sides, making it 438px inside a 390px screen. The clipped hamburger is a symptom of the same 24px.

**Files:**
- Modify: `src/styles/global.css` (the `.photo-carousel` rule)
- Create: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `tests/e2e/mobile.spec.ts` with a reusable mobile context, extended by Tasks 2 and 3

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/mobile.spec.ts
import { test, expect, devices } from '@playwright/test';

const MOBILE = { ...devices['iPhone 13'] };

test.describe('mobile layout', () => {
  test('the page does not scroll sideways', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // A 1px tolerance absorbs sub-pixel rounding; anything more is real overflow.
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await ctx.close();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails for the right reason**

Run: `npm run test:e2e -- mobile.spec.ts`
Expected: FAIL, reporting a `scrollWidth` around 414 against a `clientWidth` of 390. If it fails for any other reason, stop and investigate — a test that fails for the wrong reason proves nothing.

- [ ] **Step 3: Replace the bleed technique**

In `src/styles/global.css`, the `.photo-carousel` rule currently reads:

```css
.photo-carousel {
  position: relative;
  overflow: hidden;
  margin: 0 calc(-1 * clamp(24px,5vw,72px));
}
```

Replace the `margin` line with the full-bleed technique that cannot exceed the viewport:

```css
.photo-carousel {
  position: relative;
  overflow: hidden;
  width: 100%;
  margin-inline: calc(50% - 50vw);
  max-width: 100vw;
}
```

- [ ] **Step 4: Confirm the fix, and check the other direction**

Run: `npm run test:e2e -- mobile.spec.ts`
Expected: PASS.

Then check desktop, because this fix can cause at one width what it removes at another. `100vw` includes the scrollbar gutter on platforms with classic scrollbars, which can reintroduce a small overflow.

```bash
npm run dev -- --port 4340 &
sleep 6
node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  for (const w of [1440, 1024, 768, 390, 320]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.goto('http://localhost:4340/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    console.log(w, '->', r[0], 'vs', r[1], r[0] <= r[1] + 1 ? 'OK' : 'OVERFLOW');
    await p.close();
  }
  await b.close();
})();
"
```

Expected: `OK` at every width. Report the actual numbers. If any width overflows, the fix is incomplete — say so rather than proceeding.

Also confirm visually that the carousel still reaches both screen edges at desktop width. Losing the full-bleed look while fixing the overflow would be trading one defect for another.

- [ ] **Step 5: Verify the whole suite and commit**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`
Expected: 56 unit, 42 build, 7 Playwright (6 existing + your new one), `6 page(s) built`.

```bash
git add src/styles/global.css tests/e2e/mobile.spec.ts
git commit -m "fix: full-bleed carousel without horizontal overflow"
```

---

### Task 2: Endless swipeable carousel on touch

Roughly 72% of the strip is currently unreachable on a phone, and entirely unreachable under reduced motion where the marquee does not run.

**Files:**
- Modify: `src/components/PhotoCarousel.astro` (the `registerMotion('marquee', …)` handler, and the drag script below it)
- Modify: `src/styles/global.css` (touch-only carousel rules)
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `registerMotion` from `../motion`; `MARQUEE_DURATION`, `EASE`, `DURATION`, `num` from `../motion/tokens`
- Produces: nothing consumed by later tasks

**The idea, before the code.** The old conflict was two mechanisms driving one visual axis — the marquee translating `.carousel-track`, the user's finger scrolling `.photo-carousel`. Driving the mobile auto-advance through `scrollLeft` collapses them into one, so they cannot fight.

The loop is seamless because `PhotoCarousel.astro` renders `photos.map(...)` **twice** — two identical copies. Scrolling forward past one copy's width lands on pixel-identical content, so resetting there is invisible.

**Measure the period from the DOM, not by halving `scrollWidth`.** The track uses `gap: 8px`, and 14 slides have 13 gaps — so `scrollWidth / 2` is off by half a gap and the seam would drift by ~4px every cycle. The exact period is the horizontal distance between the first slide and the first slide of the second copy.

- [ ] **Step 1: Add the touch-only CSS**

In `src/styles/global.css`, inside a touch-only media query, make the carousel natively scrollable and hide the scrollbar:

```css
@media (hover: none) and (pointer: coarse) {
  .photo-carousel {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .photo-carousel::-webkit-scrollbar { display: none; }
}
```

No `scroll-snap`: snapping fights a continuously running auto-advance, and this is a photo strip rather than a paged carousel.

There is an existing `.photo-carousel { -webkit-overflow-scrolling: touch; }` rule in the `max-width: 900px` block — find it with `grep -n "overflow-scrolling" src/styles/global.css` and remove it, so the touch rules live in one place.

- [ ] **Step 2: Branch the marquee handler onto a touch path**

In `PhotoCarousel.astro`, the handler currently begins:

```ts
registerMotion('marquee', (el, { gsap, ScrollTrigger }) => {
  const duration = num(el.getAttribute('data-speed'), MARQUEE_DURATION);
```

Add the branch at the top of the handler, leaving the entire existing desktop body untouched below it:

```ts
registerMotion('marquee', (el, { gsap, ScrollTrigger }) => {
  const scroller = el.closest('.photo-carousel') as HTMLElement | null;
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (isTouch && scroller) {
    setupTouchCarousel(el, scroller, gsap, ScrollTrigger);
    return;
  }

  // --- existing desktop transform marquee continues unchanged from here ---
  const duration = num(el.getAttribute('data-speed'), MARQUEE_DURATION);
```

- [ ] **Step 3: Implement the touch carousel**

Add this function in the same `<script>` block, above the `registerMotion` call:

```ts
/**
 * Mobile carousel: auto-advance and user swipe both drive scrollLeft, so the
 * two can never fight the way a transform-based marquee does against a scroll.
 * The track holds two identical copies of the photo set, so wrapping by one
 * period lands on pixel-identical content and the strip never ends.
 */
function setupTouchCarousel(
  track: HTMLElement,
  scroller: HTMLElement,
  gsap: typeof import('gsap').gsap,
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger
) {
  const RESUME_DELAY_MS = 1200;

  /**
   * Exact loop period: the distance from the first slide to the first slide of
   * the second copy. Measured from the DOM rather than derived from
   * scrollWidth, because the flex `gap` means scrollWidth/2 is half a gap short
   * and the seam would drift a few pixels every cycle.
   */
  function period(): number {
    const slides = track.children;
    if (slides.length < 2) return 0;
    const first = slides[0] as HTMLElement;
    const secondCopy = slides[Math.floor(slides.length / 2)] as HTMLElement;
    return secondCopy.offsetLeft - first.offsetLeft;
  }

  function wrap() {
    const p = period();
    if (p <= 0) return;
    if (scroller.scrollLeft >= p) scroller.scrollLeft -= p;
    else if (scroller.scrollLeft < 0) scroller.scrollLeft += p;
  }

  // px/sec chosen so a full cycle takes the same time as the desktop marquee.
  function speed(): number {
    const p = period();
    return p > 0 ? p / MARQUEE_DURATION : 0;
  }

  let paused = false;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;

  // Named so it can be handed to gsap.ticker.remove() on teardown.
  function advance(_time: number, deltaMs: number) {
    if (paused) return;
    scroller.scrollLeft += (speed() * deltaMs) / 1000;
    wrap();
  }

  function onTouchStart() {
    paused = true;
    if (resumeTimer) clearTimeout(resumeTimer);
  }

  function onTouchEnd() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { paused = false; }, RESUME_DELAY_MS);
  }

  gsap.ticker.add(advance);
  scroller.addEventListener('scroll', wrap, { passive: true });
  scroller.addEventListener('touchstart', onTouchStart, { passive: true });
  scroller.addEventListener('touchend', onTouchEnd, { passive: true });
  scroller.addEventListener('touchcancel', onTouchEnd, { passive: true });

  ScrollTrigger.create({
    onKill: () => {
      gsap.ticker.remove(advance);
      if (resumeTimer) clearTimeout(resumeTimer);
      scroller.removeEventListener('scroll', wrap);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
    },
  });
}
```

- [ ] **Step 4: Disable the mouse drag handler on touch**

The drag script sets `carousel.scrollLeft` manually. With native scrolling now active on touch, both would move the strip and it would travel roughly double. Find the block beginning `// Mouse drag for carousel` (around `PhotoCarousel.astro:294`) and guard it so it only runs on non-touch:

```ts
// Mouse drag for carousel — desktop only. On touch, native overflow scrolling
// moves the strip, and running this too would double every gesture.
if (carousel && track && !window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
```

Leave everything inside the block unchanged.

- [ ] **Step 5: Add the loop and reachability tests**

Append to `tests/e2e/mobile.spec.ts`, inside the existing `describe`:

```ts
  test('every photograph is reachable by swiping', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    const reachable = await page.evaluate(() => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      return {
        canScroll: el.scrollWidth > el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
      };
    });

    expect(reachable.canScroll).toBe(true);
    expect(['auto', 'scroll']).toContain(reachable.overflowX);
    await ctx.close();
  });

  test('the carousel loops instead of ending', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Compare the rendered position of a known slide either side of a wrap.
    // Asserting only that scrollLeft changed would pass even if the wrap were
    // visibly jarring, so measure where the content actually lands.
    const result = await page.evaluate(() => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      const slides = document.querySelectorAll('#carousel-track > *');
      const first = slides[0] as HTMLElement;
      const secondCopy = slides[Math.floor(slides.length / 2)] as HTMLElement;
      const p = secondCopy.offsetLeft - first.offsetLeft;

      el.scrollLeft = 0;
      const before = first.getBoundingClientRect().left;

      // Land exactly one period along: the second copy's first slide should now
      // sit where the first slide sat.
      el.scrollLeft = p;
      const after = secondCopy.getBoundingClientRect().left;

      return { period: p, before, after, delta: Math.abs(after - before) };
    });

    expect(result.period).toBeGreaterThan(0);
    // Sub-pixel tolerance only — a drifting seam would show up as several px.
    expect(result.delta).toBeLessThan(2);
    await ctx.close();
  });

  test('photographs stay reachable under reduced motion', async ({ browser }) => {
    // This is the case that is currently broken: with the marquee stopped and
    // overflow hidden, roughly 72% of the strip cannot be reached by any means.
    const ctx = await browser.newContext({ ...MOBILE, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      const before = el.scrollLeft;
      el.scrollLeft = 400;
      const after = el.scrollLeft;
      return {
        overflowX: getComputedStyle(el).overflowX,
        scrollable: el.scrollWidth > el.clientWidth,
        moved: after !== before,
      };
    });

    expect(['auto', 'scroll']).toContain(state.overflowX);
    expect(state.scrollable).toBe(true);
    expect(state.moved).toBe(true);
    await ctx.close();
  });
```

- [ ] **Step 6: Verify on a real touch emulation**

Run: `npm run test:e2e`
Expected: all pass — 6 existing plus your 3 mobile tests.

Then drive it manually and report what you observe:

```bash
npm run dev -- --port 4341 &
sleep 6
```

Open a touch-emulated context at `http://localhost:4341/#photos` and confirm:
- the strip advances on its own
- a swipe moves it, and it keeps moving under your finger rather than jumping
- releasing the finger resumes the auto-advance after about a second
- swiping continuously in one direction never reaches an end, in **both** directions
- tapping a photograph still opens the lightbox
- at desktop width the strip still auto-scrolls via transform and mouse-drag still works — this must be unchanged

**The iOS momentum risk.** Setting `scrollLeft` programmatically during momentum scrolling can cancel that momentum on iOS. A fast flick crossing the wrap point may stop dead at the seam rather than gliding through. Test a fast flick specifically and report what happens. If it interrupts, say so — do not quietly leave it. The fallback is to defer the wrap until scrolling settles, accepting that a very fast flick can briefly reach the true end rather than stuttering on every one.

- [ ] **Step 7: Verify the full suite and commit**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`
Expected: 56 unit, 42 build, 9 Playwright, `6 page(s) built`.

```bash
git add src/components/PhotoCarousel.astro src/styles/global.css tests/e2e/mobile.spec.ts
git commit -m "feat: endless swipeable carousel on touch"
```

---

### Task 3: Tap targets

Seven controls measure below the 44×44px minimum that Apple's Human Interface Guidelines and Google's Material guidance both specify.

**Files:**
- Modify: `src/components/Header.astro` (`.logo`, `.nav-toggle`)
- Modify: `src/components/FeaturedReel.astro` (`.youtube-link`)
- Modify: `src/components/SelectedWork.astro` (`.archive-link`)
- Modify: `src/components/Footer.astro` (three links)
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

The measured failures:

| element | text | measured |
| ------- | ---- | -------- |
| `a.logo` | `p.v.` | 41×34 |
| `button.nav-toggle` | — | 40×40 |
| `a.youtube-link` | `Watch on YouTube ↗` | 140×22 |
| `a.archive-link` | `Full archive ↗` | 86×20 |
| footer `a` | `Privacy` | 44×17 |
| footer `a` | `@nickygreys` | 75×17 |
| footer `a` | `pv@nickygrey.com` | 112×17 |

- [ ] **Step 1: Write the failing test**

```ts
  test('tap targets meet the 44px minimum', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Standalone controls only. A link inside a paragraph of body copy inherits
    // the line height of its prose, and forcing it to 44px would break the text
    // flow it lives in — so a blanket rule over every anchor would produce
    // false failures and train people to weaken this test.
    const SELECTORS = [
      '.logo',
      '.nav-toggle',
      '.youtube-link',
      '.archive-link',
      'footer a',
    ];

    const undersized = await page.evaluate((sels) => {
      const out: Array<{ sel: string; text: string; w: number; h: number }> = [];
      for (const sel of sels) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.width < 44 || r.height < 44) {
            out.push({
              sel,
              text: (el.textContent || '').trim().slice(0, 20),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
      }
      return out;
    }, SELECTORS);

    expect(undersized).toEqual([]);
    await ctx.close();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test:e2e -- mobile.spec.ts`
Expected: FAIL listing the seven undersized controls with their measured sizes.

- [ ] **Step 3: Expand the hit areas**

Grow the touchable region with padding and absorb it with an equal negative margin, so the design renders identically and only the region that responds to a finger grows. Apply each inside a touch-only query in that component's own `<style>` block:

```css
@media (hover: none) and (pointer: coarse) {
  .logo {
    padding: 5px 2px;
    margin: -5px -2px;
  }
}
```

The exact shortfall and the padding that closes it, per element:

| element | measured | short by | padding to apply |
| ------- | -------- | -------- | ---------------- |
| `.logo` | 41×34 | 3w, 10h | `padding: 5px 2px; margin: -5px -2px;` |
| `.nav-toggle` | 40×40 | 4w, 4h | `padding: 2px; margin: -2px;` |
| `.youtube-link` | 140×22 | 22h | `padding: 11px 0; margin: -11px 0;` |
| `.archive-link` | 86×20 | 24h | `padding: 12px 0; margin: -12px 0;` |
| footer links (×3) | ~×17 | 27h | `padding: 14px 0; margin: -14px 0;` |

Widths already exceed 44px on every element except `.logo` and `.nav-toggle`, so the rest need vertical padding only.

**Verify position, do not assume it.** A negative margin can disturb a flex or grid layout. After each change, confirm the element's `getBoundingClientRect()` **left** and **top** are unchanged from before — only width and height should grow. Where a negative margin does shift the layout, prefer growing the element's own box (for instance `min-height` plus `display: inline-flex; align-items: center`) instead of forcing the margin trick.

- [ ] **Step 4: Confirm the fix**

Run: `npm run test:e2e -- mobile.spec.ts`
Expected: PASS.

Then confirm nothing moved: compare a screenshot of the header and footer at 390px before and after. The layout must be pixel-identical apart from the invisible hit areas. Report whether anything shifted.

- [ ] **Step 5: Verify the full suite and commit**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`
Expected: 56 unit, 42 build, 10 Playwright, `6 page(s) built`.

```bash
git add src/components/ tests/e2e/mobile.spec.ts
git commit -m "fix: bring mobile tap targets to the 44px minimum"
```

---

## Verification Summary

```bash
npm test           # 56 unit — no build needed
npm run build      # 6 page(s) built
npm run test:build # 42 build-output — requires the build above
npm run test:e2e   # 11 Playwright: 6 existing + 5 mobile
```

Manual checks automation does not cover: the fast-flick behaviour at the loop seam on a real iOS device, and a visual confirmation that the carousel still bleeds to both screen edges at desktop width.

## Known Follow-Ups (out of scope)

- Mobile-specific motion tuning — reveal distances, durations and parallax intensity calibrated for small screens. Subjective, and needs the owner's eyes on a real device.
- The French and German pages still serve English meta descriptions. Every other locale signal on those pages says French or German.
- `public/images/hero.jpg` is 1.6 MB and `slava new-6 (1).jpg` is 6.7 MB — together more than 100× the JavaScript bundle.
