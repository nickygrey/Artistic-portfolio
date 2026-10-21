import { test, expect, type Page } from '@playwright/test';

declare global { interface Window { __gallery: { observers(): number; mounted(): boolean; offset(): { x: number; y: number } } } }

const offset = (page: Page) => page.evaluate(() => window.__gallery.offset());

const visibleFrame = (page: Page) =>
  page.evaluate(() => {
    // The most visible frame, clipped to a safe area clear of the header, title, hint and back button.
    const box = { l: 60, t: 100, r: innerWidth - 60, b: innerHeight - 140 };
    let best: { frame: string; cx: number; cy: number; area: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('[data-frame]')) {
      const r = el.getBoundingClientRect();
      const l = Math.max(r.left, box.l), t = Math.max(r.top, box.t), rr = Math.min(r.right, box.r), b = Math.min(r.bottom, box.b);
      const area = Math.max(0, rr - l) * Math.max(0, b - t);
      if (area > (best?.area ?? 0) && rr - l > 60 && b - t > 60) best = { frame: el.dataset.frame!, cx: (l + rr) / 2, cy: (t + b) / 2, area };
    }
    return best;
  });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('on desktop the gallery becomes a canvas of images only', async ({ page }) => {
  await page.goto('/work/portrait/');
  await expect(page.locator('main.gallery')).toHaveClass(/is-canvas/);
  await expect(page.locator('.gallery__hint')).toBeVisible();
  await expect(page.locator('main figcaption')).toHaveCount(0);
  expect(await page.evaluate(() => window.__gallery.mounted())).toBe(true);
});

test('dragging pans the canvas and it glides on', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const before = await offset(page);
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(420, 450, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const mid = await offset(page);
  await page.waitForTimeout(1500);
  const after = await offset(page);
  expect(before.x - after.x, 'follows the drag').toBeGreaterThan(250);
  expect(before.x - after.x, 'a flick glides on, but not off into the distance').toBeLessThan(300 + 2500 * 0.18 + 1);
  expect(mid.x - after.x, 'still gliding just after release').toBeGreaterThan(5);
});

test('a drag that ends on a frame does not open it', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.move(f.cx, f.cy);
  await page.mouse.down();
  await page.mouse.move(f.cx - 200, f.cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(new URL(page.url()).search).toBe('');
});

test('a plain click on a frame opens its single view', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const f = (await visibleFrame(page))!;
  await page.mouse.click(f.cx, f.cy);
  await page.waitForURL((u) => u.search === `?frame=${f.frame}`);
});

test('the wheel and the arrow keys pan too', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const before = await offset(page);
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1200);
  const afterWheel = await offset(page);
  expect(before.y - afterWheel.y).toBeGreaterThan(250);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1200);
  const afterKey = await offset(page);
  expect(afterWheel.x - afterKey.x).toBeGreaterThan(250);
});

test('the canvas is endless: far drags never run out of images', async ({ page }) => {
  await page.goto('/work/analog/');
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(1100, 450);
    await page.mouse.down();
    await page.mouse.move(300, 450, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForTimeout(1500);
  const onScreen = await page.$$eval('[data-frame]', (els) =>
    els.filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).length
  );
  expect(onScreen).toBeGreaterThanOrEqual(1);
});

test('under reduced motion the canvas still drags, exactly 1:1', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const before = await offset(page);
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.mouse.move(420, 450, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await offset(page);
  expect(Math.abs(before.x - after.x - 300)).toBeLessThan(20);
  await ctx.close();
});

test('on a phone the gallery is a scrolling two-column grid, not a canvas', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  await expect(page.locator('main.gallery')).not.toHaveClass(/is-canvas/);
  const lefts = await page.$$eval('[data-frame]', (els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
  expect(lefts).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await ctx.close();
});

test('the canvas leaves nothing behind across navigations', async ({ page }) => {
  await page.goto('/work/portrait/');
  for (let i = 0; i < 3; i++) {
    await page.locator('header a[data-nav="home"]').click();
    await page.waitForURL((u) => u.pathname === '/');
    expect(await page.evaluate(() => window.__gallery.observers())).toBe(0);
    await page.locator('a[data-discipline="portrait"]').click();
    await page.waitForURL((u) => u.pathname === '/work/portrait/');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__gallery.observers())).toBe(1);
  }
});

test('a small gallery still fills the screen, using repeats hidden from assistive tech', async ({ page }) => {
  await page.goto('/work/analog/');
  await page.waitForTimeout(400);
  const onScreen = await page.$$eval('[data-frame]', (els) =>
    els.filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).length
  );
  expect(onScreen).toBeGreaterThanOrEqual(4);
  const clones = await page.$$eval('[data-clone]', (els) =>
    els.map((e) => ({ hidden: e.getAttribute('aria-hidden'), tab: e.querySelector('a')?.getAttribute('tabindex') }))
  );
  expect(clones.length).toBeGreaterThan(0);
  for (const c of clones) expect(c).toEqual({ hidden: 'true', tab: '-1' });
  expect(await page.locator('[data-frame]:not([data-clone]) a').count()).toBe(6);
});

test('repeats are removed when the canvas is torn down', async ({ page }) => {
  await page.goto('/work/analog/');
  await page.locator('header a[data-nav="about"]').click();
  await page.waitForURL((u) => u.pathname === '/about/');
  await page.goBack();
  await page.waitForURL((u) => u.pathname === '/work/analog/');
  await page.waitForTimeout(300);
  const originals = await page.locator('[data-frame]:not([data-clone])').count();
  expect(originals).toBe(6);
});

test('on a phone the title leads the page and never sits on a photo', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const title = await page.locator('.gallery__title').boundingBox();
  const first = await page.locator('[data-frame="1"]').boundingBox();
  expect(title!.y + title!.height).toBeLessThanOrEqual(first!.y);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  const t2 = await page.locator('.gallery__title').boundingBox();
  expect(t2!.y, 'the title scrolls away with the page').toBeLessThan(title!.y);
  await ctx.close();
});

test('a gallery opens with its first photograph centred', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.waitForTimeout(300);
  const r = (await page.locator('[data-frame="1"]:not([data-clone])').boundingBox())!;
  expect(Math.abs(r.x + r.width / 2 - 720)).toBeLessThan(2);
  expect(Math.abs(r.y + r.height / 2 - 450)).toBeLessThan(2);
});
