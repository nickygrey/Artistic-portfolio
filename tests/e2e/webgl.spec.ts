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
    expect(await gl(page)).toEqual({ active: true, surfaces: 2 });
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
