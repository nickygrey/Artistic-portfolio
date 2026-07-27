# Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the site's ad-hoc animations with one token-driven motion system built on GSAP + ScrollTrigger + Lenis, applied across all ten sections.

**Architecture:** A declarative engine scans the DOM for `data-animation` attributes and builds GSAP timelines from shared tokens, so every section draws its timing from one source. Lenis owns scroll and drives `ScrollTrigger.update`. A `registerMotion()` escape hatch lets individual sections declare bespoke timelines against the same instances. All motion is gated behind `gsap.matchMedia()` on `prefers-reduced-motion`.

**Tech Stack:** Astro 5 (static), GSAP 3.13+ (core, ScrollTrigger, SplitText), Lenis, TypeScript, Vitest (unit), Playwright (integration).

**Spec:** `docs/superpowers/specs/2026-07-27-motion-system-design.md`

## Global Constraints

- Repo is `astro-portfolio/`. The outer `design_handoff_portfolio/src/` tree is a **stale duplicate** — never edit it.
- Branch: `feat/motion-system`. Do not commit to `main`.
- Node `>=22.12.0` (per `package.json` `engines`).
- GSAP must be `^3.13.0` — `SplitText`'s `mask` and `autoSplit` options do not exist before 3.13.
- All animation must be declared inside `gsap.matchMedia()` gated on `(prefers-reduced-motion: no-preference)`. Under reduced motion, elements render in their final state and Lenis never initialises.
- Lenis is disabled on touch devices.
- The site builds to **6 pages**: `/`, `/privacy`, and `fr`/`de` variants of each.
- `npm run build` must pass at the end of every task.
- Never introduce a second RAF loop. Lenis is driven by `gsap.ticker` only.
- **Line numbers in this plan are indicative, not authoritative.** They were
  accurate at `c456a33`, but earlier tasks delete lines and shift everything
  below them. Always locate the target by its content — `grep -n` for the
  selector or identifier named in the step — and edit what you find there. If
  a cited line does not contain what the step describes, the content wins.

---

### Task 1: Dependencies and test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` (Vitest, unit) and `npm run test:e2e` (Playwright) both runnable. `gsap` and `lenis` importable.

- [ ] **Step 1: Install dependencies**

```bash
npm install gsap@^3.13.0 lenis@^1.1.13
npm install -D vitest@^2.1.0 @playwright/test@^1.48.0
```

- [ ] **Step 2: Add test scripts to `package.json`**

Add to the `"scripts"` block, leaving existing entries untouched:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `playwright.config.ts`**

`reuseExistingServer: false` matters — stale dev servers from other projects are known to occupy ports 4321-4324 on this machine.

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:4329',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev -- --port 4329',
    url: 'http://localhost:4329',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
```

- [ ] **Step 5: Verify the toolchain resolves**

Do **not** write a placeholder smoke test — an assertion like
`expect(true).toBe(true)` verifies nothing and is a review defect. The Vitest
runner is proven by Task 2's tokens test, which is the first real test.

Confirm the binaries resolve and the config parses:

```bash
npx vitest --version
npx playwright --version
```

Expected: both print a version. `npm test` will report "no test files found"
at this stage, which is correct — Task 2 supplies the first suite.

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build`
Expected: `6 page(s) built`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts playwright.config.ts
git commit -m "chore: add gsap, lenis, and test infrastructure"
```

---

### Task 2: Motion tokens

The consistency guarantee. Every primitive reads timing from here, so sections cannot drift apart.

**Files:**
- Create: `src/motion/tokens.ts`
- Test: `tests/unit/tokens.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `EASE: { out: 'power3.out', inOut: 'power2.inOut', none: 'none' }`
  - `DURATION: { fast: 0.5, base: 0.9, slow: 1.4 }`
  - `DISTANCE: { sm: 20, md: 40, lg: 80 }`
  - `STAGGER: { tight: 0.06, base: 0.1, loose: 0.16 }`
  - `SCROLL: { start: string, end: string }`
  - `num(value: string | null | undefined, fallback: number): number`
  - `flag(el: Element, name: string): boolean`

- [ ] **Step 1: Write the failing test**

`num` must survive the messy real-world attribute values: absent, empty string (`data-scrub=""` is presence-as-true), and garbage.

```ts
// tests/unit/tokens.test.ts
import { describe, it, expect } from 'vitest';
import { EASE, DURATION, DISTANCE, STAGGER, num, flag } from '../../src/motion/tokens';

describe('tokens', () => {
  it('exposes a single easing scale', () => {
    expect(EASE.out).toBe('power3.out');
    expect(EASE.none).toBe('none');
  });

  it('orders durations fast < base < slow', () => {
    expect(DURATION.fast).toBeLessThan(DURATION.base);
    expect(DURATION.base).toBeLessThan(DURATION.slow);
  });

  it('orders distances and staggers ascending', () => {
    expect(DISTANCE.sm).toBeLessThan(DISTANCE.md);
    expect(DISTANCE.md).toBeLessThan(DISTANCE.lg);
    expect(STAGGER.tight).toBeLessThan(STAGGER.base);
    expect(STAGGER.base).toBeLessThan(STAGGER.loose);
  });
});

describe('num', () => {
  it('parses a numeric string', () => {
    expect(num('0.6', 1)).toBe(0.6);
  });

  it('parses negative and zero', () => {
    expect(num('-2', 1)).toBe(-2);
    expect(num('0', 1)).toBe(0);
  });

  it('falls back on null, undefined, and empty string', () => {
    expect(num(null, 7)).toBe(7);
    expect(num(undefined, 7)).toBe(7);
    expect(num('', 7)).toBe(7);
    expect(num('   ', 7)).toBe(7);
  });

  it('falls back on non-numeric and non-finite input', () => {
    expect(num('fast', 3)).toBe(3);
    expect(num('Infinity', 3)).toBe(3);
    expect(num('NaN', 3)).toBe(3);
  });
});

describe('flag', () => {
  it('is true for a present attribute even when empty', () => {
    const el = { hasAttribute: (n: string) => n === 'data-scrub' } as Element;
    expect(flag(el, 'data-scrub')).toBe(true);
  });

  it('is false for an absent attribute', () => {
    const el = { hasAttribute: () => false } as unknown as Element;
    expect(flag(el, 'data-scrub')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../../src/motion/tokens`.

- [ ] **Step 3: Implement**

```ts
// src/motion/tokens.ts

/** Shared easing scale. Every primitive draws from this. */
export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  none: 'none',
} as const;

/** Seconds. */
export const DURATION = {
  fast: 0.5,
  base: 0.9,
  slow: 1.4,
} as const;

/** Pixels of travel for enter animations. */
export const DISTANCE = {
  sm: 20,
  md: 40,
  lg: 80,
} as const;

/** Seconds between staggered children. */
export const STAGGER = {
  tight: 0.06,
  base: 0.1,
  loose: 0.16,
} as const;

/** Default ScrollTrigger window for enter animations. */
export const SCROLL = {
  start: 'top bottom-=10%',
  end: 'bottom top+=10%',
} as const;

/**
 * Parse a data-attribute value as a number.
 * Attribute values are strings, absent, or present-but-empty; all of the
 * non-numeric cases fall back rather than producing NaN.
 */
export function num(value: string | null | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Presence-as-true, for valueless attributes like `data-scrub`. */
export function flag(el: Element, name: string): boolean {
  return el.hasAttribute(name);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, all tokens tests green.

- [ ] **Step 5: Commit**

```bash
git add src/motion/tokens.ts tests/unit/tokens.test.ts
git commit -m "feat: add motion token scale"
```

---

### Task 3: Primitive config builders

Pure functions that turn an element's attributes into GSAP tween vars. Kept free of GSAP calls so they are unit-testable without a DOM or a ticker.

**Files:**
- Create: `src/motion/primitives.ts`
- Test: `tests/unit/primitives.test.ts`

**Interfaces:**
- Consumes: `EASE`, `DURATION`, `DISTANCE`, `STAGGER`, `SCROLL`, `num`, `flag` from `./tokens`
- Produces:
  - `type MotionName = 'moveUp' | 'split' | 'parallax' | 'fade' | 'scale' | 'marquee'`
  - `interface TweenSpec { from: Record<string, unknown>; to: Record<string, unknown> }`
  - `buildMoveUp(el: Element): TweenSpec`
  - `buildFade(el: Element): TweenSpec`
  - `buildScale(el: Element): TweenSpec`
  - `buildParallax(el: Element): TweenSpec`
  - `buildSplit(el: Element): TweenSpec`
  - `buildScrollTriggerVars(el: Element): Record<string, unknown>`
  - `isMotionName(value: string | null): value is MotionName`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/primitives.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildMoveUp, buildFade, buildScale, buildParallax, buildSplit,
  buildScrollTriggerVars, isMotionName,
} from '../../src/motion/primitives';
import { DISTANCE, DURATION, EASE, STAGGER } from '../../src/motion/tokens';

/** Minimal Element stand-in driven by a plain attribute map. */
function el(attrs: Record<string, string> = {}): Element {
  return {
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    hasAttribute: (n: string) => n in attrs,
  } as unknown as Element;
}

describe('isMotionName', () => {
  it('accepts the six primitives', () => {
    for (const n of ['moveUp', 'split', 'parallax', 'fade', 'scale', 'marquee']) {
      expect(isMotionName(n)).toBe(true);
    }
  });

  it('rejects unknown names and null', () => {
    expect(isMotionName('wobble')).toBe(false);
    expect(isMotionName(null)).toBe(false);
  });
});

describe('buildMoveUp', () => {
  it('travels DISTANCE.md and fades in with token timing', () => {
    const spec = buildMoveUp(el());
    expect(spec.from).toEqual({ y: DISTANCE.md, opacity: 0 });
    expect(spec.to.y).toBe(0);
    expect(spec.to.opacity).toBe(1);
    expect(spec.to.duration).toBe(DURATION.base);
    expect(spec.to.ease).toBe(EASE.out);
  });

  it('defaults delay to 0 and stagger to 0', () => {
    const spec = buildMoveUp(el());
    expect(spec.to.delay).toBe(0);
    expect(spec.to.stagger).toBe(0);
  });

  it('reads data-delay', () => {
    expect(buildMoveUp(el({ 'data-delay': '0.2' })).to.delay).toBe(0.2);
  });

  it('applies base stagger when data-stagger is present but empty', () => {
    expect(buildMoveUp(el({ 'data-stagger': '' })).to.stagger).toBe(STAGGER.base);
  });

  it('honours an explicit numeric stagger', () => {
    expect(buildMoveUp(el({ 'data-stagger': '0.25' })).to.stagger).toBe(0.25);
  });
});

describe('buildFade', () => {
  it('animates opacity only, leaving transform untouched', () => {
    const spec = buildFade(el());
    expect(spec.from).toEqual({ opacity: 0 });
    expect(spec.to.opacity).toBe(1);
    expect(spec.from).not.toHaveProperty('y');
  });
});

describe('buildScale', () => {
  it('defaults 1.08 -> 1', () => {
    const spec = buildScale(el());
    expect(spec.from.scale).toBe(1.08);
    expect(spec.to.scale).toBe(1);
  });

  it('reads data-from and data-to', () => {
    const spec = buildScale(el({ 'data-from': '1.15', 'data-to': '1' }));
    expect(spec.from.scale).toBe(1.15);
    expect(spec.to.scale).toBe(1);
  });
});

describe('buildParallax', () => {
  it('uses linear easing so scrubbing tracks scroll exactly', () => {
    expect(buildParallax(el()).to.ease).toBe(EASE.none);
  });

  it('scales travel by data-speed', () => {
    const slow = buildParallax(el({ 'data-speed': '0.5' }));
    const fast = buildParallax(el({ 'data-speed': '2' }));
    expect(Math.abs(Number(fast.to.y))).toBeGreaterThan(Math.abs(Number(slow.to.y)));
  });

  it('defaults to speed 1 when data-speed is absent', () => {
    const spec = buildParallax(el());
    expect(Number(spec.to.y)).not.toBeNaN();
  });
});

describe('buildSplit', () => {
  it('rises a full line height from below the mask', () => {
    const spec = buildSplit(el());
    expect(spec.from.yPercent).toBe(100);
    expect(spec.to.yPercent).toBe(0);
  });

  it('staggers lines by default', () => {
    expect(buildSplit(el()).to.stagger).toBe(STAGGER.tight);
  });
});

describe('buildScrollTriggerVars', () => {
  it('omits scrub when data-scrub is absent', () => {
    expect(buildScrollTriggerVars(el()).scrub).toBeUndefined();
  });

  it('enables smoothed scrub when data-scrub is present but empty', () => {
    expect(buildScrollTriggerVars(el({ 'data-scrub': '' })).scrub).toBe(true);
  });

  it('uses a numeric scrub value when given', () => {
    expect(buildScrollTriggerVars(el({ 'data-scrub': '1.5' })).scrub).toBe(1.5);
  });

  it('reads data-start and data-end verbatim', () => {
    const vars = buildScrollTriggerVars(el({
      'data-start': 'top bottom+=100',
      'data-end': '+=100%',
    }));
    expect(vars.start).toBe('top bottom+=100');
    expect(vars.end).toBe('+=100%');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../../src/motion/primitives`.

- [ ] **Step 3: Implement**

```ts
// src/motion/primitives.ts
import { DISTANCE, DURATION, EASE, SCROLL, STAGGER, flag, num } from './tokens';

export type MotionName = 'moveUp' | 'split' | 'parallax' | 'fade' | 'scale' | 'marquee';

const MOTION_NAMES: readonly string[] = [
  'moveUp', 'split', 'parallax', 'fade', 'scale', 'marquee',
];

export function isMotionName(value: string | null): value is MotionName {
  return value != null && MOTION_NAMES.includes(value);
}

export interface TweenSpec {
  from: Record<string, unknown>;
  to: Record<string, unknown>;
}

function delayOf(el: Element): number {
  return num(el.getAttribute('data-delay'), 0);
}

/**
 * `data-stagger` is presence-as-true: bare means the base token, an explicit
 * number overrides it, absent means no stagger at all.
 */
function staggerOf(el: Element, base: number): number {
  if (!flag(el, 'data-stagger')) return 0;
  return num(el.getAttribute('data-stagger'), base);
}

export function buildMoveUp(el: Element): TweenSpec {
  return {
    from: { y: DISTANCE.md, opacity: 0 },
    to: {
      y: 0,
      opacity: 1,
      duration: DURATION.base,
      ease: EASE.out,
      delay: delayOf(el),
      stagger: staggerOf(el, STAGGER.base),
    },
  };
}

export function buildFade(el: Element): TweenSpec {
  return {
    from: { opacity: 0 },
    to: {
      opacity: 1,
      duration: DURATION.base,
      ease: EASE.out,
      delay: delayOf(el),
      stagger: staggerOf(el, STAGGER.base),
    },
  };
}

export function buildScale(el: Element): TweenSpec {
  return {
    from: { scale: num(el.getAttribute('data-from'), 1.08) },
    to: {
      scale: num(el.getAttribute('data-to'), 1),
      duration: DURATION.slow,
      ease: EASE.out,
      delay: delayOf(el),
    },
  };
}

/**
 * Travel is symmetric about zero so the element sits at its authored position
 * mid-viewport. Linear easing is required: with scrub, easing would decouple
 * motion from scroll position.
 */
export function buildParallax(el: Element): TweenSpec {
  const speed = num(el.getAttribute('data-speed'), 1);
  const travel = DISTANCE.lg * speed;
  return {
    from: { y: travel },
    to: { y: -travel, ease: EASE.none },
  };
}

export function buildSplit(el: Element): TweenSpec {
  return {
    from: { yPercent: 100 },
    to: {
      yPercent: 0,
      duration: DURATION.base,
      ease: EASE.out,
      delay: delayOf(el),
      stagger: num(el.getAttribute('data-stagger'), STAGGER.tight),
    },
  };
}

export function buildScrollTriggerVars(el: Element): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    start: el.getAttribute('data-start') ?? SCROLL.start,
    end: el.getAttribute('data-end') ?? SCROLL.end,
  };
  if (flag(el, 'data-scrub')) {
    const raw = el.getAttribute('data-scrub');
    vars.scrub = raw == null || raw.trim() === '' ? true : num(raw, 1);
  }
  return vars;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, all primitives tests green.

- [ ] **Step 5: Commit**

```bash
git add src/motion/primitives.ts tests/unit/primitives.test.ts
git commit -m "feat: add motion primitive config builders"
```

---

### Task 4: Engine — Lenis, ScrollTrigger, lifecycle

The highest-risk piece. `ClientRouter` swaps the DOM underneath the system, and ScrollTriggers that survive a swap accumulate silently until scroll behaviour degrades.

**Files:**
- Create: `src/motion/engine.ts`
- Create: `src/motion/index.ts`

**Interfaces:**
- Consumes: `buildMoveUp`, `buildFade`, `buildScale`, `buildParallax`, `buildSplit`, `buildScrollTriggerVars`, `isMotionName` from `./primitives`
- Produces:
  - `initMotion(): void` — idempotent; safe to call on every `astro:page-load`
  - `registerMotion(name: string, fn: (el: HTMLElement, ctx: MotionContext) => void): void`
  - `interface MotionContext { gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger }`
  - `teardownMotion(): void`
  - `window.__motion` debug handle exposing `{ triggerCount(): number }` for the e2e leak test

- [ ] **Step 1: Implement the engine**

No unit test here — this is DOM, RAF and scroll integration, verified by the Playwright test in Step 3 rather than mocked.

```ts
// src/motion/engine.ts
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import {
  buildFade, buildMoveUp, buildParallax, buildScale, buildSplit,
  buildScrollTriggerVars, isMotionName,
} from './primitives';

gsap.registerPlugin(ScrollTrigger, SplitText);

export interface MotionContext {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
}

type CustomHandler = (el: HTMLElement, ctx: MotionContext) => void;

const custom = new Map<string, CustomHandler>();
const splits: SplitText[] = [];
let lenis: Lenis | null = null;
let mm: gsap.MatchMedia | null = null;

export function registerMotion(name: string, fn: CustomHandler): void {
  custom.set(name, fn);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isTouch(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * Lenis is constructed once and reused across navigations. It is driven by
 * gsap.ticker rather than its own RAF loop so scroll and tweens share a clock.
 */
function ensureLenis(): void {
  if (lenis || prefersReducedMotion() || isTouch()) return;

  lenis = new Lenis({
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time: number) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function applyPrimitive(el: HTMLElement, name: string): void {
  const targets = el.hasAttribute('data-stagger') ? Array.from(el.children) : el;
  const st = buildScrollTriggerVars(el);

  if (name === 'split') {
    const split = new SplitText(el, {
      type: 'lines',
      linesClass: 'motion-line',
      mask: 'lines',
      autoSplit: true,
    });
    splits.push(split);
    const spec = buildSplit(el);
    gsap.fromTo(split.lines, spec.from, {
      ...spec.to,
      scrollTrigger: { trigger: el, ...st },
    });
    return;
  }

  if (name === 'parallax') {
    const spec = buildParallax(el);
    gsap.fromTo(el, spec.from, {
      ...spec.to,
      scrollTrigger: { trigger: el, scrub: true, ...st },
    });
    return;
  }

  const spec =
    name === 'fade' ? buildFade(el) :
    name === 'scale' ? buildScale(el) :
    buildMoveUp(el);

  gsap.fromTo(targets, spec.from, {
    ...spec.to,
    scrollTrigger: { trigger: el, ...st },
  });
}

function scan(): void {
  document.querySelectorAll<HTMLElement>('[data-animation]').forEach((el) => {
    const name = el.getAttribute('data-animation');
    if (!name) return;

    const handler = custom.get(name);
    if (handler) {
      handler(el, { gsap, ScrollTrigger });
      return;
    }

    if (isMotionName(name) && name !== 'marquee') {
      applyPrimitive(el, name);
    }
  });
}

/** Kill every trigger and revert every split. Must leave nothing behind. */
export function teardownMotion(): void {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  while (splits.length) splits.pop()?.revert();
  mm?.revert();
  mm = null;
}

export function initMotion(): void {
  teardownMotion();

  if (prefersReducedMotion()) {
    // Nothing animates; elements are authored visible, so there is
    // nothing to reveal. Lenis is deliberately never constructed.
    return;
  }

  ensureLenis();
  lenis?.scrollTo(0, { immediate: true });

  mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    scan();
    ScrollTrigger.refresh();
  });
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__motion = {
    triggerCount: () => ScrollTrigger.getAll().length,
  };
}
```

- [ ] **Step 2: Create the public entry point**

```ts
// src/motion/index.ts
export { initMotion, registerMotion, teardownMotion } from './engine';
export type { MotionContext } from './engine';
export * from './tokens';
```

- [ ] **Step 3: Write the leak test**

This is the test that justifies the whole Playwright setup. It navigates away and back three times; a leaking teardown shows as a monotonically climbing trigger count.

```ts
// tests/e2e/lifecycle.spec.ts
import { test, expect } from '@playwright/test';

declare global {
  interface Window { __motion: { triggerCount(): number } }
}

test('ScrollTrigger count does not grow across View Transitions', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);

  const counts: number[] = [];
  counts.push(await page.evaluate(() => window.__motion.triggerCount()));

  for (let i = 0; i < 3; i++) {
    await page.goto('/privacy');
    await page.waitForTimeout(600);
    await page.goto('/');
    await page.waitForTimeout(1200);
    counts.push(await page.evaluate(() => window.__motion.triggerCount()));
  }

  // Every return to '/' must rebuild the same number of triggers.
  for (const c of counts) {
    expect(c).toBe(counts[0]);
  }
});

test('reduced motion leaves all content visible', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);

  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-animation]')]
      .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length
  );
  expect(hidden).toBe(0);
  await ctx.close();
});
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: `6 page(s) built`. The engine is not yet imported anywhere, so this only proves it typechecks.

- [ ] **Step 5: Commit**

```bash
git add src/motion/ tests/e2e/
git commit -m "feat: add motion engine with Lenis and lifecycle teardown"
```

---

### Task 5: Boot the engine and neutralise the old system

The ordering matters. Removing the old CSS that sets `opacity: 0` **before** sections are migrated would leave unmigrated content invisible. This task removes the *hiding* while leaving sections un-animated, so the site degrades to "visible, no motion" rather than "blank".

**Files:**
- Modify: `src/layouts/Layout.astro:146-245` (the `<script>` block)
- Modify: `src/styles/global.css:50` (`scroll-behavior`), `:465-504` (reveal keyframes and classes)

**Interfaces:**
- Consumes: `initMotion`, `teardownMotion` from `../motion`
- Produces: a booted engine; `astro:before-swap` and `astro:page-load` wired.

- [ ] **Step 1: Replace the Layout script block**

In the `<script>` block spanning lines 146-245, delete `initScrollAnimations()` (starts line 181) and `initParallax()` (starts line 213) entirely, along with their invocations at lines 238-239 and the `astro:page-load` listener at 242-244. Keep the page-loader logic above line 181 untouched. Append:

```ts
import { initMotion, teardownMotion } from '../motion';

initMotion();
document.addEventListener('astro:page-load', initMotion);
document.addEventListener('astro:before-swap', teardownMotion);
```

- [ ] **Step 2: Remove the scroll-behavior conflict**

In `src/styles/global.css`, delete `scroll-behavior: smooth;` from the `html` rule at line 50. Lenis owns scroll; leaving this causes the browser's native smooth-scroll to fight Lenis on anchor links. Leave line 53's reduced-motion `scroll-behavior: auto` rule in place.

- [ ] **Step 3: Stop the old classes hiding content**

Delete lines 482-497 from `global.css`: `.reveal`, `.reveal.is-visible`, `.reveal-scale.is-visible`, `.reveal-blur.is-visible`, `.section-reveal`, `.section-reveal.is-visible`, `.hero-animate` and its four `:nth-child` delay rules. Also delete the `@keyframes revealUp`, `revealScale`, `revealBlur` and `fadeInUp` blocks at lines 465-480.

Leave the `.section-reveal` **class attributes** in the markup for now — they become inert hooks and are removed in Task 10.

- [ ] **Step 4: Verify content is visible without motion**

Run: `npm run dev -- --port 4329`, open `http://localhost:4329/`, scroll the full page.
Expected: every section is visible and readable. No reveal animation yet — that is correct at this stage.

- [ ] **Step 5: Run the leak test**

Run: `npm run test:e2e`
Expected: both tests PASS. Trigger count will be 0 at every sample since no section is migrated yet, which still validates teardown wiring.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: `6 page(s) built`.

- [ ] **Step 7: Commit**

```bash
git add src/layouts/Layout.astro src/styles/global.css
git commit -m "refactor: boot motion engine, remove IntersectionObserver reveals"
```

---

### Task 6: Hero

Fixes a live bug. `Hero.astro:318` writes `transform: translateY(...)` on scroll, overwriting the `scale(1.02) → scale(1)` zoom from lines 69-75 — the zoom currently dies on first scroll. Composing both into one GSAP timeline makes the conflict structurally impossible.

**Files:**
- Modify: `src/components/Hero.astro` — markup, `<style>`, and delete the `<script>` (lines 281-332)

**Interfaces:**
- Consumes: `registerMotion` from `../motion`
- Produces: a `hero` custom handler registered on the engine.

- [ ] **Step 1: Add attributes to the markup**

On `.hero-bg` add `data-animation="hero"`. On the `<h1 class="disp hero-h">` add `data-animation="split" data-stagger`. On `.hero-tagline` add `data-animation="moveUp" data-delay="0.1"`. On `.hero-desc` add `data-animation="moveUp" data-delay="0.2"`. On `.hero-ctas` add `data-animation="moveUp" data-delay="0.3"`.

- [ ] **Step 2: Delete the old script**

Remove the entire `<script>` block at lines 281-332, including the `heroInitialized` guard and the `scroll` listener.

- [ ] **Step 3: Remove the CSS keyframe stagger**

In the component `<style>`, delete the `opacity: 0; transform: translateY(...); animation: heroFadeUp ...` declarations from `.hero-tagline`, `.hero-h`, `.hero-desc`, `.hero-ctas`, and `.scroll-indicator`, plus the `@keyframes heroFadeUp` block. GSAP now owns these. Delete `transform: scale(1.02)` and its `transition` from `.hero-img`, and the `.hero-fullscreen.is-loaded .hero-img` rule.

Keep the `@media (prefers-reduced-motion: reduce)` block — it is the fallback when the engine never initialises.

**Keep `.scroll-line`'s `scrollPulse` animation** (lines 187 and 197). It is an ambient CSS loop unrelated to scroll position, GSAP does not touch it, and it is correctly suppressed under reduced motion already. Only the `.scroll-indicator` entrance animation moves to GSAP.

- [ ] **Step 4: Register the hero handler**

Add a new `<script>` to `Hero.astro`:

```ts
import { registerMotion } from '../motion';

registerMotion('hero', (el, { gsap }) => {
  const img = el.querySelector('.hero-img');
  if (!img) return;

  // Zoom and drift on one timeline, so neither can clobber the other's transform.
  gsap.timeline({
    scrollTrigger: {
      trigger: el,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  })
    .fromTo(img, { scale: 1.08, yPercent: 0 }, { scale: 1, yPercent: 12, ease: 'none' }, 0);

  const indicator = document.querySelector('.scroll-indicator');
  if (indicator) {
    gsap.to(indicator, {
      opacity: 0,
      scrollTrigger: { trigger: el, start: 'top top', end: '30% top', scrub: true },
    });
  }
});
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev -- --port 4329`, open `http://localhost:4329/`.
Expected: headline reveals line-by-line on load; tagline, description and CTAs stagger in; scrolling drifts the background **and** the zoom persists rather than snapping — the bug is fixed.

- [ ] **Step 6: Run the tests**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all PASS; `6 page(s) built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/Hero.astro
git commit -m "feat: migrate hero to motion system, fix transform clobbering"
```

---

### Task 7: PhotoCarousel — velocity-reactive marquee

The most expensive-feeling effect on the reference, and the easiest to overdo. Tune against real photographs.

**Files:**
- Modify: `src/components/PhotoCarousel.astro`
- Modify: `src/styles/global.css:338-345` (remove `seamlessScroll`), `:866` (reduced-motion rule)

**Interfaces:**
- Consumes: `registerMotion` from `../motion`
- Produces: a `marquee` custom handler.

- [ ] **Step 1: Remove the CSS animation**

In `global.css`, delete `animation: seamlessScroll 40s linear infinite;` from `.carousel-track` (line 341), the `.carousel-track:hover { animation-play-state: paused; }` rule (line 344), and the `@keyframes seamlessScroll` block (starts line 345). Also remove `.carousel-track { animation: none; }` from the reduced-motion block at line 866 — with the CSS animation gone it has nothing to suppress.

- [ ] **Step 2: Add the attribute**

On the `.carousel-track` element add `data-animation="marquee" data-speed="40"`.

- [ ] **Step 3: Register the marquee handler**

```ts
import { registerMotion } from '../motion';
import { num } from '../motion/tokens';

registerMotion('marquee', (el, { gsap, ScrollTrigger }) => {
  const duration = num(el.getAttribute('data-speed'), 40);
  const direction = num(el.getAttribute('data-marquee'), 1) === 0 ? 1 : -1;

  // The track holds two copies of the strip, so -50% is one seamless cycle.
  const loop = gsap.to(el, {
    xPercent: 50 * direction,
    repeat: -1,
    duration,
    ease: 'none',
  });

  // Smooth the timeScale rather than snapping it to raw velocity.
  const setSpeed = gsap.quickTo(loop, 'timeScale', { duration: 0.4, ease: 'power2.out' });

  ScrollTrigger.create({
    onUpdate: (self) => {
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 1200, 3);
      setSpeed(boost);
    },
  });

  el.addEventListener('mouseenter', () => loop.pause());
  el.addEventListener('mouseleave', () => loop.play());
});
```

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:4329/#photos`.
Expected: the strip scrolls continuously; scrolling the page quickly accelerates it and it eases back to base speed; hover pauses it; drag and lightbox still work.

- [ ] **Step 5: Tune**

If the acceleration reads as frantic, lower the `3` cap in `Math.min(..., 3)` to `2`. This is a judgement call against real content — check it at both desktop and mobile widths.

- [ ] **Step 6: Run the tests**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all PASS; `6 page(s) built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/PhotoCarousel.astro src/styles/global.css
git commit -m "feat: replace CSS marquee with velocity-reactive GSAP marquee"
```

---

### Task 8: SelectedWork

**Files:**
- Modify: `src/components/SelectedWork.astro`

**Interfaces:**
- Consumes: the `moveUp` and `scale` primitives from Task 3
- Produces: nothing new

- [ ] **Step 1: Add attributes**

On the heading add `data-animation="split" data-stagger`. On the cards grid container add `data-animation="moveUp" data-stagger`. On each card's `img` add `data-animation="scale" data-from="1.15" data-to="1" data-scrub`.

- [ ] **Step 2: Remove the inert classes**

Delete `section-reveal` from the `<section id="work">` class list, and any `reveal` / `reveal-scale` / `delay-N` classes on inner elements — this file has 3 such occurrences. Their CSS was deleted in Task 5, so they are dead attributes.

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:4329/#work`.
Expected: heading reveals by line; cards rise in sequence; images settle from 1.15 to 1 as they scroll past, tracking scroll position rather than playing on a fixed timer.

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all PASS; `6 page(s) built`.

- [ ] **Step 5: Commit**

```bash
git add src/components/SelectedWork.astro
git commit -m "feat: migrate SelectedWork to motion system"
```

---

### Task 9: Remaining seven sections

Attribute application only, per the spec's section table. No new code.

**Files:**
- Modify: `src/components/DisciplinesStrip.astro`
- Modify: `src/components/FeaturedReel.astro`
- Modify: `src/components/About.astro`
- Modify: `src/components/Services.astro`
- Modify: `src/components/Testimonials.astro`
- Modify: `src/components/Contact.astro`
- Modify: `src/components/Partners.astro`

**Interfaces:**
- Consumes: the primitives from Task 3
- Produces: nothing new

- [ ] **Step 1: Apply attributes**

All selectors below are verified to exist in these files.

**Read this before placing any attribute — it is the rule Task 8 was fixed for.**
GSAP writes transforms as inline styles, and an inline style always beats a
stylesheet rule for the same property. So a `:hover` rule that sets `transform`
is permanently dead on any element GSAP animates. Two mitigations, and which one
applies depends on whether the animation is scrub-linked:

- **Non-scrub reveals** (`moveUp`, `fade`) complete, so the engine now applies
  `clearProps: 'transform'` on completion and hands the property back to CSS.
  These need no retargeting. This covers `.service-card:hover` under
  `Services.astro`'s `.svc-grid` stagger, and `.contact-form`'s fields.
- **Scrub-linked effects** (`parallax`, and `scale` with `data-scrub`) never
  complete — they are continuously driven by scroll — so `clearProps` cannot
  help. These must target a *different node* from the one CSS hovers. Hence the
  wrapper retargeting for `FeaturedReel` and `About` in the table below.

`fade` animates opacity only and writes no transform, so `.testimonial-card:hover`
and `.partner-link:hover` are unaffected — but verify that in the browser rather
than assuming, since GSAP's `force3D` can touch transform in some cases.

| file | element | attributes |
| ---- | ------- | ---------- |
| `DisciplinesStrip.astro` | `.disciplines-line` | `data-animation="split" data-stagger` |
| `FeaturedReel.astro` | `.reel-title` | `data-animation="split" data-stagger` |
| `FeaturedReel.astro` | `.reel-thumbnail` (the wrapper, **not** the `img`) | `data-animation="parallax" data-speed="0.6"` |
| `About.astro` | the `.disp` heading in `.about-content` | `data-animation="split" data-stagger` |
| `About.astro` | `.about-content` | `data-animation="moveUp" data-stagger` |
| `About.astro` | the `img` inside `.about-image` (**not** the `.about-image` figure) | `data-animation="scale" data-from="1.08" data-to="1" data-scrub` |
| `Services.astro` | the `.disp` heading in `.services-inner` | `data-animation="split" data-stagger` |
| `Services.astro` | `.svc-grid` | `data-animation="moveUp" data-stagger` |
| `Testimonials.astro` | `.testimonials-title` | `data-animation="split" data-stagger` |
| `Testimonials.astro` | `.testimonials-grid` | `data-animation="fade" data-stagger` |
| `Contact.astro` | `.contact-title` | `data-animation="split" data-stagger` |
| `Contact.astro` | `.contact-form` | `data-animation="moveUp" data-stagger` |
| `Partners.astro` | `.partner-logos` | `data-animation="fade" data-stagger` |

- [ ] **Step 2: Remove the dead animation classes**

Task 5 deleted the CSS behind `reveal`, `reveal-scale`, `reveal-blur`, `section-reveal` and `delay-1`…`delay-5`. The class attributes remain across the components and must now go — there are **23 occurrences in 10 files**.

Remove them from all ten components, not just the seven in this task (`SelectedWork.astro` and `PhotoCarousel.astro` also carry them).

**One is dynamic and will not show up in a plain-text search:** `Testimonials.astro:34` builds its class with a template literal —

```astro
<blockquote class={`testimonial-card reveal delay-${index + 1}`}>
```

which must become:

```astro
<blockquote class="testimonial-card">
```

Verify none remain:

```bash
grep -rnE 'reveal|delay-' src/components/ && echo "STILL PRESENT — remove these" || echo "clean"
```

- [ ] **Step 3: Verify every section animates**

Scroll the full page at `http://localhost:4329/`.
Expected: all ten sections animate; nothing stays invisible; no section jumps or double-animates.

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all PASS; `6 page(s) built`. The leak test now samples a non-zero trigger count, which is the meaningful version of that assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/
git commit -m "feat: apply motion primitives to remaining sections"
```

---

### Task 10: Final cleanup and cross-cutting verification

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/layouts/Layout.astro:74`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Remove dead CSS**

Delete `.delay-1` through `.delay-5` (lines 500-504) and the now-orphaned `.animate-on-scroll` selectors in the reduced-motion block (lines 855-863) from `global.css`. Confirm with `grep -n "reveal\|animate-on-scroll\|hero-animate\|delay-" src/styles/global.css` that only intentional rules remain.

- [ ] **Step 2: Fix the dead font preload**

`Layout.astro:74` preloads a Cormorant Garamond `v16` gstatic URL that returns 404 — Google rotated the version. The font still loads via the stylesheet further down, so the preload is a wasted request and the page's only console error. Delete that single `<link rel="preload">` line. Leave the Lora preload on line 75, which still resolves, and the `hero.jpg` image preload on line 65.

- [ ] **Step 3: Verify no console errors**

Open `http://localhost:4329/` with devtools open.
Expected: zero console errors, zero failed requests.

- [ ] **Step 4: Verify all six pages**

Visit `/`, `/privacy`, `/fr/`, `/fr/privacy`, `/de/`, `/de/privacy`.
Expected: motion works on each; navigating between them repeatedly does not degrade scroll.

- [ ] **Step 5: Verify reduced motion**

In devtools, Rendering → "Emulate CSS prefers-reduced-motion: reduce", reload.
Expected: all content visible, no animation, native scroll (no Lenis inertia).

- [ ] **Step 6: Verify touch**

In devtools, toggle device emulation to iPhone, reload.
Expected: reveals still animate; scroll is native, without Lenis inertia.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all PASS; `6 page(s) built`.

- [ ] **Step 8: Measure the bundle against baseline**

Read the gzip figures from the `npm run build` output. Baseline before this work was **5.06 kB gzip** (ClientRouter alone). Record the new total in the commit message. The spec budgeted ≈33 kB gzip; if the actual figure materially exceeds that, report it rather than absorbing it silently.

- [ ] **Step 9: Commit**

```bash
git add src/styles/global.css src/layouts/Layout.astro
git commit -m "chore: remove dead motion CSS and broken font preload"
```

---

## Verification Summary

Run before considering the work complete:

```bash
npm test          # unit: tokens, primitives
npm run test:e2e  # integration: trigger leak, reduced motion
npm run build     # must report 6 page(s) built
```

Manual checks that automation does not cover: marquee velocity feel against real photographs, hero zoom persistence while scrolling, and Lighthouse before/after.

## Known Follow-Ups (out of scope)

- `public/images/hero.jpg` is 1.7MB and marked `fetchpriority="high"`. Converting to WebP/AVIF is worth doing, especially now that the hero image carries scrub-linked motion.
- The outer `design_handoff_portfolio/src/` tree is a stale duplicate registered as a gitlink with no `.gitmodules`. It should be removed to prevent future edits landing in dead code.
