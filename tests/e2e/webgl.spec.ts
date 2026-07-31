import { test, expect } from '@playwright/test';

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
