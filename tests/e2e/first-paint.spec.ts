import { test, expect, type Page } from '@playwright/test';

/*
 * What the very first painted frames show. Sampled every animation frame from
 * the first one, because a one-frame flash slips between screenshots.
 */
async function sampleFrames(page: Page, probe: string) {
  await page.addInitScript((source) => {
    const read = new Function(`return (${source})()`) as () => unknown;
    const log: Array<[number, unknown]> = ((window as unknown as { __frames: Array<[number, unknown]> }).__frames = []);
    const t0 = performance.now();
    const sample = () => {
      const v = read();
      if (v !== undefined) log.push([Math.round(performance.now() - t0), v]);
      if (performance.now() - t0 < 1200) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, probe);
}

test('home strips never paint fully open before their reveal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sampleFrames(page, `() => {
    const m = document.querySelector('[data-strip-media]');
    if (!m || !m.getBoundingClientRect().width) return undefined;
    return getComputedStyle(m).clipPath;
  }`);
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForTimeout(1400);
  const frames = await page.evaluate(() => (window as unknown as { __frames: Array<[number, string]> }).__frames);
  expect(frames.length).toBeGreaterThan(5);
  expect(frames[0][1], `first painted frame (${frames[0][0]} ms)`).not.toBe('none');
});

test('a gallery never paints its fallback grid before the canvas on a pointer device', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sampleFrames(page, `() => {
    const main = document.querySelector('main.gallery');
    const list = document.querySelector('.gallery__frames');
    if (!main || !list) return undefined;
    return main.classList.contains('is-canvas') || getComputedStyle(list).visibility === 'hidden' ? 'ok' : 'grid';
  }`);
  await page.goto('/work/portrait/', { waitUntil: 'commit' });
  await page.waitForTimeout(1400);
  const frames = await page.evaluate(() => (window as unknown as { __frames: Array<[number, string]> }).__frames);
  expect(frames.filter(([, v]) => v === 'grid').map(([t]) => t)).toEqual([]);
});

test('if the canvas never mounts, the gallery grid still appears', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/src/gallery/**', (route) => route.abort());
  await page.goto('/work/portrait/');
  await page.waitForTimeout(3200);
  await expect(page.locator('main.gallery')).not.toHaveClass(/is-canvas/);
  expect(await page.locator('.gallery__frames').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
});

test('touch devices are never held back: their grid paints at once', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/', { waitUntil: 'domcontentloaded' });
  expect(await page.locator('.gallery__frames').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  await ctx.close();
});
