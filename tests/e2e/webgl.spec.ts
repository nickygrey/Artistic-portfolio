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
        scissor: { x: number; y: number; width: number; height: number; visible: boolean };
        uniforms: Record<string, number>;
        visible: boolean;
      }>;
    };
  }
}

/**
 * Warms the dev server before any test asserts anything.
 *
 * The renderer tears WebGL down for the rest of a page's life if it measures
 * under 50fps over its first 60 frames (see renderer.ts's fpsGuard), and the
 * very first page a dev server serves is compiling TypeScript modules and
 * generating the hero's responsive image derivatives while those frames are
 * counted — the one moment in a run where the suite could plausibly race the
 * guard. This load asserts nothing, so it cannot turn a red test green; it
 * only moves the suite off that start.
 *
 * What this comment used to assert — "~30fps for the first load, WebGL
 * disabled about two seconds in" — has been removed rather than corrected,
 * because nobody has since been able to reproduce it. On a genuinely cold
 * server (`node_modules/.astro` moved aside, `node_modules/.vite` deleted)
 * the first-ever load measures **115.7fps** inside fpsGuard's own sampling
 * window, 113.5 and 119.7 on the two loads after it, and WebGL is never torn
 * down; an independent attempt measured 123.4 / 123.0 / 124.5. The warm-up is
 * kept because it costs one page load and the race it guards is real in
 * principle — not because that measurement stands.
 *
 * The race does not exist in production either way: the shipped site is a
 * static build, with prebuilt JS and prebuilt WebP.
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

  // Hiding the <img> removes the mesh from the frame through surface.ts's
  // rect-based culling: a display:none element's rect is all zeroes, so the
  // mesh's clip is empty and it is not drawn. That mechanism is a dependency
  // of this test but not its subject, so it is asserted here explicitly — if
  // culling ever changed, THIS line goes red and names the real cause,
  // instead of the paint-order assertions below going red for a reason that
  // has nothing to do with paint order.
  expect(
    await page.evaluate(() => window.__webgl.debug().find(d => d.el.includes('hero-img'))?.visible)
  ).toBe(false);

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
 *
 * REWRITTEN IN TASK 7, because Task 7 made its old method impossible and its
 * claim directly observable. It used to paint the canvas element's CSS
 * `background` red and assert red pixels over `.project-scale`. Task 7
 * registers a real surface on every `.project-scale img`, and an opaque mesh
 * covering that whole box hides the element's background from exactly the
 * pixel the probe sampled — the test went red on a page where the z-order
 * was, in fact, right.
 *
 * The replacement asserts the same z-order with the real mesh instead of a
 * stand-in: it runs the card's own dissolve to completion, which drives the
 * mesh to solid black over a photograph whose own mean luminance is 100+.
 * If `.project-scale` won the DOM-order tie, that photograph would still be
 * on screen. Hiding the canvas afterwards and finding the photograph again
 * is what proves the black came from the mesh rather than from anything
 * else that might have gone dark.
 */
test('the canvas paints above SelectedWork\'s scrubbed .project-scale photograph', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // The click below is a real one on a real link; let it open its tab, but
  // do not spend the time fetching YouTube.
  await context.route('**://www.youtube.com/**', r => r.abort());
  await page.goto('/');
  await page.waitForTimeout(1500);

  // Scroll .project-scale into view — this is what drives its scrub, via
  // the same ScrollTrigger the real page already wires up.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('#work')!.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(2500);

  const transform = await page.evaluate(
    () => getComputedStyle(document.querySelector('.project-scale')!).transform
  );
  // Confirms the scrub is genuinely active (not e.g. "none"), so this test
  // is actually exercising the transform-triggered stacking context, not
  // trivially passing because nothing is transformed at sample time.
  expect(transform).not.toBe('none');

  // The SECOND card, not the first: the first is a near-black title card
  // (work-audience.png, mean luma ~7/255), against which "the mesh went
  // black" and "the photograph is showing" are the same measurement.
  const card = page.locator('#work .card-link').nth(1);
  const box = (await card.locator('.project-thumbnail').boundingBox())!;
  const sample = {
    left: Math.round(box.x + box.width / 2) - 20,
    top: Math.round(box.y + box.height / 2) - 20,
    width: 40, height: 40,
  };
  const meanOf = async (shot: Buffer) => {
    const px = await sharp(shot).extract(sample).greyscale().raw().toBuffer();
    return px.reduce((a, b) => a + b, 0) / px.length;
  };

  const before = await meanOf(await page.screenshot());
  expect(before, 'the card shows a photograph before anything is clicked').toBeGreaterThan(60);

  await card.click();
  await page.waitForTimeout(1200); // DURATION.dissolve is 0.7s
  const dissolved = await meanOf(await page.screenshot());

  await page.evaluate(() => {
    (document.querySelector('canvas') as HTMLCanvasElement).style.display = 'none';
  });
  await page.waitForTimeout(200);
  const canvasHidden = await meanOf(await page.screenshot());

  // The mesh painted black OVER the scrubbed photograph...
  expect(dissolved, 'the fully dissolved mesh covers the photograph').toBeLessThan(12);
  // ...and the photograph was there the whole time, underneath it.
  expect(canvasHidden, 'the DOM photograph is untouched beneath the mesh').toBeGreaterThan(60);
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

/**
 * Per-row mean absolute channel difference between the same region of two
 * same-sized screenshots. A row is one screen line, so the result localises a
 * difference vertically — which is what a clipping failure looks like: a band
 * of rows immediately below an element's clipping edge that differ, and
 * nothing anywhere else.
 */
async function rowMeanDiff(
  a: Buffer,
  b: Buffer,
  region: { left: number; top: number; width: number; height: number }
): Promise<number[]> {
  const raw = (buf: Buffer) =>
    sharp(buf).extract(region).raw().toBuffer({ resolveWithObject: true });
  const x = await raw(a);
  const y = await raw(b);
  const ch = x.info.channels;
  const rows: number[] = [];
  for (let row = 0; row < region.height; row++) {
    let sum = 0, n = 0;
    const start = row * region.width * ch;
    for (let i = start; i < start + region.width * ch; i += ch) {
      for (let c = 0; c < 3; c++) {
        sum += Math.abs(x.data[i + c] - y.data[i + c]);
        n++;
      }
    }
    rows.push(sum / n);
  }
  return rows;
}

/**
 * *** The defect this test exists for ***
 *
 * `.hero-fullscreen` is `overflow: hidden`, and the hero <img> inside it is
 * under a scrubbed GSAP tween (`scale: 1.08 -> 1, yPercent: 0 -> 12`) that
 * deliberately makes its rect overhang the section on every side. The DOM
 * clips that overhang. The WebGL mesh replicates the *transform* — it reads
 * exactly that overhanging rect — so unless it also replicates the *clip* it
 * paints a band of hero photograph over whatever section follows the hero.
 *
 * Measured before the fix, as visible bleed below the section: 0px at scroll
 * 0, 44px at scroll 100, 70px at 420 and 84px at 600 (1280x900); 42/67/82px
 * at 390x844. Per-row mean pixel difference at scrollY=420 jumped from ~1.5
 * inside the hero to 7.99/8.79/9.68 across y=480-570, peaking at a row mean
 * of 49.18. In light theme the section below the hero is near-white, so a
 * dark photograph lands on it and the DisciplinesStrip wordmarks become dark
 * text on a dark photograph: whole-frame mean 15.96 / max 232 at scrollY=300
 * against 0.48 / 17 in dark.
 *
 * **Every shipped visual test before this one screenshots at scroll 0 — the
 * one scroll position at which the overhang is entirely below the fold and
 * this is invisible.** So this test scrolls, and does it in both themes: the
 * theme is not incidental, it is what turns a visual seam into a legibility
 * regression.
 *
 * The reference image is the same page with the canvas hidden rather than a
 * second page load with WebGL refused: hiding a `position: fixed` canvas
 * changes no layout and leaves the scroll position, the scrub state and every
 * GSAP transform byte-identical, so the only thing that can differ between
 * the two frames is what the mesh painted.
 */
const CLIP_SCROLL_POSITIONS = [100, 300, 600];

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  for (const theme of ['dark', 'light'] as const) {
    test(`the hero mesh is clipped to its section and never paints over the content below (${viewport.width}x${viewport.height}, ${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport });
      await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
      const page = await ctx.newPage();
      await page.goto('/');
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(1);
      // The scroll cue pulses on a CSS keyframe loop, the one thing that would
      // otherwise differ between two frames taken a moment apart.
      await page.addStyleTag({ content: '.scroll-line { animation: none !important; }' });
      await page.waitForTimeout(200);

      for (const target of CLIP_SCROLL_POSITIONS) {
        await page.evaluate((y) => window.scrollTo(0, y), target);
        await page.waitForTimeout(900);

        const geom = await page.evaluate(() => {
          const section = document.querySelector('.hero-fullscreen')!.getBoundingClientRect();
          const img = document.querySelector('.hero-img')!.getBoundingClientRect();
          return {
            sectionBottom: section.bottom,
            overhang: img.bottom - section.bottom,
            scrollY: window.scrollY,
          };
        });

        // Preconditions, so "no bleed" cannot be trivially true: we really are
        // scrolled, the section's clipping edge is on screen with room below
        // it, and the <img> the mesh mirrors really does overhang that edge.
        expect(geom.scrollY, `scrollY at target ${target}`).toBeGreaterThan(0);
        expect(geom.sectionBottom).toBeGreaterThan(0);
        expect(geom.sectionBottom).toBeLessThan(viewport.height - 40);
        expect(geom.overhang, `<img> overhang below the section at scrollY ${geom.scrollY}`).toBeGreaterThan(20);

        const withMesh = await page.screenshot();
        await page.evaluate(() => {
          (document.querySelector('canvas') as HTMLCanvasElement).style.display = 'none';
        });
        await page.waitForTimeout(200);
        const withoutMesh = await page.screenshot();
        await page.evaluate(() => {
          (document.querySelector('canvas') as HTMLCanvasElement).style.display = '';
        });
        await page.waitForTimeout(200);

        const top = Math.ceil(geom.sectionBottom);
        const rows = await rowMeanDiff(withMesh, withoutMesh, {
          left: 0,
          top,
          width: viewport.width,
          height: viewport.height - top,
        });

        // How far below the section's clipping edge the mesh is still
        // painting: the last row that differs materially, in pixels. This is
        // the same number the review reported as "visible bleed" (44-84px).
        let bleedPx = 0;
        rows.forEach((mean, i) => { if (mean > 3) bleedPx = i + 1; });
        const worstRow = Math.max(...rows);

        expect(bleedPx, `bleed below the hero at scrollY ${geom.scrollY} (worst row mean ${worstRow.toFixed(2)})`).toBe(0);
        expect(worstRow, `worst row mean below the hero at scrollY ${geom.scrollY}`).toBeLessThan(2);
      }

      await ctx.close();
    });
  }
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
 * The started-then-torn-down path, which nothing else in this suite visits.
 *
 * "WebGL never initialised" (`getContext` -> null) and "reduced motion" are
 * both the *never-started* path: no scene, no surface, nothing to clean up.
 * `fpsGuard` firing is different code — a live scene with a registered surface
 * being taken apart mid-life — and it is the only teardown a real visitor can
 * hit without navigating.
 *
 * Two things have to hold there. The degradation contract, which the DOM
 * <img> already satisfies by never having been hidden. And the *reason* the
 * guard exists: a device that just failed a 50fps test must come out of this
 * cheaper than it went in. It did not. `sampleScroll` — the per-frame feed
 * that reads the hero <img>'s rect and drives `uVelocity` — was removed only
 * by the *motion* teardown (`velocityTracker.onKill`), and `fpsGuard` calls
 * `teardownWebGL()`, which never touched it. Measured after forcing the
 * guard: `getBoundingClientRect(.hero-img)` still running 0.99/frame, forcing
 * a layout every frame to feed uniforms bound to no GPU program, for the rest
 * of the page's life.
 *
 * The guard is forced by making this machine genuinely too slow — blocking
 * the main thread past a frame budget for more than the 60 frames fpsGuard
 * samples — rather than by patching `FPS_FLOOR` in the served module. That
 * keeps the test independent of the module's internals and of the dev
 * server's URL scheme, and it exercises the same code path a slow device
 * does.
 */
test('the fps guard tears a registered surface down and stops the per-frame work feeding it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    const w = window as unknown as {
      __heroRectCalls: number;
      __frames: number;
      __maxSurfaces: number;
      __congested: boolean;
      __webgl?: { surfaces(): number };
    };
    w.__heroRectCalls = 0;
    w.__frames = 0;
    w.__maxSurfaces = 0;
    w.__congested = true;

    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList?.contains('hero-img')) w.__heroRectCalls++;
      return origRect.call(this);
    };

    let blockedFrames = 0;
    (function congest() {
      const until = performance.now() + 30;
      // eslint-disable-next-line no-empty
      while (performance.now() < until) {}
      if (++blockedFrames < 130) requestAnimationFrame(congest);
      else w.__congested = false;
    })();

    (function sample() {
      w.__frames++;
      if (w.__webgl) w.__maxSurfaces = Math.max(w.__maxSurfaces, w.__webgl.surfaces());
      requestAnimationFrame(sample);
    })();
  });

  const page = await ctx.newPage();
  await page.goto('/');

  // The guard fires once, at the end of its 60-frame sample.
  await page.waitForFunction(() => !window.__webgl.active(), null, { timeout: 20000 });
  // ...and it fired with a surface registered. Without this, a suite that
  // never got as far as registering one would pass this test while covering
  // nothing it claims to.
  expect(
    await page.evaluate(() => (window as unknown as { __maxSurfaces: number }).__maxSurfaces)
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);

  // Let the artificial congestion end, so the measurement below runs on a
  // page that is idle for the same reason a real visitor's would be.
  await page.waitForFunction(
    () => !(window as unknown as { __congested: boolean }).__congested,
    null,
    { timeout: 20000 }
  );
  await page.waitForTimeout(300);

  const cost = await page.evaluate(async () => {
    const w = window as unknown as { __heroRectCalls: number; __frames: number };
    const rect0 = w.__heroRectCalls;
    const frames0 = w.__frames;
    await new Promise(r => setTimeout(r, 1500));
    return { rectCalls: w.__heroRectCalls - rect0, frames: w.__frames - frames0 };
  });

  expect(cost.frames).toBeGreaterThan(30);
  // Measured before the fix: 0.99 rect reads per frame — one forced layout a
  // frame, permanently, on the device least able to afford it. After it: 0.
  expect(cost.rectCalls / cost.frames).toBeLessThan(0.05);

  // The degradation contract still holds: the photograph was never hidden.
  const hero = await page.evaluate(() => {
    const img = document.querySelector('.hero-img') as HTMLImageElement;
    const cs = getComputedStyle(img);
    return {
      opacity: Number(cs.opacity),
      visibility: cs.visibility,
      decoded: img.naturalWidth > 0 && img.complete,
      width: img.getBoundingClientRect().width,
    };
  });
  expect(hero.opacity).toBe(1);
  expect(hero.visibility).toBe('visible');
  expect(hero.decoded).toBe(true);
  expect(hero.width).toBeGreaterThan(1000);

  await ctx.close();
});

/**
 * The cover uniforms are resynced from the same per-frame callback that feeds
 * `uVelocity`, and reproducing `object-fit: cover` needs `getComputedStyle` to
 * read `object-position`. Recomputing that every frame is pure waste — the
 * hero <img>'s `object-position` is a constant — so `syncCover` short-circuits
 * on an unchanged key.
 *
 * The key has to be the box's ASPECT RATIO, not its dimensions, and this test
 * exists because those look equivalent and are not. The <img> is under a
 * continuously scrubbed `scale` tween, so a dimension key changes on every
 * frame of a scroll while the aspect ratio — which a uniform scale cannot
 * change — does not. Measured with a dimension key: `getComputedStyle` ran on
 * 24% of scrolling frames, every call returning an identical result. The
 * assertion below is what makes Hero.astro's comment about it a checked claim
 * rather than a hopeful one.
 *
 * The rect budget is pinned in the same breath: exactly two reads per frame,
 * Hero's `syncCover` and `surface.ts`'s `update()`, which is one forced layout
 * between them. A third system reading the same rect would show up here.
 */
test('the per-frame cover sync keeps getComputedStyle off the scroll path', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    const w = window as unknown as {
      __c: { rect: number; gcs: number; frames: number; minH: number; maxH: number };
    };
    w.__c = { rect: 0, gcs: 0, frames: 0, minH: Infinity, maxH: -Infinity };
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const r = origRect.call(this);
      if (this.classList?.contains('hero-img')) {
        w.__c.rect++;
        w.__c.minH = Math.min(w.__c.minH, r.height);
        w.__c.maxH = Math.max(w.__c.maxH, r.height);
      }
      return r;
    };
    const origGcs = window.getComputedStyle;
    window.getComputedStyle = function (el: Element, ps?: string | null) {
      if (el?.classList?.contains?.('hero-img')) w.__c.gcs++;
      return origGcs.call(window, el, ps);
    };
    (function loop() { w.__c.frames++; requestAnimationFrame(loop); })();
  });

  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(1);

  // Start the measurement window after load, so the one legitimate recompute
  // (the image decoding) is not counted as per-frame work.
  await page.evaluate(() => {
    const c = (window as unknown as { __c: { rect: number; gcs: number; frames: number; minH: number; maxH: number } }).__c;
    c.rect = 0; c.gcs = 0; c.frames = 0; c.minH = Infinity; c.maxH = -Infinity;
  });

  await page.mouse.move(640, 450);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 140);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(600);

  const c = await page.evaluate(
    () => ({ ...(window as unknown as { __c: { rect: number; gcs: number; frames: number; minH: number; maxH: number } }).__c })
  );

  expect(c.frames).toBeGreaterThan(60);
  // The scrub really was live: the box changed size during the window, so a
  // dimension-keyed cache genuinely would have thrashed here. Without this,
  // "no recomputes" would be the trivially true statement that nothing moved.
  expect(c.maxH - c.minH).toBeGreaterThan(20);

  expect(c.gcs / c.frames).toBeLessThan(0.05);
  // Two rect reads per frame, no more: syncCover and surface.ts's update().
  expect(c.rect / c.frames).toBeGreaterThan(1.5);
  expect(c.rect / c.frames).toBeLessThan(2.5);

  await ctx.close();
});

/**
 * The smear is driven by `uVelocity`, and the failure mode that matters is
 * not "it never moves" but "it never stops": ScrollTrigger's onUpdate stops
 * firing the moment scrolling ends, so a naive feed leaves the last, highest
 * reading latched and smears the photograph permanently. Measured here as the
 * uniform the shader actually reads, over a real scroll and the seconds after
 * it, rather than as anything a computed style could report.
 *
 * The value is read off the live OGL `Program` through the surface's own
 * debug hook, not by importing `/src/webgl/shaders/hero.ts` a second time.
 * That import used to reach the same module instance the page uses — but only
 * on a dev server with no file edits since it started. Touch any file in the
 * graph and Vite serves the page's copy cache-busted (`?t=…`), so the import
 * forks a second, inert module whose `uCoverScale` sits at its `[1, 1]`
 * default while the live one is `[1, 0.8687]`: an edit-order-dependent flake,
 * and a technique with no equivalent against a production build. The program's
 * uniform is also strictly the better subject — it is the number the GPU is
 * handed, rather than a number some module holds.
 */
test('uVelocity rises with a scroll, stays clamped, and returns to rest afterwards', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(1);

  const trace = await page.evaluate(async () => {
    const out: Array<{ t: number; v: number }> = [];
    const started = performance.now();
    const done = new Promise<void>(resolve => {
      (function loop() {
        const s = window.__webgl.debug().find(d => d.el.includes('hero-img'));
        if (s) out.push({ t: performance.now() - started, v: s.uniforms.uVelocity });
        if (performance.now() - started < 3200) requestAnimationFrame(loop);
        else resolve();
      })();
    });
    setTimeout(() => window.scrollTo({ top: 700, behavior: 'smooth' }), 200);
    await done;
    return out;
  });
  // The surface stayed registered for the whole trace, so an empty or
  // truncated sample cannot masquerade as a settled uniform below.
  expect(trace.length).toBeGreaterThan(60);

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

// ---------------------------------------------------------------------------
// Task 7 — Selected Work hover ripple and click dissolve
// ---------------------------------------------------------------------------

/**
 * Scrolls `#work` into view and waits for its four surfaces to register.
 *
 * They do not register at `webgl:ready` like the hero's does. All four
 * `.project-scale img` are `loading="lazy"` and roughly 4,300px below the
 * fold, so none has decoded when the scene is built; SelectedWork.astro
 * defers each registration to that image's own `load` event, because a
 * surface registered against an undecoded image paints a solid black
 * rectangle (OGL uploads a transparent-black 1x1 while it waits, and the
 * shader writes alpha 1).
 */
async function workReady(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => document.querySelector('#work')!.scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => window.__webgl.surfaces() >= 5, null, { timeout: 12000 });
  // Let the scrub settle and the hover tweens start from rest.
  await page.waitForTimeout(600);
}

/** uHover for each registered surface, in registration order. */
const hovers = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__webgl.debug().map(d => d.uniforms.uHover ?? -1));

/** uDissolve for each registered surface; -1 for the hero, which has none. */
const dissolves = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__webgl.debug().map(d => d.uniforms.uDissolve ?? -1));

/**
 * *** The defect this test exists for ***
 *
 * Four cards, one cursor, and `registerSurface()` reads `.value` off the very
 * uniform objects a shader module hands it — so uniforms declared at module
 * scope (which is what `hero.ts` correctly does, having exactly one surface)
 * would be SHARED by all four cards here, and hovering any one of them would
 * ripple all four. `createWorkUniforms()` being a factory is the fix, and
 * nothing about a page at rest reveals whether it is one.
 *
 * Hover is a pointer state, so this drives a real pointer: Playwright's
 * `.hover()` dispatches through CDP and produces genuine `pointerenter` /
 * `pointermove` events, which is what the component listens for. Reading the
 * uniforms back off the live OGL `Program` (see surface.ts's `debug()`) means
 * the assertion is about the value the GPU is actually handed.
 */
test('hovering a work card raises that card\'s uHover and no other', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  await workReady(page);

  const before = await page.evaluate(() => window.__webgl.surfaces());
  expect(before, 'hero + four work cards').toBe(5);
  expect(await hovers(page), 'nothing is hovered to begin with').toEqual([0, 0, 0, 0, 0]);

  const cards = page.locator('#work .card-link');
  for (const index of [0, 1, 2, 3]) {
    await cards.nth(index).hover();
    await page.waitForTimeout(700); // DURATION.quickTo is 0.4s

    const lit = (await hovers(page)).filter(v => v > 0.9).length;
    const dark = (await hovers(page)).filter(v => v < 0.05).length;
    expect(lit, `exactly one surface is hovered (card ${index})`).toBe(1);
    expect(dark, `the other four are at rest (card ${index})`).toBe(4);

    // The card is still a link and still points where it did.
    const href = await cards.nth(index).getAttribute('href');
    expect(href).toContain('youtube.com');
  }

  // And it comes back down when the pointer leaves.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(900);
  for (const v of await hovers(page)) expect(v).toBeLessThan(0.05);
});

/**
 * *** The defect this test exists for ***
 *
 * A modifier-click opens a BACKGROUND tab: the visitor never leaves this
 * page. Running the dissolve there would fade the card they are still looking
 * at to black and leave it there, because the "come back and re-form" path is
 * driven by `visibilitychange`, which never fires when the tab was never
 * hidden. `isPlainPrimaryClick()` is what excludes it — the same set of
 * clicks `preventNativeAnchorJump()` in src/motion/engine.ts already excludes
 * for a related reason (tests/e2e/modifier-click.spec.ts).
 *
 * The first assertion is the brief's: the click must not be intercepted at
 * all, i.e. the tab really opens. The second is the visual half.
 */
test('modifier-click on a work card is not intercepted and does not dissolve it', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.route('**://www.youtube.com/**', r => r.abort());
  await page.goto('/');
  await page.waitForTimeout(1500);
  await workReady(page);

  const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.locator('#work .card-link').first().click({ modifiers: ['Meta'] });
  expect(await popup, 'cmd-click still opens a new tab').not.toBeNull();

  await page.waitForTimeout(1200); // longer than DURATION.dissolve
  for (const v of await dissolves(page)) {
    expect(v, 'no card dissolves on a modifier-click').toBeLessThan(0.01);
  }
});

/**
 * The other half of the click contract: a plain primary click DOES run the
 * dissolve, and still navigates. Nothing in this codebase may `preventDefault`
 * on it — the link opening the film is the point, and the dissolve is an
 * accompaniment.
 */
test('a plain click runs the dissolve to completion and still opens the link', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.route('**://www.youtube.com/**', r => r.abort());
  await page.goto('/');
  await page.waitForTimeout(1500);
  await workReady(page);

  const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.locator('#work .card-link').nth(1).click();
  expect(await popup, 'a plain click still opens the film').not.toBeNull();

  // Mid-flight: exactly one card is dissolving, and it is not yet finished.
  await page.waitForTimeout(300);
  const mid = (await dissolves(page)).filter(v => v > 0.05);
  expect(mid.length, 'exactly one card is dissolving').toBe(1);
  expect(mid[0], 'and it is still in flight 0.3s in').toBeLessThan(0.99);

  await page.waitForTimeout(900);
  const done = (await dissolves(page)).filter(v => v > 0.99);
  expect(done.length, 'that card reaches a full dissolve').toBe(1);
  // The other three are untouched. (The hero reports -1: it has no
  // uDissolve at all, so it must not be counted as an untouched card.)
  expect((await dissolves(page)).filter(v => v >= 0 && v < 0.01).length).toBe(3);
});

/**
 * *** The defect this test exists for ***
 *
 * This is the hero's bleed defect, one section further down the page.
 * `.project-scale` carries a scrubbed `scale: 1.15 -> 1`, so at almost every
 * scroll position the <img> the mesh mirrors is LARGER than the
 * `.project-thumbnail` (`overflow: hidden`) that confines it. A mesh that
 * replicates the transform without the clip paints photograph over the
 * caption below it, the neighbouring card beside it, and the gap between
 * rows. The hero's version of this bled 44-84px and every shipped visual test
 * screenshotted at scroll 0, the one position where it is invisible.
 *
 * So: non-zero scroll positions only, both themes, both viewports, and a
 * precondition asserting the overhang is genuinely there so "no bleed" cannot
 * be trivially true. The reference frame is the same page with the canvas
 * hidden — no layout changes, no second load, so the only thing that can
 * differ is what the mesh painted.
 */
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  for (const theme of ['dark', 'light'] as const) {
    test(`work meshes stay inside their thumbnails at non-zero scroll (${viewport.width}x${viewport.height}, ${theme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport });
      await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
      const page = await ctx.newPage();
      await page.goto('/');
      await page.waitForTimeout(1500);
      await workReady(page);

      const base = await page.evaluate(() => window.scrollY);
      for (const delta of [-120, 90, 260]) {
        await page.evaluate((y) => window.scrollTo(0, y), base + delta);
        await page.waitForTimeout(900);

        const geom = await page.evaluate(() => {
          const out: Array<{ box: { x: number; y: number; w: number; h: number }; overhang: number }> = [];
          for (const thumb of document.querySelectorAll('#work .project-thumbnail')) {
            const t = thumb.getBoundingClientRect();
            const i = thumb.querySelector('img')!.getBoundingClientRect();
            out.push({
              box: { x: t.left, y: t.top, w: t.width, h: t.height },
              overhang: Math.max(t.left - i.left, i.right - t.right, t.top - i.top, i.bottom - t.bottom),
            });
          }
          return { out, scrollY: window.scrollY };
        });
        expect(geom.scrollY, 'genuinely scrolled').toBeGreaterThan(0);
        // At least one card's <img> really does overhang its clipping box.
        expect(Math.max(...geom.out.map(g => g.overhang)), 'the scrub overhangs the thumbnail').toBeGreaterThan(2);

        const withMesh = await page.screenshot();
        await page.evaluate(() => {
          (document.querySelector('canvas') as HTMLCanvasElement).style.display = 'none';
        });
        await page.waitForTimeout(200);
        const withoutMesh = await page.screenshot();
        await page.evaluate(() => {
          (document.querySelector('canvas') as HTMLCanvasElement).style.display = '';
        });
        await page.waitForTimeout(200);

        // A margin around each thumbnail, minus the thumbnail itself: every
        // pixel here belongs to the caption, the gutter or the next card, and
        // no mesh may reach any of it.
        const M = 14;
        const inside = (x: number, y: number) =>
          geom.out.some(g => x >= g.box.x - 0.5 && x <= g.box.x + g.box.w + 0.5 &&
                             y >= g.box.y - 0.5 && y <= g.box.y + g.box.h + 0.5);

        const [a, b] = await Promise.all([
          sharp(withMesh).greyscale().raw().toBuffer({ resolveWithObject: true }),
          sharp(withoutMesh).greyscale().raw().toBuffer(),
        ]);
        const W = a.info.width, H = a.info.height;
        const scale = W / viewport.width; // device pixel ratio of the shot
        let worst = 0, bled = 0;
        for (const g of geom.out) {
          const x0 = Math.max(0, Math.floor((g.box.x - M) * scale));
          const x1 = Math.min(W - 1, Math.ceil((g.box.x + g.box.w + M) * scale));
          const y0 = Math.max(0, Math.floor((g.box.y - M) * scale));
          const y1 = Math.min(H - 1, Math.ceil((g.box.y + g.box.h + M) * scale));
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              if (inside(x / scale, y / scale)) continue;
              const d = Math.abs(a.data[y * W + x] - b[y * W + x]);
              if (d > worst) worst = d;
              if (d > 8) bled++;
            }
          }
        }
        expect(bled, `pixels of mesh outside a .project-thumbnail at scrollY ${geom.scrollY} (worst ${worst})`).toBe(0);
      }
      await ctx.close();
    });
  }
}

/**
 * *** The defect this test exists for ***
 *
 * Hover does not exist on touch. A ripple chasing a finger it cannot see is
 * meaningless, the per-frame and GPU cost buys nothing, and the cards must
 * remain completely usable with no hover state at all — which is also what
 * global.css already assumes, stripping `.card-link`'s hover transforms under
 * the same query. `SelectedWork.astro` skips registration entirely when
 * `(hover: none) and (pointer: coarse)` matches.
 */
test('on a touch device no work surface is registered and the cards stay usable', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);

  // This is the codebase's definition of a touch device; assert the emulated
  // context really matches it, or the rest of this test proves nothing.
  expect(
    await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches),
    'the emulated context really is a touch device'
  ).toBe(true);

  await page.evaluate(() => document.querySelector('#work')!.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(3000);
  // Long enough for every thumbnail to have decoded...
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('#work .project-scale img')]
        .every(i => i.complete && i.naturalWidth > 0)
    ),
    'every thumbnail decoded, so registration had its chance'
  ).toBe(true);
  // ...and still only the hero has a surface.
  expect(await page.evaluate(() => window.__webgl.surfaces()), 'hero only').toBe(1);

  // The cards are entirely usable without any hover state.
  const cards = page.locator('#work .card-link');
  expect(await cards.count()).toBe(4);
  for (let i = 0; i < 4; i++) {
    await expect(cards.nth(i)).toBeVisible();
    expect(await cards.nth(i).getAttribute('href')).toContain('youtube.com');
    const img = cards.nth(i).locator('.project-scale img');
    await expect(img).toBeVisible();
    const b = (await img.boundingBox())!;
    expect(b.width).toBeGreaterThan(100);
    expect(b.height).toBeGreaterThan(50);
  }
  await ctx.close();
});

/**
 * *** The defect this test exists for ***
 *
 * Three of the four thumbnails are third-party (`img.youtube.com`). WebGL
 * refuses to upload a non-origin-clean image — `texImage2D` throws
 * `SecurityError` — and that throw lands inside OGL's `Texture.update()`,
 * inside `renderer.render()`, inside the ONE `gsap.ticker` callback every
 * surface on the page shares. It is therefore not a per-card failure: it
 * stops the hero rendering too. Measured against all three URLs before
 * `crossorigin="anonymous"` was added to them.
 *
 * The `uTime` assertion is the part that catches the frame loop dying, since
 * a dead loop leaves every uniform frozen at its last value while surface
 * count stays exactly as it was.
 */
test('the cross-origin thumbnails become textures without killing the frame loop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.waitForTimeout(1500);
  await workReady(page);

  const origin = new URL(page.url()).origin;
  const srcs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('#work .project-scale img')].map(i => i.currentSrc)
  );
  expect(
    srcs.filter(s => new URL(s, origin).origin !== origin).length,
    'three of the four thumbnails really are cross-origin'
  ).toBe(3);

  expect(await page.evaluate(() => window.__webgl.surfaces()), 'all four cards registered').toBe(5);
  expect(errors, 'no SecurityError reached the page').toEqual([]);

  const t0 = await page.evaluate(() => window.__webgl.debug().map(d => d.uniforms.uTime));
  await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => window.__webgl.debug().map(d => d.uniforms.uTime));
  for (let i = 0; i < t0.length; i++) {
    expect(t1[i], `surface ${i} is still being ticked`).toBeGreaterThan(t0[i]);
  }
});

/**
 * *** The defect this test exists for ***
 *
 * `ogl/src/core/Texture.js` uploads a transparent-black 1x1 `emptyPixel`
 * while no image is set, and this shader writes alpha 1 — so a surface
 * registered against an image that has not decoded paints a SOLID BLACK
 * RECTANGLE over the card, permanently if the image never arrives. The
 * acceptance bar for this task names that exact outcome: a client on a
 * locked-down corporate laptop must never see a blank rectangle where the
 * work should be, and a proxy blocking `img.youtube.com` is precisely how
 * that laptop differs from this one.
 *
 * `SelectedWork.astro` therefore registers nothing until an image has
 * actually decoded. With the thumbnails blocked, only the local card may
 * register, and the three blocked cards must be pixel-identical with the
 * canvas shown and hidden.
 */
test('a thumbnail that never loads gets no surface and no black rectangle', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.route('**://img.youtube.com/**', r => r.abort());
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#work')!.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(3000);

  expect(
    await page.evaluate(() => window.__webgl.surfaces()),
    'hero + the one local thumbnail; nothing for the three that failed'
  ).toBe(2);

  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('#work .project-thumbnail')].slice(1).map(el => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    }).filter(b => b.top >= 0 && b.top + b.height <= 900)
  );
  expect(boxes.length, 'at least one blocked card is on screen to sample').toBeGreaterThan(0);

  const withMesh = await page.screenshot();
  await page.evaluate(() => {
    (document.querySelector('canvas') as HTMLCanvasElement).style.display = 'none';
  });
  await page.waitForTimeout(200);
  const withoutMesh = await page.screenshot();

  for (const b of boxes) {
    const [a, c] = await Promise.all([
      sharp(withMesh).extract(b).greyscale().raw().toBuffer(),
      sharp(withoutMesh).extract(b).greyscale().raw().toBuffer(),
    ]);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - c[i]));
    expect(worst, `nothing is painted over the failed card at ${b.left},${b.top}`).toBeLessThan(4);
  }
});

/**
 * With WebGL refused outright, the section has to be exactly what it was
 * before any of this existed. The sibling test above this block covers every
 * <img> on the page for visibility; this one covers the part specific to
 * Selected Work — the thumbnails are positioned inside their frames and the
 * cards are still clickable.
 */
test('with WebGL unavailable every work thumbnail is visible, positioned and clickable', async ({ browser, context }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) {
      if (t === 'webgl' || t === 'webgl2') return null;
      // @ts-expect-error passthrough
      return orig.call(this, t, ...a);
    };
  });
  await ctx.route('**://www.youtube.com/**', r => r.abort());
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.active())).toBe(false);
  await page.evaluate(() => document.querySelector('#work')!.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(2500);

  const cards = page.locator('#work .card-link');
  expect(await cards.count()).toBe(4);
  for (let i = 0; i < 4; i++) {
    const thumb = cards.nth(i).locator('.project-thumbnail');
    const img = thumb.locator('img');
    await expect(img).toBeVisible();
    const [t, b] = [(await thumb.boundingBox())!, (await img.boundingBox())!];
    expect(b.width, `card ${i} thumbnail has real width`).toBeGreaterThan(100);
    expect(b.height, `card ${i} thumbnail has real height`).toBeGreaterThan(50);
    // Positioned over its frame, not adrift somewhere else on the page.
    expect(Math.abs((b.x + b.width / 2) - (t.x + t.width / 2))).toBeLessThan(4);
    expect(Math.abs((b.y + b.height / 2) - (t.y + t.height / 2))).toBeLessThan(4);
  }

  // And still clickable.
  const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await cards.first().click();
  expect(await popup, 'the card is still a working link with no WebGL').not.toBeNull();
  await ctx.close();
});

/**
 * *** The defect this test exists for ***
 *
 * `initWebGL()` opens by destroying every surface, so a View Transition
 * rebuilds the scene from scratch — and `SelectedWork.astro` re-registers
 * from module scope on `webgl:ready`, adding a fresh set of pointer and
 * `visibilitychange` listeners each time. If the previous set were not
 * aborted, hovering one card after a couple of navigations would drive
 * several dead uniform objects and the page would accumulate listeners
 * silently: the motion suite's leak test counts ScrollTriggers only and would
 * never see it (AGENTS.md says so explicitly).
 *
 * Soft navigation away and back, then hover: the count must be exactly what
 * it was, and exactly one surface may respond.
 */
test('surfaces and listeners do not accumulate across a soft navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1500);
  await workReady(page);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBe(5);

  // Link clicks, not page.goto(): ClientRouter only intercepts same-document
  // navigations, and a goto() would discard the JS realm and prove nothing.
  // Same route tests/e2e/lifecycle.spec.ts already uses for this.
  await page.locator('footer a[href="/privacy"]').click();
  await page.waitForTimeout(2000);
  await page.locator('a.logo[href="/"]').click();
  await page.waitForTimeout(2000);
  await workReady(page);

  expect(await page.evaluate(() => window.__webgl.surfaces()), 'no duplicates after a round trip').toBe(5);
  await page.locator('#work .card-link').first().hover();
  await page.waitForTimeout(700);
  expect((await hovers(page)).filter(v => v > 0.9).length, 'still exactly one card responds').toBe(1);
});

/**
 * *** The defect this test exists for ***
 *
 * The `crossorigin="anonymous"` this task put on the three third-party
 * thumbnails is what lets their pixels reach a WebGL texture at all — but it
 * also converts their loads into CORS requests, and a CORS request that is
 * refused does not degrade, it FAILS. On a network that strips or rejects
 * cross-origin image fetches (a corporate proxy; exactly the locked-down
 * laptop in this task's acceptance bar) an unguarded `crossorigin` would turn
 * three working photographs into three blank cards — a regression introduced
 * purely in service of an enhancement.
 *
 * SelectedWork.astro therefore retries once without the attribute. This
 * aborts every CORS-mode request to img.youtube.com and lets the plain retry
 * through, then asserts the outcome that matters: the photographs are there,
 * and the effect — not the content — is what was given up.
 */
test('a network that refuses CORS costs the shader, never the photograph', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let corsAborted = 0, plainAllowed = 0;
  await context.route('**://img.youtube.com/**', async route => {
    const h = route.request().headers();
    if (h['origin'] || h['sec-fetch-mode'] === 'cors') { corsAborted++; return route.abort('failed'); }
    plainAllowed++;
    return route.continue();
  });
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#work')!.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(5000);

  expect(corsAborted, 'the CORS attempt really was refused').toBeGreaterThanOrEqual(3);
  expect(plainAllowed, 'and the component retried without the attribute').toBeGreaterThanOrEqual(3);

  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('#work .project-scale img')].map(i => ({
      loaded: i.complete && i.naturalWidth > 0,
      width: i.naturalWidth,
      cross: i.crossOrigin,
    })));
  expect(imgs.length).toBe(4);
  for (const [i, img] of imgs.entries()) {
    expect(img.loaded, `thumbnail ${i} decoded`).toBe(true);
    expect(img.width, `thumbnail ${i} is a real image`).toBeGreaterThan(300);
  }
  // The three remote ones dropped the attribute to get there.
  expect(imgs.slice(1).map(i => i.cross)).toEqual([null, null, null]);

  // Only the same-origin card can safely become a texture now, and that is
  // the correct trade: the effect is lost, the photographs are not.
  expect(await page.evaluate(() => window.__webgl.surfaces()), 'hero + the local card only').toBe(2);

  // And the cards really do show photographs, not blank or black rectangles.
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('#work .project-thumbnail')].map(el => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    }).filter(b => b.top >= 0 && b.top + b.height <= 900));
  const shot = await page.screenshot();
  for (const b of boxes.slice(1)) {
    const px = await sharp(shot).extract(b).greyscale().raw().toBuffer();
    let min = 255, max = 0;
    for (const v of px) { if (v < min) min = v; if (v > max) max = v; }
    expect(max - min, `card at ${b.left},${b.top} has photographic range, not a flat rectangle`).toBeGreaterThan(80);
  }
});
