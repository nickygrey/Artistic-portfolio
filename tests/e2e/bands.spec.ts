// tests/e2e/bands.spec.ts
import { test, expect, devices } from '@playwright/test';

test('bands span the full viewport width without overflow', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const bands = [...document.querySelectorAll('.band')];
    const vw = document.documentElement.clientWidth;
    return {
      count: bands.length,
      fullWidth: bands.every(b => Math.abs(b.getBoundingClientRect().width - vw) < 2),
      tallEnough: bands.every(b => b.getBoundingClientRect().height > window.innerHeight * 0.8),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(r.count).toBe(3);
  expect(r.fullWidth).toBe(true);
  expect(r.tallEnough).toBe(true);
  expect(r.overflow).toBeLessThanOrEqual(1);
});

test('bands carry an image that actually loaded', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.band')?.scrollIntoView());
  await page.waitForTimeout(2000);
  const loaded = await page.evaluate(() => {
    const img = document.querySelector('.band img') as HTMLImageElement;
    return { complete: img?.complete, natural: img?.naturalWidth ?? 0 };
  });
  expect(loaded.complete).toBe(true);
  expect(loaded.natural).toBeGreaterThan(0);
});

test('header inverts to its light-on-dark state when a band fills the viewport', async ({ page }) => {
  // Bands carry data-header-theme="dark" paired with a top scrim
  // (.band-scrim in ImageBand.astro) that guarantees darkness under the
  // header regardless of the photograph — mirroring Hero.astro's own
  // data-header-theme/.hero-overlay pairing. Without the marker, the
  // header's IntersectionObserver never sees the band as a "dark section"
  // and .is-over-dark never activates, leaving near-white header text
  // (--color-text in the default dark theme) over whatever the band
  // happens to render.
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.band')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1000); // theme IntersectionObserver settle
  await expect(page.locator('.header')).toHaveClass(/is-over-dark/);
});

test('bands do not introduce horizontal overflow on mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  const o = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o).toBeLessThanOrEqual(1);
  await ctx.close();
});
