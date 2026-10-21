import { test, expect, type Page } from '@playwright/test';

const tint = (page: Page, slug: string) =>
  page.evaluate((s) => {
    const media = document.querySelector(`a[data-discipline="${s}"] [data-strip-media]`)!;
    return Number(getComputedStyle(media, '::after').opacity);
  }, slug);
const labelOpacity = (page: Page, slug: string) =>
  page.evaluate(
    (s) => Number(getComputedStyle(document.querySelector(`a[data-discipline="${s}"] .strip__label`)!).opacity),
    slug
  );

test('hovering a strip floods it with its accent and names it', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);
  expect(await tint(page, 'portrait')).toBe(0);
  expect(await labelOpacity(page, 'portrait')).toBe(0);
  await page.locator('a[data-discipline="portrait"]').hover();
  await page.waitForTimeout(800);
  expect(await tint(page, 'portrait')).toBe(1);
  expect(await labelOpacity(page, 'portrait')).toBe(1);
  expect(await tint(page, 'analog'), 'only the hovered strip tints').toBe(0);
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
  expect(clips.length).toBeGreaterThanOrEqual(2);
  expect(clips.every((c) => c === 'none')).toBe(true);
});

test('under reduced motion the strips are never clipped', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(100);
  const clips = await page.$$eval('[data-strip-media]', (els) => els.map((e) => getComputedStyle(e).clipPath));
  expect(clips.length).toBeGreaterThanOrEqual(2);
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

test('strips grow when there are few of them, without leaving the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(2500);
  const boxes = await page.$$eval('[data-strip-media]', (els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const span = boxes.at(-1).right - boxes[0].left;
  expect(span, 'the strips read as a band, not a pair of thumbnails').toBeGreaterThan(380);
  for (const b of boxes) expect(b.bottom).toBeLessThan(900 - 40);
});
