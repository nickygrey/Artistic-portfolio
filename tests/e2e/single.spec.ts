import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window { __gallery: { offset(): { x: number; y: number } | null } }
}

const dialog = (page: Page) => page.locator('[data-single]');
const count = (page: Page) => page.locator('[data-count]');
const frameParam = (page: Page) => new URL(page.url()).searchParams.get('frame');

/** Opens frame `n` by clicking its (original) grid link, panning it into view with the keyboard first. */
async function openFrame(page: Page, n: number) {
  const link = page.locator(`[data-frame="${n}"]:not([data-clone]) a`);
  await link.focus();
  await page.waitForTimeout(900);
  await link.click();
  await expect(dialog(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('clicking a frame opens it in single view, with focus on Close', async ({ page }) => {
  await page.goto('/work/portrait/');
  await openFrame(page, 2);
  expect(frameParam(page)).toBe('2');
  await expect(count(page)).toHaveText('2 / 7');
  await expect(page.locator('[data-single-frame="2"] img')).toBeVisible();
  await expect(page.locator('[data-single-frame="1"]')).toBeHidden();
  const alt = await page.locator('[data-frame="2"]:not([data-clone]) img').getAttribute('alt');
  await expect(page.locator('[data-single-frame="2"] img')).toHaveAttribute('alt', alt!);
  await expect(page.locator('.single__close')).toBeFocused();
});

test('arrow keys step through frames and wrap, and the URL follows', async ({ page }) => {
  await page.goto('/work/portrait/?frame=6');
  await expect(count(page)).toHaveText('6 / 7');
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('7 / 7');
  await page.keyboard.press('ArrowRight');
  await expect(count(page)).toHaveText('1 / 7');
  expect(frameParam(page)).toBe('1');
  await page.keyboard.press('ArrowLeft');
  await expect(count(page)).toHaveText('7 / 7');
});

test('the rail jumps to a frame and marks it current', async ({ page }) => {
  await page.goto('/work/portrait/?frame=1');
  await page.locator('[data-goto="5"]').click();
  await expect(count(page)).toHaveText('5 / 7');
  await expect(page.locator('[data-goto="5"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-goto="1"]')).not.toHaveAttribute('aria-current', /.*/);
});

test('Escape closes, clears the URL and returns focus to the opened frame', async ({ page }) => {
  await page.goto('/work/portrait/');
  await openFrame(page, 3);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect(frameParam(page)).toBeNull();
  await expect(page.locator('[data-frame="3"]:not([data-clone]) a')).toBeFocused();
});

test('Grid in the pill closes, and Single opens the first frame', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.locator('.gallery__controls [data-open]').click();
  await expect(count(page)).toHaveText('1 / 7');
  await page.locator('.single__controls .pill [data-close]').click();
  await expect(dialog(page)).toBeHidden();
});

test('a deep link opens straight into single view; a bad one stays on the grid', async ({ page }) => {
  await page.goto('/work/portrait/?frame=3');
  await expect(dialog(page)).toBeVisible();
  await expect(count(page)).toHaveText('3 / 7');
  for (const bad of ['99', 'abc', '0']) {
    await page.goto(`/work/portrait/?frame=${bad}`);
    await page.waitForTimeout(200);
    await expect(dialog(page)).toBeHidden();
  }
});

test('screen readers hear the position', async ({ page }) => {
  await page.goto('/work/portrait/?frame=3');
  await expect(page.locator('[data-live]')).toHaveText('3 of 7');
  await page.goto('/fr/work/portrait/?frame=3');
  await expect(page.locator('[data-live]')).toHaveText('3 sur 7');
});

test('Tab stays inside the dialog', async ({ page }) => {
  await page.goto('/work/portrait/?frame=1');
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-single]'))).toBe(true);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-single]'))).toBe(true);
  }
});

test('while single view is open the canvas does not move', async ({ page }) => {
  await page.goto('/work/portrait/?frame=2');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__gallery.offset());
  await page.keyboard.press('ArrowDown');
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__gallery.offset())).toEqual(before);
});

test('the photograph flies from its place in the grid to the stage', async ({ page }) => {
  await page.goto('/work/portrait/');
  const link = page.locator('[data-frame="1"]:not([data-clone]) a');
  await link.focus();
  await page.waitForTimeout(900);
  await link.click();
  const midway = await page.locator('[data-single-frame="1"] img').evaluate((el) => getComputedStyle(el).transform);
  expect(midway).not.toBe('none');
  await page.waitForTimeout(1500);
  expect(await page.locator('[data-single-frame="1"] img').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
});

test('under reduced motion single view opens without any flight', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await openFrame(page, 1);
  await page.waitForTimeout(50);
  expect(await page.locator('[data-single-frame="1"] img').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await ctx.close();
});

test('on a phone a tap opens single view and a swipe moves on', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await page.locator('[data-frame="1"] a').tap();
  await expect(count(page)).toHaveText('1 / 7');
  const stage = (await page.locator('[data-stage]').boundingBox())!;
  const y = stage.y + stage.height / 2;
  await page.locator('[data-stage]').dispatchEvent('pointerdown', { clientX: stage.x + stage.width * 0.8, clientY: y, pointerType: 'touch', isPrimary: true });
  await page.locator('[data-stage]').dispatchEvent('pointerup', { clientX: stage.x + stage.width * 0.2, clientY: y, pointerType: 'touch', isPrimary: true });
  await expect(count(page)).toHaveText('2 / 7');
  await ctx.close();
});

test('leaving with single view open and coming back finds the grid', async ({ page }) => {
  await page.goto('/work/portrait/?frame=4');
  await expect(dialog(page)).toBeVisible();
  await page.locator('header a[data-nav="about"]').click();
  await page.waitForURL((u) => u.pathname === '/about/');
  await page.locator('header a[data-nav="home"]').click();
  await page.locator('a[data-discipline="portrait"]').click();
  await page.waitForURL((u) => u.pathname === '/work/portrait/');
  await page.waitForTimeout(200);
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.classList.contains('single-open'))).toBe(false);
});
