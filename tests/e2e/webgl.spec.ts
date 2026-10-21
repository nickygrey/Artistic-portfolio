import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __webgl: {
      active(): boolean;
      surfaces(): number;
      debug(): Array<{ el: string; visible: boolean; uniforms: Record<string, number>; vectors: Record<string, number[]> }>;
    };
  }
}

const gl = (page: Page) => page.evaluate(() => ({ active: window.__webgl.active(), surfaces: window.__webgl.surfaces() }));
const velocity = (page: Page) => page.evaluate(() => window.__webgl.debug()[0]?.vectors.uVelocity ?? null);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe('gallery canvas', () => {
  test('every frame on the canvas gets a bend surface', async ({ page }) => {
    await page.goto('/work/portrait/');
    await page.waitForTimeout(1500);
    const frames = await page.locator('[data-frame]').count();
    expect(await gl(page)).toEqual({ active: true, surfaces: frames });
  });

  test('dragging bends the frames, and they settle flat at rest', async ({ page }) => {
    await page.goto('/work/portrait/');
    await page.waitForTimeout(1500);
    await page.mouse.move(1000, 450);
    await page.mouse.down();
    for (let x = 1000; x > 400; x -= 60) {
      await page.mouse.move(x, 450);
      await page.waitForTimeout(16);
    }
    const moving = (await velocity(page))!;
    await page.mouse.up();
    expect(Math.abs(moving[0])).toBeGreaterThan(0.05);
    await page.waitForTimeout(2500);
    const rest = (await velocity(page))!;
    expect(Math.abs(rest[0])).toBeLessThan(0.01);
    expect(Math.abs(rest[1])).toBeLessThan(0.01);
  });

  test('in single view no frame mesh is drawn', async ({ page }) => {
    await page.goto('/work/portrait/?frame=2');
    await page.waitForTimeout(1500);
    const visible = await page.evaluate(() => window.__webgl.debug().filter((d) => d.visible).length);
    expect(visible).toBe(0);
  });

  test('the canvas layer sits under the title and controls, not in a fixed stacking context with them', async ({ page }) => {
    await page.goto('/work/portrait/');
    await page.waitForTimeout(1500);
    const layout = await page.evaluate(() => ({
      main: getComputedStyle(document.querySelector('main.gallery')!).position,
      canvasAfterMain: !!(document.querySelector('main.gallery')!.compareDocumentPosition(document.querySelector('canvas')!) & Node.DOCUMENT_POSITION_FOLLOWING),
      title: getComputedStyle(document.querySelector('.gallery__title')!).zIndex,
      controls: getComputedStyle(document.querySelector('.gallery__controls')!).zIndex,
    }));
    expect(layout.main).not.toBe('fixed');
    expect(layout.canvasAfterMain).toBe(true);
    expect(Number(layout.title)).toBeGreaterThan(0);
    expect(Number(layout.controls)).toBeGreaterThan(0);
  });
});

test.describe('home strips', () => {
  test('tint surfaces arrive only once the strips have opened', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(300);
    expect((await gl(page)).surfaces, 'none mid-reveal: the mesh would ignore the clip').toBe(0);
    await page.waitForTimeout(2500);
    expect(await gl(page)).toEqual({ active: true, surfaces: await page.locator('a.strip').count() });
  });

  test('hovering a strip drives its tint to full, and no other', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2800);
    await page.locator('a[data-discipline="portrait"]').hover();
    await page.waitForTimeout(900);
    const hover = await page.evaluate(() => window.__webgl.debug().map((d) => d.uniforms.uHover));
    expect(hover[0]).toBeCloseTo(1, 2);
    expect(hover[1]).toBeCloseTo(0, 2);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__webgl.debug()[0].uniforms.uHover)).toBeCloseTo(0, 2);
  });

  test('strip names paint above the WebGL layer', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('.strip__label').first().evaluate((el) => getComputedStyle(el).zIndex)).toBe('1');
  });
});

/*
 * Restored from the previous site's suite (git show 2dc2d51:tests/e2e/webgl.spec.ts),
 * re-pointed at the new pages: the guarantees belong to src/webgl, not to the
 * components that used to exercise them.
 */
test.describe('WebGL layer guarantees', () => {
  test('reduced motion creates no context at all', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const path of ['/', '/work/portrait/']) {
      await page.goto(path);
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => window.__webgl.active()), path).toBe(false);
      expect(await page.locator('canvas').count(), path).toBe(0);
    }
    await ctx.close();
  });

  test('with WebGL refused, every strip and frame is visible and in place', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) {
        if (t === 'webgl' || t === 'webgl2') return null;
        return orig.call(this, t, ...a);
      } as typeof orig;
    });
    const page = await ctx.newPage();
    for (const path of ['/', '/work/analog/', '/about/']) {
      await page.goto(path);
      await page.waitForTimeout(2500);
      expect(await page.evaluate(() => window.__webgl.active()), path).toBe(false);
      const hidden = await page.evaluate(() =>
        [...document.querySelectorAll('main img')].filter((i) => {
          if (i.closest('[data-single]')) return false;
          const s = getComputedStyle(i);
          const r = i.getBoundingClientRect();
          return r.width === 0 || s.visibility === 'hidden' || Number(s.opacity) < 0.99;
        }).length
      );
      expect(hidden, path).toBe(0);
    }
    await page.goto('/work/analog/');
    await expect(page.locator('main.gallery')).toHaveClass(/is-canvas/);
    await ctx.close();
  });

  test('the context is released across navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1200);
    for (let i = 0; i < 3; i++) {
      await page.locator('a[data-discipline="analog"]').click();
      await page.waitForURL(/analog/);
      await page.waitForTimeout(600);
      await page.locator('header a[data-nav="home"]').click();
      await page.waitForURL((u) => u.pathname === '/');
      await page.waitForTimeout(1200);
    }
    expect(await page.locator('canvas').count()).toBeLessThanOrEqual(1);
  });

  test('supported() leaks no probe context, and its answer is cached', async ({ page }) => {
    await page.addInitScript(installGlStatsProbe);
    await page.goto('/');
    await page.waitForTimeout(1200);
    const before = await page.evaluate(() => (window as unknown as { __glStats: { created: number } }).__glStats.created);
    const CYCLES = 5;
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) {
        document.dispatchEvent(new Event('astro:before-swap'));
        document.dispatchEvent(new Event('astro:page-load'));
      }
    }, CYCLES);
    const stats = await page.evaluate(() => (window as unknown as { __glStats: { created: number; lost: number } }).__glStats);
    // Cached: each cycle creates the real renderer's context only, never a fresh probe beside it.
    expect(stats.created - before).toBe(CYCLES);
    // Released: every context but the live one was explicitly lost.
    expect(stats.created - stats.lost).toBe(1);
  });
});

function installGlStatsProbe(): void {
  const stats = { created: 0, lost: 0 };
  (window as unknown as { __glStats: typeof stats }).__glStats = stats;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
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
          ext.loseContext = () => {
            stats.lost++;
            origLose();
          };
        }
        return ext;
      }) as typeof glCtx.getExtension;
    }
    return ctx;
  } as typeof origGetContext;
}
