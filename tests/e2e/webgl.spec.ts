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

/**
 * The renderer tears WebGL down for the rest of a page's life if it measures
 * under 50fps over its first 60 frames (see renderer.ts's fpsGuard), and the
 * very first page this dev server serves is compiling TypeScript modules and
 * generating the hero's responsive image derivatives while those 60 frames
 * are being counted. Measured on a cold server: ~30fps for the first load and
 * WebGL correctly, but unhelpfully, disabled about two seconds in; ~120fps
 * and stable on every load after it. This warms the server before any test
 * asserts anything, so the suite exercises the steady state rather than
 * racing a cold start. It asserts nothing itself — it cannot mask a failure.
 */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.close();
});

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
 * deliberate: anything drawn into the WebGL bitmap with raw gl calls would
 * be cleared again by the very next render-loop frame, before a screenshot
 * could capture it. The CSS background is a separate paint layer the render
 * loop never touches, so it holds still for the screenshot without needing
 * to pause gsap.ticker.
 *
 * That fill sits *behind* the WebGL bitmap, though, and since Task 6 the
 * hero carries a real, opaque mesh covering exactly the region the `below`
 * probe is planted in — which would hide the fill and make this test read
 * the photograph instead of the controlled colour it is asserting about.
 * Hiding `.hero-img` culls that mesh (surface.ts derives visibility from the
 * element's live rect, and a display:none element's rect is all zeroes)
 * without touching the canvas, its z-index, its place in the DOM, or either
 * probe — so the paint-order question this test exists to answer is asked in
 * exactly the same terms as before.
 */
test('the canvas paints between a plain photograph and the text/controls layered over it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);

  await expect(page.locator('canvas')).toHaveCount(1);
  await page.addStyleTag({ content: '.hero-img { display: none !important; }' });
  await page.waitForTimeout(200);

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

// ---------------------------------------------------------------------------
// Task 6: the hero displacement/grain surface.
// ---------------------------------------------------------------------------

/**
 * Mean luminance of a WxH patch of a screenshot, so a pixel claim is a
 * measurement rather than a spot check of one possibly-antialiased pixel.
 */
async function meanLuma(shot: Buffer, left: number, top: number, width: number, height: number): Promise<number> {
  const r = await sharp(shot)
    .extract({ left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)), width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < r.data.length; i += r.info.channels) {
    sum += 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2];
    n++;
  }
  return sum / n;
}

test('the hero surface registers and tracks its image while scrolling', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBeGreaterThan(0);

  // Registration must hold MID-scroll, not only at rest — the hero image is
  // continuously transformed by GSAP, and drift only appears in motion.
  // Compare the mesh's world position against the position the element's LIVE
  // rect implies, using the same projection maths the surface uses. Asserting
  // the canvas is viewport-sized would prove nothing about the mesh.
  const drift = await page.evaluate(async () => {
    window.scrollTo(0, 320);
    await new Promise(r => setTimeout(r, 500));

    const s = window.__webgl.debug().find(d => d.el.includes('hero-img'));
    if (!s) return null;

    const fov = 45, camZ = 5;
    const h = 2 * Math.tan((fov * Math.PI) / 360) * camZ;
    const w = h * (window.innerWidth / window.innerHeight);
    const expectX = ((s.rect.left + s.rect.width / 2) / window.innerWidth - 0.5) * w;
    const expectY = -((s.rect.top + s.rect.height / 2) / window.innerHeight - 0.5) * h;

    return {
      dx: Math.abs(s.mesh.x - expectX),
      dy: Math.abs(s.mesh.y - expectY),
      scrolled: window.scrollY,
    };
  });

  expect(drift).not.toBeNull();
  expect(drift!.scrolled).toBeGreaterThan(0);   // we really are mid-scroll
  expect(drift!.dx).toBeLessThan(0.02);          // world units, ~1px at this fov
  expect(drift!.dy).toBeLessThan(0.02);
});

/**
 * The test above samples once, 500ms after a programmatic jump — by which
 * point the page has largely settled, so it can only catch a mesh that is
 * permanently misplaced, not one that lags or swims while the scroll is
 * actually running. This one samples every animation frame throughout a real
 * wheel-driven scroll (Lenis intercepts the wheel and animates the scroll
 * from inside gsap.ticker, which is the code path a visitor exercises and
 * `window.scrollTo` does not), and asserts the WORST frame, not the last one.
 *
 * It also checks scale, which the position-only assertion above cannot: the
 * hero <img> is under a continuously scrubbed `scale` tween, so its rect
 * changes size every frame as well as moving, and a mesh that tracked
 * position but not size would sit correctly centred over a photograph of the
 * wrong dimensions.
 */
test('the hero mesh holds registration on every frame of a real wheel scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(1);

  await page.evaluate(() => {
    (window as unknown as { __samples: unknown[] }).__samples = [];
    const out = (window as unknown as { __samples: unknown[] }).__samples;
    const started = performance.now();
    (function loop() {
      const s = window.__webgl.debug().find(d => d.el.includes('hero-img'));
      if (s) {
        const h = 2 * Math.tan((45 * Math.PI) / 360) * 5;
        const w = h * (window.innerWidth / window.innerHeight);
        out.push({
          dx: Math.abs(s.mesh.x - (((s.rect.left + s.rect.width / 2) / window.innerWidth - 0.5) * w)),
          dy: Math.abs(s.mesh.y - (-((s.rect.top + s.rect.height / 2) / window.innerHeight - 0.5) * h)),
          dsx: Math.abs(s.mesh.sx - (s.rect.width / window.innerWidth) * w),
          dsy: Math.abs(s.mesh.sy - (s.rect.height / window.innerHeight) * h),
          top: s.rect.top,
          height: s.rect.height,
          scrollY: window.scrollY,
        });
      }
      if (performance.now() - started < 3000) requestAnimationFrame(loop);
    })();
  });

  await page.mouse.move(640, 450);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(2200);

  const samples = await page.evaluate(
    () => (window as unknown as {
      __samples: Array<{ dx: number; dy: number; dsx: number; dsy: number; top: number; height: number; scrollY: number }>;
    }).__samples
  );

  expect(samples.length).toBeGreaterThan(60);

  // Prove this really sampled motion rather than a still page: the scroll
  // visited many distinct positions, the element's rect travelled most of a
  // viewport, and its height genuinely changed (the scale scrub was live).
  // Without these, "no drift" would be the trivially true statement that a
  // stationary mesh sits over a stationary element.
  const tops = samples.map(s => s.top);
  const heights = samples.map(s => s.height);
  expect(new Set(samples.map(s => s.scrollY)).size).toBeGreaterThan(20);
  expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(300);
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(20);

  const worst = (key: 'dx' | 'dy' | 'dsx' | 'dsy') => Math.max(...samples.map(s => s[key]));
  expect(worst('dx')).toBeLessThan(0.02);
  expect(worst('dy')).toBeLessThan(0.02);
  expect(worst('dsx')).toBeLessThan(0.02);
  expect(worst('dsy')).toBeLessThan(0.02);
});

/**
 * The mesh is opaque and covers the hero photograph completely, so "a surface
 * is registered" says nothing about whether a visitor sees the photograph, a
 * stretched version of it, a different crop of it, or a black rectangle. This
 * renders the same page twice — once normally, once with WebGL refused so the
 * DOM <img> is what shows — and compares the hero region of the two.
 *
 * This is the assertion that catches the `object-fit: cover` correction being
 * absent or wrong. Sampling `texture2D(tMap, vUv)` with the plane's raw UVs
 * squashes the whole 2400x1943 photograph into a full-viewport box, which is
 * NOT what the DOM <img> shows. Measured, with the correction removed: mean
 * cell difference 2.55 / max 67 at 1280x900, 3.96 / 66 at 1920x1080 and
 * 5.87 / 80 at 390x844. With it: 0.20 / 2, 0.16 / 1 and 0.25 / 2 — residuals
 * that are the shader's own film grain, nothing else.
 */
async function heroScreenshot(
  browser: import('@playwright/test').Browser,
  viewport: { width: number; height: number },
  { webgl }: { webgl: boolean }
): Promise<Buffer> {
  const ctx = await browser.newContext({ viewport });
  if (!webgl) {
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) {
        if (t === 'webgl' || t === 'webgl2') return null;
        // @ts-expect-error passthrough
        return orig.call(this, t, ...a);
      };
    });
  }
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  // The scroll indicator pulses on a CSS keyframe loop; freezing it removes
  // the one element that would otherwise differ between two screenshots for
  // reasons that have nothing to do with the mesh.
  await page.addStyleTag({ content: '.scroll-line { animation: none !important; }' });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(webgl ? 1 : 0);
  const shot = await page.screenshot();
  await ctx.close();
  return shot;
}

/** Coarse-grid difference between two same-sized screenshots' hero regions. */
async function heroDiff(a: Buffer, b: Buffer, viewport: { width: number; height: number }) {
  const cells = async (buf: Buffer) =>
    sharp(buf)
      .extract({ left: 0, top: 0, width: viewport.width, height: viewport.height })
      .resize(40, 30, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
  const x = await cells(a);
  const y = await cells(b);
  let sum = 0, max = 0, n = 0;
  for (let i = 0; i < x.data.length; i += x.info.channels) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(x.data[i + c] - y.data[i + c]);
      sum += d;
      if (d > max) max = d;
      n++;
    }
  }
  return { mean: sum / n, max };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`the hero mesh draws the photograph itself, uncropped and undistorted (${viewport.width}x${viewport.height})`, async ({ browser }) => {
    const withGl = await heroScreenshot(browser, viewport, { webgl: true });
    const withoutGl = await heroScreenshot(browser, viewport, { webgl: false });
    const { mean, max } = await heroDiff(withGl, withoutGl, viewport);

    // Grain alone lands around 0.2 mean / 2 max; a missing cover correction
    // lands at 2.5-5.9 mean / 66-80 max. These thresholds sit an order of
    // magnitude clear of the former and well under the latter.
    expect(mean).toBeLessThan(1.2);
    expect(max).toBeLessThan(15);
  });
}

/**
 * Regression coverage for a defect carried into this task: `.scroll-indicator`
 * is `position: absolute` with a transform and, before this task, no z-index,
 * which put it in the same "z-index: 0/auto" paint bucket as the WebGL canvas
 * and earlier in <main>'s DOM order — so the moment a real mesh covered the
 * hero photograph it covered the scroll cue too. Measured before the fix, at
 * both viewports and in both themes: the indicator's own column read the same
 * luminance as the photograph either side of it, i.e. none of its pixels
 * survived.
 *
 * Compares the indicator's column against the photograph immediately left and
 * right of it, rather than against an absolute colour, so it measures the cue
 * being *visible* rather than the mesh happening to be some expected shade.
 * The pulse animation is frozen so the sample does not depend on catching the
 * right moment of a 2s opacity loop.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`.scroll-indicator stays visible above the hero mesh (${theme} theme)`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(1);
    await page.addStyleTag({ content: '.scroll-line { animation: none !important; }' });
    await page.waitForTimeout(200);

    const box = (await page.locator('.scroll-line').boundingBox())!;
    const shot = await page.screenshot();

    const top = box.y + 2;
    const height = Math.max(4, Math.round(box.height * 0.4));
    const centreX = box.x + box.width / 2;
    const centre = await meanLuma(shot, centreX - 1, top, 3, height);
    const left = await meanLuma(shot, centreX - 22, top, 3, height);
    const right = await meanLuma(shot, centreX + 20, top, 3, height);

    // Measured: ~38 with the fix, ~0.3 without it, in both themes.
    expect(centre - (left + right) / 2).toBeGreaterThan(15);
    await ctx.close();
  });
}

/**
 * The degradation contract, checked as a visitor would experience it rather
 * than as a stylesheet: on a locked-down machine where WebGL is refused, the
 * hero must show the photograph, at the right size and in the right place —
 * not a blank rectangle where the work should be. `opacity`/`visibility`
 * assertions (covered elsewhere in this file) cannot tell a photograph from
 * an empty box, so this measures real pixels: the hero must carry the tonal
 * variation of a photograph, and its <img> must actually cover the section.
 */
test('with WebGL refused, the hero photograph is present, positioned and not a blank rectangle', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
  expect(await page.locator('canvas').count()).toBe(0);

  const geometry = await page.evaluate(() => {
    const img = document.querySelector('.hero-img') as HTMLImageElement;
    const section = document.querySelector('.hero-fullscreen') as HTMLElement;
    const i = img.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      opacity: Number(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      decoded: img.naturalWidth > 0 && img.complete,
      coversWidth: i.left <= s.left + 1 && i.right >= s.right - 1,
      coversHeight: i.top <= s.top + 1 && i.bottom >= s.bottom - 1,
      centredX: Math.abs((i.left + i.right) / 2 - (s.left + s.right) / 2),
      centredY: Math.abs((i.top + i.bottom) / 2 - (s.top + s.bottom) / 2),
    };
  });

  expect(geometry.decoded).toBe(true);
  expect(geometry.opacity).toBe(1);
  expect(geometry.visibility).toBe('visible');
  expect(geometry.display).not.toBe('none');
  // The GSAP zoom scrub leaves the <img> slightly larger than the section at
  // rest, so it must fully cover it, concentrically — never be inset or offset.
  expect(geometry.coversWidth).toBe(true);
  expect(geometry.coversHeight).toBe(true);
  expect(geometry.centredX).toBeLessThan(2);
  expect(geometry.centredY).toBeLessThan(2);

  // A region of the hero that carries no text, so the variation measured is
  // the photograph's own and not the headline's.
  const shot = await page.screenshot();
  const r = await sharp(shot)
    .extract({ left: 880, top: 140, width: 380, height: 520 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < r.data.length; i += r.info.channels) {
    const l = 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2];
    sum += l; sumSq += l * l; n++;
  }
  const mean = sum / n;
  const sd = Math.sqrt(sumSq / n - mean * mean);
  // A flat fill of any colour scores 0 here; this photograph scores ~29.
  expect(sd).toBeGreaterThan(8);
  await ctx.close();
});

/**
 * Under reduced motion nothing initialises — no Lenis, no scan, no WebGL — so
 * the hero has to stand entirely on its authored resting state. This is the
 * other half of the degradation contract and a live path (a real OS setting),
 * not a hypothetical: it checks the photograph AND the scroll cue are both
 * really there, since the cue's own opacity is otherwise driven by a
 * ScrollTrigger that never gets created here.
 */
test('under reduced motion the hero photograph and scroll cue are both visible with no canvas', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);

  expect(await page.locator('canvas').count()).toBe(0);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(0);

  const state = await page.evaluate(() => {
    const img = document.querySelector('.hero-img') as HTMLImageElement;
    const indicator = document.querySelector('.scroll-indicator') as HTMLElement;
    const line = document.querySelector('.scroll-line') as HTMLElement;
    return {
      imgOpacity: Number(getComputedStyle(img).opacity),
      imgDecoded: img.naturalWidth > 0,
      imgWidth: img.getBoundingClientRect().width,
      indicatorOpacity: Number(getComputedStyle(indicator).opacity),
      indicatorHeight: line.getBoundingClientRect().height,
    };
  });
  expect(state.imgOpacity).toBe(1);
  expect(state.imgDecoded).toBe(true);
  expect(state.imgWidth).toBeGreaterThan(1000);
  expect(state.indicatorOpacity).toBe(1);
  expect(state.indicatorHeight).toBeGreaterThan(10);
  await ctx.close();
});

/**
 * The smear is driven by `uVelocity`, and the failure mode that matters is
 * not "it never moves" but "it never stops": ScrollTrigger's onUpdate stops
 * firing the moment scrolling ends, so a naive feed leaves the last, highest
 * reading latched and smears the photograph permanently. Measured here as the
 * uniform the shader actually reads, over a real scroll and the seconds after
 * it, rather than as anything a computed style could report.
 */
test('uVelocity rises with a scroll, stays clamped, and returns to rest afterwards', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(1);

  const trace = await page.evaluate(async () => {
    const mod = await import('/src/webgl/shaders/hero.ts');
    const out: Array<{ t: number; v: number }> = [];
    const started = performance.now();
    const done = new Promise<void>(resolve => {
      (function loop() {
        out.push({ t: performance.now() - started, v: mod.heroUniforms.uVelocity.value });
        if (performance.now() - started < 3200) requestAnimationFrame(loop);
        else resolve();
      })();
    });
    setTimeout(() => window.scrollTo({ top: 700, behavior: 'smooth' }), 200);
    await done;
    return out;
  });

  const atRestBefore = trace.filter(s => s.t < 150).map(s => s.v);
  const during = trace.filter(s => s.t >= 200 && s.t < 1200).map(s => s.v);
  const atRestAfter = trace.filter(s => s.t > 2600).map(s => s.v);

  expect(Math.max(...atRestBefore)).toBe(0);
  // It genuinely responds to the scroll...
  expect(Math.max(...during)).toBeGreaterThan(0.25);
  // ...never past the clamp the shader's 0.012 multiplier was tuned against...
  expect(Math.max(...trace.map(s => s.v))).toBeLessThanOrEqual(1);
  expect(Math.min(...trace.map(s => s.v))).toBeGreaterThanOrEqual(0);
  // ...and settles back to rest instead of latching a frozen smear.
  expect(Math.max(...atRestAfter)).toBeLessThan(0.01);
});
