# Aperture Redesign — Milestone 2: Home Strips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the plain home links into Aperture's strips:
- grayscale tall strips on near-black;
- a single-color accent tint and the discipline name on hover or keyboard focus;
- an opening reveal from the center line;
- stacked horizontal bands on phones, with names always visible.

**Architecture:**
- CSS transitions read their durations and easings from CSS custom properties generated from `src/motion/tokens.ts`, so CSS and GSAP share one motion scale.
- The reveal is a pure tween builder (`src/home/strips.ts`), unit-tested, and registered as a motion handler named `strips`, so the engine's reduced-motion gate and teardown apply to it.
- The tint is a `::after` layer in the strip's accent with `mix-blend-mode: multiply`, faded by opacity. It's the CSS version the owner approved; milestone 6 adds the WebGL ripple over it.

**Tech Stack:** Astro 5, plain CSS, GSAP 3.15 (core only on this page), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-aperture-redesign-design.md` (§1 Home, §4 Home, Revision: two galleries).

## Global Constraints

- No new npm dependencies. Plain CSS in scoped `<style>` blocks.
- No inline durations or easings. CSS uses the `--dur-*` and `--ease-*` variables from Task 1; JS uses `tokens.ts`.
- An element's resting DOM state is its fully revealed state: no CSS `opacity: 0` or `clip-path` that only JS removes. The hover label at `opacity: 0` is a hover state, not a JS reveal, and it stays in the accessibility tree.
- **Reduced motion:** no reveal, and the tint and label appear without transition.
- **Touch devices** (`hover: none`): labels are always visible, and the tint shows on `:active`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test`, `npm run build && npm run test:build` and `npm run test:e2e` pass after every task.

---

### Task 1: CSS motion variables generated from tokens

**Files:**
- Modify: `src/motion/tokens.ts`, `src/layouts/Layout.astro`
- Test: `tests/unit/tokens.test.ts`, `tests/build/layout.test.ts`

**Interfaces:**
- Produces:
  - `CSS_EASE: { out: string; inOut: string }`, the cubic-bezier equivalents of `EASE.out` (power3.out) and `EASE.inOut` (power2.inOut)
  - `cssMotionVars(): string`, which returns `--dur-fast: 0.5s; --dur-base: 0.9s; --dur-slow: 1.4s; --ease-out: …; --ease-in-out: …;`
- Layout emits `<style is:inline>:root{…}</style>` with those variables, plus a reduced-motion override that sets every `--dur-*` to `0s`.

- [ ] **Step 1: Failing tests.** Append to `tests/unit/tokens.test.ts`:

```ts
import { CSS_EASE, cssMotionVars } from '../../src/motion/tokens';

describe('cssMotionVars', () => {
  it('mirrors the duration scale in seconds', () => {
    const css = cssMotionVars();
    expect(css).toContain(`--dur-fast: ${DURATION.fast}s;`);
    expect(css).toContain(`--dur-base: ${DURATION.base}s;`);
    expect(css).toContain(`--dur-slow: ${DURATION.slow}s;`);
  });

  it('mirrors the easing scale as the cubic-beziers GSAP documents for power3.out and power2.inOut', () => {
    expect(CSS_EASE.out).toBe('cubic-bezier(0.215, 0.61, 0.355, 1)');
    expect(CSS_EASE.inOut).toBe('cubic-bezier(0.455, 0.03, 0.515, 0.955)');
    expect(cssMotionVars()).toContain(`--ease-out: ${CSS_EASE.out};`);
    expect(cssMotionVars()).toContain(`--ease-in-out: ${CSS_EASE.inOut};`);
  });
});
```

Append to `tests/build/layout.test.ts`, inside `describe('layout')`:

```ts
  it.each(PAGES)('%s exposes the motion scale to CSS, zeroed under reduced motion', (file) => {
    const html = read(file);
    expect(html).toMatch(/:root\{--dur-fast: 0\.5s;/);
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\)\{:root\{--dur-fast: 0s; --dur-base: 0s; --dur-slow: 0s;\}\}/);
  });
```

- [ ] **Step 2: Run them.** Run `npx vitest run tests/unit/tokens.test.ts`. Expected: FAIL, because the import is missing.

- [ ] **Step 3: Implement.** Add to `src/motion/tokens.ts`:

```ts
/**
 * CSS equivalents of EASE, for transitions that cannot go through GSAP
 * (hover states). Values are the cubic-beziers GSAP documents for each ease.
 */
export const CSS_EASE = {
  out: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  inOut: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
} as const;

/** The motion scale as CSS custom properties; Layout.astro puts these on :root. */
export function cssMotionVars(): string {
  return [
    `--dur-fast: ${DURATION.fast}s;`,
    `--dur-base: ${DURATION.base}s;`,
    `--dur-slow: ${DURATION.slow}s;`,
    `--ease-out: ${CSS_EASE.out};`,
    `--ease-in-out: ${CSS_EASE.inOut};`,
  ].join(' ');
}
```

In `src/layouts/Layout.astro`, import `cssMotionVars` from `'../motion/tokens'` and add this right after the font preloads:

```astro
  <style is:inline set:html={`:root{${cssMotionVars()}}@media (prefers-reduced-motion: reduce){:root{--dur-fast: 0s; --dur-base: 0s; --dur-slow: 0s;}}`} />
```

- [ ] **Step 4: Run all suites.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(m2): expose the motion scale to CSS from tokens.ts`.

---

### Task 2: Strip reveal, as a pure builder and a motion handler

**Files:**
- Create: `src/home/strips.ts`
- Test: `tests/unit/strips.test.ts`

**Interfaces:**
- Consumes: `EASE`, `DURATION`, `STAGGER` from `src/motion/tokens.ts`.
- Produces:
  - `buildStripReveal(stacked: boolean): { clipPath: string; duration: number; ease: string; stagger: number; clearProps: string }`, the `gsap.from` vars.
  - `STRIPS_STACKED_QUERY = '(max-width: 760px)'`.
  - `registerStrips(): void`, which calls `registerMotion('strips', …)`.

- [ ] **Step 1: Failing test.** Create `tests/unit/strips.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStripReveal } from '../../src/home/strips';
import { DURATION, EASE, STAGGER } from '../../src/motion/tokens';

describe('buildStripReveal', () => {
  it('opens tall strips from their horizontal centre line', () => {
    expect(buildStripReveal(false).clipPath).toBe('inset(50% 0% 50% 0%)');
  });

  it('opens stacked bands from their vertical centre line', () => {
    expect(buildStripReveal(true).clipPath).toBe('inset(0% 50% 0% 50%)');
  });

  it('draws timing from the shared scale and leaves no inline clip-path behind', () => {
    expect(buildStripReveal(false)).toMatchObject({
      duration: DURATION.slow,
      ease: EASE.inOut,
      stagger: STAGGER.base,
      clearProps: 'clipPath',
    });
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement `src/home/strips.ts`:**

```ts
import { registerMotion } from '../motion';
import { DURATION, EASE, STAGGER } from '../motion/tokens';

/** Below this width the strips stack as horizontal bands (HomeView.astro's CSS uses the same breakpoint). */
export const STRIPS_STACKED_QUERY = '(max-width: 760px)';

export function buildStripReveal(stacked: boolean) {
  return {
    clipPath: stacked ? 'inset(0% 50% 0% 50%)' : 'inset(50% 0% 50% 0%)',
    duration: DURATION.slow,
    ease: EASE.inOut,
    stagger: STAGGER.base,
    clearProps: 'clipPath',
  };
}

export function registerStrips(): void {
  registerMotion('strips', (el, { gsap }) => {
    const media = el.querySelectorAll<HTMLElement>('[data-strip-media]');
    gsap.from(media, buildStripReveal(window.matchMedia(STRIPS_STACKED_QUERY).matches));
  });
}
```

`tests/unit` runs in Node, and importing `../motion` pulls in GSAP and Lenis. If the test errors on `window` or `document` during import, move `registerStrips` into `src/home/register-strips.ts` so that `strips.ts` imports only `tokens.ts`. Then use that path in Task 3.

- [ ] **Step 4: Run all suites.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(m2): strip reveal builder and motion handler`.

---

### Task 3: Strips: tint, label, stacked bands, and their browser tests

**Files:**
- Modify: `src/views/HomeView.astro`
- Create: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `registerStrips` (Task 2), and the `--dur-*` and `--ease-*` variables (Task 1).
- Produces these test hooks:
  - `ul[data-animation="strips"]`
  - `a.strip[data-discipline]`
  - `[data-strip-media]` (which carries the `::after` tint)
  - `.strip__label`

- [ ] **Step 1: Failing browser tests.** Create `tests/e2e/home.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const tint = (page: Page, slug: string) =>
  page.evaluate((s) => {
    const media = document.querySelector(`a[data-discipline="${s}"] [data-strip-media]`)!;
    return Number(getComputedStyle(media, '::after').opacity);
  }, slug);
const labelOpacity = (page: Page, slug: string) =>
  page.evaluate((s) => Number(getComputedStyle(document.querySelector(`a[data-discipline="${s}"] .strip__label`)!).opacity), slug);

test('hovering a strip floods it with its accent and names it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  expect(await tint(page, 'portrait')).toBe(0);
  expect(await labelOpacity(page, 'portrait')).toBe(0);
  await page.locator('a[data-discipline="portrait"]').hover();
  await page.waitForTimeout(800);
  expect(await tint(page, 'portrait')).toBe(1);
  expect(await labelOpacity(page, 'portrait')).toBe(1);
  expect(await tint(page, 'film'), 'only the hovered strip tints').toBe(0);
});

test('keyboard focus tints and names a strip too', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const slug = await page.evaluate(() => document.activeElement?.getAttribute('data-discipline'));
    if (slug) {
      await page.waitForTimeout(800);
      expect(await tint(page, slug)).toBe(1);
      expect(await labelOpacity(page, slug)).toBe(1);
      return;
    }
  }
  throw new Error('no strip received keyboard focus within 15 tabs');
});

test('strips end the reveal fully open, with no clip-path left inline', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  const clips = await page.$$eval('[data-strip-media]', (els) => els.map((e) => getComputedStyle(e).clipPath));
  expect(clips.every((c) => c === 'none')).toBe(true);
});

test('under reduced motion the strips are never clipped', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(100);
  const clips = await page.$$eval('[data-strip-media]', (els) => els.map((e) => getComputedStyle(e).clipPath));
  expect(clips.every((c) => c === 'none')).toBe(true);
  await ctx.close();
});

test('on a phone the strips stack as bands with their names showing', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(2500);
  const boxes = await page.$$eval('a.strip', (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
  for (const b of boxes) expect(b.width).toBeGreaterThan(280);
  expect(await labelOpacity(page, 'portrait')).toBe(1);
  await ctx.close();
});

test('cmd/ctrl-click opens the gallery in a new tab and leaves home alone', async ({ page, context }) => {
  await page.goto('/');
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('a[data-discipline="portrait"]').click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe('/work/portrait/');
  expect(new URL(page.url()).pathname).toBe('/');
});
```

- [ ] **Step 2: Run it.** Run `npx playwright test tests/e2e/home.spec.ts`. Expected: FAIL, because `[data-strip-media]` doesn't exist yet.

- [ ] **Step 3: Rewrite the markup, styles and script in `src/views/HomeView.astro`.** The frontmatter is unchanged. Replace `<main>` with:

```astro
  <main id="main-content" class="home">
    <h1 class="visually-hidden">{t(lang, 'home.heading')}</h1>
    <ul class="strips" data-animation="strips">
      {active.map(({ discipline, frames }) => (
        <li>
          <a
            class="strip"
            href={localizedPath(`/work/${discipline.slug}/`, lang)}
            data-discipline={discipline.slug}
            style={`--tint: ${discipline.accent}`}
          >
            <span class="strip__media" data-strip-media>
              <Image
                src={coverOf(frames)!.image}
                alt=""
                width={960}
                widths={[480, 960]}
                sizes="(max-width: 760px) 100vw, 122px"
                format="webp"
                quality={72}
                loading="eager"
              />
            </span>
            <span class="strip__label display">{t(lang, discipline.nameKey)}</span>
          </a>
        </li>
      ))}
    </ul>
  </main>
```

Replace the `<style>` block with:

```css
  .home { min-height: 100svh; display: grid; place-items: center; padding: 96px var(--gutter); }

  .strips { display: flex; gap: 22px; margin: 0; padding: 0; list-style: none; }

  .strip { position: relative; display: block; width: clamp(96px, 8.5vw, 122px); text-decoration: none; }
  .strip:focus-visible { outline-offset: 6px; }

  .strip__media { position: relative; display: block; aspect-ratio: 122 / 342; overflow: hidden; }
  .strip__media img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(1) contrast(1.05);
    transition: transform var(--dur-base) var(--ease-out);
  }
  /* The tint: the discipline's accent multiplied over the grayscale frame, so shadows stay dark and highlights take the color. */
  .strip__media::after {
    content: ''; position: absolute; inset: 0;
    background: var(--tint); mix-blend-mode: multiply;
    opacity: 0; transition: opacity var(--dur-fast) var(--ease-out);
  }

  .strip__label {
    position: absolute; left: 50%; top: calc(100% + 14px);
    translate: -50% 6px; white-space: nowrap;
    font-size: var(--step-label);
    opacity: 0; transition: opacity var(--dur-fast) var(--ease-out), translate var(--dur-fast) var(--ease-out);
  }

  .strip:hover .strip__media::after, .strip:focus-visible .strip__media::after, .strip:active .strip__media::after { opacity: 1; }
  .strip:hover img, .strip:focus-visible img { transform: scale(1.04); }
  .strip:hover .strip__label, .strip:focus-visible .strip__label { opacity: 1; translate: -50% 0; }

  @media (hover: none) {
    .strip__label { opacity: 1; translate: -50% 0; }
  }

  /* Same breakpoint as STRIPS_STACKED_QUERY in src/home/strips.ts. */
  @media (max-width: 760px) {
    .strips { flex-direction: column; gap: 28px; width: min(100%, 420px); }
    .strip { width: 100%; }
    .strip__media { aspect-ratio: 2.8; }
    .strip__label { position: static; display: block; margin-top: 8px; translate: none; opacity: 1; }
  }
```

Add after the style block:

```astro
<script>
  import { registerStrips } from '../home/strips';
  registerStrips();
</script>
```

- [ ] **Step 4: Run all suites,** including `npm run test:e2e`. Expected: PASS.

- [ ] **Step 5: Look at it.** Take screenshots at 375, 768 and 1440px: at rest, hovering Portraits, and mid-reveal at about 300ms after load. Then run `/impeccable critique` on the home page and fix any material finding that is in scope for the strips.

- [ ] **Step 6: Commit** with the message `feat(m2): Aperture strips with accent tint, centre-line reveal and stacked phone bands`.
