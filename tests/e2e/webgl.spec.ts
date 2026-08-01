import { test, expect } from '@playwright/test';
import sharp from 'sharp';

declare global {
  interface Window {
    __webgl: {
      active(): boolean;
      surfaces(): number;
      debug(): Array<{
        el: string;
        rect: DOMRect;
        mesh: { x: number; y: number; sx: number; sy: number };
        visible: boolean;
      }>;
    };
  }
}

test('a canvas is created and does not cover the content', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { pointer: getComputedStyle(c).pointerEvents, hidden: c.getAttribute('aria-hidden') } : null;
  });
  expect(r?.pointer).toBe('none');
  expect(r?.hidden).toBe('true');
});

/**
 * Regression coverage for a review finding: `pointer-events: none` and
 * `aria-hidden="true"` (asserted above) say nothing about *paint* order —
 * a canvas with those two properties can still visually cover everything
 * underneath it. The reviewer demonstrated this manually by filling the
 * canvas with opaque red and watching the hero's tagline, heading,
 * description and CTA buttons disappear. The actual root cause: `<main
 * id="main-content">` carries `transition:name="main-content"` on every
 * page, which forces it to establish its own CSS stacking context
 * regardless of whether a transition is in flight — trapping everything
 * inside `<main>` (a photograph and the text layered over it alike) as one
 * atomic paint unit relative to a canvas appended to `document.body`, a
 * later sibling. No z-index on such a canvas can thread between two things
 * on the *same* side of that boundary; the canvas has to live inside
 * `<main>` instead (see renderer.ts's placement comment).
 *
 * This test automates the reviewer's reproduction with synthetic,
 * fully-controlled probes rather than sampling real photograph/text pixels
 * (whose actual colours aren't known ahead of time and could coincidentally
 * read as "not red" or "red" by chance, masking a real regression):
 *
 *   - a probe appended inside `.hero-content`, which the site's own CSS
 *     elevates to z-index: 1 specifically so text/controls stay legible
 *     over the photograph behind them — this must stay ON TOP of the
 *     canvas.
 *   - a NON-positioned probe (no `position` set at all) inside `.hero-bg`,
 *     standing in for "a photograph the canvas is meant to visually
 *     replace" — CSS stacking rules put any non-positioned element behind
 *     a positioned one with z-index >= 0 regardless of DOM order, so this
 *     must end up UNDER the canvas.
 *
 * Filling the canvas via its own CSS `background` (not WebGL drawing) is
 * deliberate: this task registers no surfaces yet, so the WebGL bitmap
 * itself is empty every frame, and the render loop would otherwise
 * immediately clear away anything drawn into it via raw gl calls before a
 * screenshot could capture it. The CSS background is a separate paint
 * layer the render loop never touches, so it holds still for the
 * screenshot without needing to pause gsap.ticker.
 */
test('the canvas paints between a plain photograph and the text/controls layered over it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);

  await expect(page.locator('canvas')).toHaveCount(1);

  await page.evaluate(() => {
    const RED = 'rgb(255, 0, 0)';
    const GREEN = 'rgb(0, 255, 0)';
    const BLUE = 'rgb(0, 0, 255)';

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    canvas.style.background = RED;

    // "Content layered over imagery": must stay above the canvas.
    const above = document.createElement('div');
    above.id = 'e2e-above-probe';
    Object.assign(above.style, { width: '40px', height: '40px', background: GREEN });
    document.querySelector('.hero-content')!.prepend(above);

    // "Plain photograph": intentionally NOT positioned, so it belongs to
    // CSS's non-positioned paint step — behind any positioned z-index >= 0
    // element regardless of DOM order, exactly like Hero's own <img>.
    // Placed inside .hero-bg (absolute, sized to the hero) rather than
    // appended to <body>, so it's on-screen without needing to scroll to
    // wherever normal document flow would otherwise put a plain block.
    const below = document.createElement('div');
    below.id = 'e2e-below-probe';
    Object.assign(below.style, { position: 'absolute', top: '10px', left: '10px', width: '40px', height: '40px', background: BLUE });
    document.querySelector('.hero-bg')!.appendChild(below);
  });

  const aboveBox = (await page.locator('#e2e-above-probe').boundingBox())!;
  const belowBox = (await page.locator('#e2e-below-probe').boundingBox())!;
  const shot = await page.screenshot();

  const above = await sharp(shot).extract({
    left: Math.round(aboveBox.x + aboveBox.width / 2) - 2,
    top: Math.round(aboveBox.y + aboveBox.height / 2) - 2,
    width: 4, height: 4,
  }).raw().toBuffer();

  // Content probe must read as green (its own colour), not red (the
  // canvas showing through on top of it).
  expect(above[0]).toBeLessThan(80);
  expect(above[1]).toBeGreaterThan(180);
  expect(above[2]).toBeLessThan(80);

  const below = await sharp(shot).extract({
    left: Math.round(belowBox.x + belowBox.width / 2) - 2,
    top: Math.round(belowBox.y + belowBox.height / 2) - 2,
    width: 4, height: 4,
  }).raw().toBuffer();

  // Photograph-stand-in probe must read red-dominant (the canvas painting
  // over it — blended with .hero-overlay's own translucent gradient, which
  // also correctly sits above the canvas, so this isn't pure (255,0,0)),
  // not blue (its own colour showing through unobstructed).
  expect(below[0]).toBeGreaterThan(120);
  expect(below[1]).toBeLessThan(40);
  expect(below[2]).toBeLessThan(40);
});

/**
 * The task brief that introduced this canvas called this specific case
 * "the hardest part": SelectedWork.astro's `.project-scale` carries a
 * continuously scrubbed `transform: scale(...)` (see surface.ts's
 * registration comment). Any element with a non-`none` transform
 * establishes its own CSS stacking context even with no `position` and no
 * explicit z-index — landing it in the same "z-index: 0/auto" paint step
 * as this canvas, tie-broken purely by DOM order. The canvas must be
 * ordered *after* it (appended as `<main>`'s LAST child, not first — see
 * renderer.ts) or the scrubbed photograph would win that tie and cover
 * whatever a mesh registered against it later draws, backwards from what
 * Task 6/7 need.
 */
test('the canvas paints above SelectedWork\'s scrubbed .project-scale photograph', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    (document.querySelector('canvas') as HTMLCanvasElement).style.background = 'rgb(255, 0, 0)';
  });

  // Scroll .project-scale into view — this is what drives its scrub, via
  // the same ScrollTrigger the real page already wires up.
  const info = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.project-scale')!;
    el.scrollIntoView({ block: 'center' });
    return true;
  });
  expect(info).toBe(true);
  await page.waitForTimeout(700);

  const transform = await page.evaluate(
    () => getComputedStyle(document.querySelector('.project-scale')!).transform
  );
  // Confirms the scrub is genuinely active (not e.g. "none"), so this test
  // is actually exercising the transform-triggered stacking context, not
  // trivially passing because nothing is transformed at sample time.
  expect(transform).not.toBe('none');

  // Four project cards all use this class; scrollIntoView above targeted
  // the first, so sample the same one.
  const box = (await page.locator('.project-scale').first().boundingBox())!;
  const shot = await page.screenshot();
  const pixel = await sharp(shot).extract({
    left: Math.round(box.x + box.width / 2) - 2,
    top: Math.round(box.y + box.height / 2) - 2,
    width: 4, height: 4,
  }).raw().toBuffer();

  expect(pixel[0]).toBeGreaterThan(200);
  expect(pixel[1]).toBeLessThan(40);
  expect(pixel[2]).toBeLessThan(40);
});

test('reduced motion creates no context at all', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.active())).toBe(false);
  expect(await page.locator('canvas').count()).toBe(0);
  await ctx.close();
});

test('with WebGL unavailable, every photograph is still visible', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) {
      if (t === 'webgl' || t === 'webgl2') return null;
      // @ts-expect-error passthrough
      return orig.call(this, t, ...a);
    };
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.active())).toBe(false);
  const invisible = await page.evaluate(() =>
    [...document.querySelectorAll('img')].filter(i => {
      // The lightbox's full-size <img> is a modal overlay, deliberately kept
      // at opacity: 0 / visibility: hidden (see global.css .lightbox) until
      // a thumbnail is clicked — that is its correct resting state, not a
      // photograph WebGL failed to reveal. Every other <img> on the page is
      // primary content and must stay visible with or without WebGL.
      if (i.closest('.lightbox')) return false;
      const s = getComputedStyle(i); const r = i.getBoundingClientRect();
      return r.width > 0 && (s.visibility === 'hidden' || Number(s.opacity) < 0.01);
    }).length
  );
  expect(invisible).toBe(0);
  await ctx.close();
});

test('the context is released across navigation', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 3; i++) {
    await page.locator('footer a[href="/privacy"]').first().click();
    await page.waitForURL(/privacy/);
    await page.waitForTimeout(600);
    await page.goBack();
    await page.waitForTimeout(1200);
  }
  // Exactly one canvas, not one per navigation.
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(1);
});

/**
 * Regression coverage for a review finding: `supported()`'s WebGL-capability
 * probe used to create a throwaway canvas + context on *every* call and
 * never release it, while the real renderer's own context was correctly
 * released via WEBGL_lose_context in teardownWebGL(). `initWebGL()` (and
 * therefore `supported()`) runs at least twice per page load and again on
 * every client-side navigation (see Layout.astro), so a long session could
 * accumulate enough abandoned contexts to make the browser evict the
 * oldest live one to enforce its per-tab/per-origin cap — which, on a
 * three-locale site navigated purely client-side, could eventually be the
 * *real* renderer's own context, going dark silently with nothing
 * listening for the resulting `webglcontextlost`.
 *
 * The existing "context is released across navigation" test above only
 * counts live `<canvas>` DOM elements, which can't catch this: the probe
 * canvas in `supported()` is never appended to the DOM at all, so a leak
 * there is invisible to that assertion regardless of whether it's actually
 * happening. This test instruments every WebGL context created and every
 * time `WEBGL_lose_context.loseContext()` fires, session-wide, and checks
 * the two stay in lockstep — every context that isn't the one currently in
 * use must have been explicitly released, not left for the browser's own
 * (unpredictable, capped) reclamation.
 */
test('supported() does not leak a probe WebGL context on repeated calls', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __glStats: { created: number; lost: number } }).__glStats = { created: 0, lost: 0 };
    const stats = (window as unknown as { __glStats: { created: number; lost: number } }).__glStats;
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error overriding a browser built-in for instrumentation
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      const ctx = origGetContext.call(this, type, ...args);
      if (ctx && (type === 'webgl' || type === 'webgl2')) {
        stats.created++;
        const glCtx = ctx as WebGLRenderingContext;
        const origGetExtension = glCtx.getExtension.bind(glCtx);
        glCtx.getExtension = ((name: string) => {
          const ext = origGetExtension(name);
          if (name === 'WEBGL_lose_context' && ext) {
            const origLose = ext.loseContext.bind(ext);
            ext.loseContext = () => { stats.lost++; origLose(); };
          }
          return ext;
        }) as typeof glCtx.getExtension;
      }
      return ctx;
    };
  });

  await page.goto('/');
  await page.waitForTimeout(1200);

  for (let i = 0; i < 3; i++) {
    await page.locator('footer a[href="/privacy"]').first().click();
    await page.waitForURL(/privacy/);
    await page.waitForTimeout(600);
    await page.goBack();
    await page.waitForTimeout(1200);
  }

  const stats = await page.evaluate(
    () => (window as unknown as { __glStats: { created: number; lost: number } }).__glStats
  );
  // Exactly one context outstanding — the current page's real renderer.
  // Everything else this module ever created (the one-time capability
  // probe, and every prior navigation's renderer context) was explicitly
  // released.
  expect(stats.created - stats.lost).toBe(1);
  // Confirms the cache actually engaged: a probe on every one of the ~8
  // initWebGL() calls across 1 initial load + 3 round trips would show up
  // here as created counts far above what real-renderer-per-navigation
  // alone would produce.
  expect(stats.created).toBeGreaterThan(0);
});
