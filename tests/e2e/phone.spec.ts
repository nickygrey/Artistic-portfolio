import { test, expect, type Page } from '@playwright/test';

/*
 * Runs on the iphone (WebKit) and android (Chrome) projects, in portrait and in
 * landscape — including a large phone on its side, where the screen is wide
 * but only ~400px tall.
 */
test.skip(({ isMobile }) => !isMobile, 'phone projects only');

const ORIENTATIONS = [
  { name: 'portrait', size: null },
  { name: 'landscape', size: 'swap' },
  { name: 'large landscape', size: { width: 932, height: 430 } },
] as const;

async function orient(page: Page, size: (typeof ORIENTATIONS)[number]['size']) {
  const v = page.viewportSize()!;
  if (size === 'swap') await page.setViewportSize({ width: Math.max(v.width, v.height), height: Math.min(v.width, v.height) });
  else if (size) await page.setViewportSize(size);
}

const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox();
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

for (const o of ORIENTATIONS) {
  test.describe(o.name, () => {
    test('single view keeps the photograph large and clear of the controls', async ({ page }) => {
      await orient(page, o.size);
      await page.goto('/work/portrait/?frame=3');
      await page.waitForTimeout(600);
      const vp = page.viewportSize()!;
      const photo = (await box(page, '[data-single-frame="3"] img'))!;
      const controls = (await box(page, '.single__controls'))!;
      // A photograph shown at least 60% of the screen's short side, fully on screen.
      expect(Math.max(photo.width, photo.height)).toBeGreaterThanOrEqual(Math.min(vp.width, vp.height) * 0.6);
      expect(photo.y).toBeGreaterThanOrEqual(0);
      expect(photo.y + photo.height).toBeLessThanOrEqual(vp.height + 1);
      const overlaps = photo.x < controls.x + controls.width && controls.x < photo.x + photo.width && photo.y < controls.y + controls.height && controls.y < photo.y + photo.height;
      expect(overlaps, 'controls do not sit on the photograph').toBe(false);
    });

    test('nothing scrolls sideways and the vertical label never shows', async ({ page }) => {
      await orient(page, o.size);
      for (const path of ['/', '/work/wedding/', '/about/']) {
        await page.goto(path);
        await page.waitForTimeout(400);
        expect(await overflow(page), path).toBeLessThanOrEqual(0);
        await expect(page.locator('.site-header__eyebrow'), path).toBeHidden();
      }
    });

    test('home strips stay a readable size', async ({ page }) => {
      await orient(page, o.size);
      await page.goto('/');
      await page.waitForTimeout(2200);
      for (const b of await page.$$eval('[data-strip-media]', (els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
        expect(b.width, 'strip width').toBeGreaterThanOrEqual(200);
        expect(b.height, 'strip height').toBeGreaterThanOrEqual(80);
      }
    });
  });
}

test('header links are comfortable thumb targets (44px tall)', async ({ page }) => {
  await page.goto('/');
  for (const sel of ['a[data-nav="home"]', 'a[data-nav="work"]', 'a[data-nav="about"]', 'a[data-nav="contact"]', 'a[data-locale="en"]', 'a[data-locale="de"]']) {
    const b = (await box(page, sel))!;
    expect(b.height, sel).toBeGreaterThanOrEqual(44);
    expect(b.width, sel).toBeGreaterThanOrEqual(24);
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('tapping a form field never makes the phone zoom in (16px text)', async ({ page }) => {
  await page.goto('/about/');
  for (const sel of ['input[name="name"]', 'input[name="email"]', 'textarea[name="message"]']) {
    const size = await page.locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, sel).toBeGreaterThanOrEqual(16);
  }
});
