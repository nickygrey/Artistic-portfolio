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
 *   - a probe inside `.hero-bg`, standing in for "a photograph the canvas
 *     is meant to visually replace". It is `position: absolute` with no
 *     explicit z-index, landing in the SAME "z-index: 0/auto" paint step
 *     as the canvas (not the plain non-positioned step — that distinction
 *     matters, see the comment at its creation below) — it must still end
 *     up UNDER the canvas because it is earlier in `<main>`'s DOM order,
 *     the same tie-break mechanism `.project-scale` is tested against
 *     below.
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

    // "Plain photograph" stand-in. This is `position: absolute` (not
    // literally non-positioned) with z-index left at `auto`, so it lands in
    // the same "z-index: 0/auto" tied paint step as the canvas — it wins or
    // loses that tie by DOM order alone, same as Hero's own <img> actually
    // does (Hero.astro's registerMotion('hero', ...) puts a continuous
    // GSAP `scale` scrub on it, present from the first frame, which
    // establishes its own untagged stacking context too — see renderer.ts's
    // z-index comment). Placed inside .hero-bg (sized to the hero, earlier
    // in <main> than the canvas, which is appended as <main>'s LAST child)
    // rather than appended to <body>, so it's on-screen without needing to
    // scroll to wherever normal document flow would otherwise put a plain
    // block, and so it genuinely exercises the DOM-order tie-break rather
    // than a step the canvas would win unconditionally regardless of order.
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

/**
 * Regression coverage for a re-review finding: the two `Hero.astro` changes
 * this task made (`.hero-bg` dropping its `z-index: -1`, `.hero-overlay`
 * gaining an explicit `z-index: 1`) had no test coverage at all — the full
 * 67-unit/46-e2e suite stayed green with either one individually reverted,
 * even though both are load-bearing: revert either and `.hero-overlay`'s
 * readability gradient is silently swallowed by whatever a mesh draws over
 * the hero, the moment Task 6 registers one.
 *
 * This registers a REAL surface over `.hero-img` with an opaque fragment
 * shader — exactly what Task 6 will do — and asserts the gradient's three
 * darkening stops (0.3 / 0.5 / 0.7 opacity black, top to bottom) are still
 * visible on top of the mesh, rather than a flat, undarkened mesh colour.
 * Dynamic `import('/src/webgl/index.ts')` resolves against the same Vite
 * dev server `astro dev` (this suite's webServer) already serves raw TS
 * modules from, and hits the same module cache `initWebGL()` already
 * populated from Layout.astro's script — so `registerSurface()` attaches to
 * the live, already-running scene rather than a separate one.
 *
 * Verified by reverting each of the two Hero.astro changes in turn and
 * re-running this test — both individually turned it red (task-5-report.md
 * documents the exact revert and restore commands used).
 */
test('.hero-overlay darkens a registered surface instead of being hidden beneath it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);

  await page.evaluate(async () => {
    const mod = await import('/src/webgl/index.ts');
    const img = document.querySelector('.hero-img') as HTMLImageElement;
    mod.registerSurface(img, {
      fragment: `
        precision highp float;
        void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }
      `,
    });
  });
  // Let at least one gsap.ticker frame render the newly-registered mesh.
  await page.waitForTimeout(300);

  const heroBox = (await page.locator('.hero-bg').boundingBox())!;
  const shot = await page.screenshot();

  async function meanRedAt(yFrac: number): Promise<number> {
    const y = Math.max(0, Math.round(heroBox.y + heroBox.height * yFrac) - 2);
    const x = Math.max(0, Math.round(heroBox.x + heroBox.width / 2) - 20);
    const region = await sharp(shot)
      .extract({ left: x, top: y, width: 40, height: 4 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0, count = 0;
    for (let i = 0; i < region.data.length; i += region.info.channels) {
      sum += region.data[i];
      count++;
    }
    return sum / count;
  }

  const top = await meanRedAt(0.05);
  const mid = await meanRedAt(0.5);
  const bottom = await meanRedAt(0.95);

  // The opaque magenta mesh's red channel is 255 everywhere on its own;
  // .hero-overlay's gradient must darken it strictly more towards the
  // bottom, and even the lightest (top) stop must show *some* darkening —
  // a flat 255/255/255 here means the gradient is not actually on top of
  // the mesh, which is exactly what happens if either Hero.astro change is
  // reverted (the mesh instead paints over the gradient, or the whole
  // .hero-bg subtree — image and gradient bundled together — sits entirely
  // behind the canvas).
  expect(top).toBeLessThan(250);
  expect(top).toBeGreaterThan(mid);
  expect(mid).toBeGreaterThan(bottom);
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
 * Instruments every `HTMLCanvasElement.getContext('webgl'|'webgl2')` call
 * and every `WEBGL_lose_context.loseContext()` invocation, session-wide,
 * into `window.__glStats`. Shared by both tests below via `addInitScript`
 * so the exact same instrumentation backs both assertions.
 */
function installGlStatsProbe(): void {
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
}

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
 *
 * Note on what this specific test does and doesn't prove: `created - lost`
 * stays at 1 whether or not the probe result is *cached* — an uncached
 * `supported()` that creates a fresh probe context on every call and
 * releases it immediately still keeps created/lost in lockstep, since each
 * extra probe nets to zero. This test proves the *release* half of the fix
 * (nothing is ever abandoned); it does not by itself prove caching engaged.
 * See the next test for that.
 */
test('supported() does not leak a probe WebGL context on repeated calls', async ({ page }) => {
  await page.addInitScript(installGlStatsProbe);

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
});

/**
 * Regression coverage for the gap the previous test's own comment used to
 * overstate: that test's `created - lost === 1` invariant holds regardless
 * of whether `supported()`'s probe result is cached, so it cannot tell a
 * working cache apart from a probe that is simply re-created and
 * re-released correctly every time. This test isolates the cache directly:
 * it fires several `initWebGL()`/`teardownWebGL()` cycles back-to-back
 * *without navigating* (so the number of cycles is exact, not an estimate
 * of how many the lifecycle wiring produces), and checks the ABSOLUTE
 * count of contexts created — a metric the delta-based test above never
 * inspects. With caching, each cycle after the first creates exactly one
 * new context (the real renderer only; the probe was already answered).
 * Without it, each cycle would create two (a fresh probe alongside the
 * real renderer), so the same five cycles would produce roughly ten.
 */
test("supported()'s capability probe is cached, not re-created every call", async ({ page }) => {
  await page.addInitScript(installGlStatsProbe);

  await page.goto('/');
  await page.waitForTimeout(1200);

  const before = await page.evaluate(
    () => (window as unknown as { __glStats: { created: number } }).__glStats.created
  );

  const CYCLES = 5;
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) {
      document.dispatchEvent(new Event('astro:before-swap'));
      document.dispatchEvent(new Event('astro:page-load'));
    }
  }, CYCLES);

  const after = await page.evaluate(
    () => (window as unknown as { __glStats: { created: number } }).__glStats.created
  );

  // Exactly one new context per cycle (the real renderer), not two — the
  // capability probe was answered once, before this loop ever ran, and
  // every one of these five re-inits reused that cached answer instead of
  // creating and releasing another throwaway context.
  expect(after - before).toBe(CYCLES);
});
