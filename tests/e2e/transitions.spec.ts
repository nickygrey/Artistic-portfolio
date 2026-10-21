import { test, expect, type Page } from '@playwright/test';

const named = (page: Page, name: string) =>
  page.evaluate((n) => [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).viewTransitionName === n).length, name);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('each strip shares exactly one transition name with its gallery', async ({ page }) => {
  await page.goto('/');
  expect(await named(page, 'frame-portrait')).toBe(1);
  expect(await named(page, 'frame-analog')).toBe(1);
  await page.goto('/work/portrait/');
  await page.waitForTimeout(400);
  expect(await named(page, 'frame-portrait'), 'repeats must not duplicate the name, or the transition is skipped').toBe(1);
  expect(await page.locator('[data-clone] [data-astro-transition-scope], [data-clone][data-astro-transition-scope]').count()).toBe(0);
});

test('the named gallery frame is the cover, the same photograph the strip shows', async ({ page }) => {
  await page.goto('/work/analog/');
  await page.waitForTimeout(400);
  const coverNamed = await page.evaluate(() => getComputedStyle(document.querySelector('[data-cover]:not([data-clone]) a')!).viewTransitionName);
  expect(coverNamed).toBe('frame-analog');
});

test('the canvas is laid out at the swap, so the new snapshot already shows it', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('astro:after-swap', () => {
      queueMicrotask(() => {
        (window as unknown as { __canvasAtSwap: boolean }).__canvasAtSwap =
          !!document.querySelector('main.gallery.is-canvas');
      });
    });
  });
  await page.goto('/');
  await page.locator('a[data-discipline="portrait"]').click();
  await page.waitForURL((u) => u.pathname === '/work/portrait/');
  expect(await page.evaluate(() => (window as unknown as { __canvasAtSwap: boolean }).__canvasAtSwap)).toBe(true);
});

test('page transitions take their timing from the motion scale, and none play under reduced motion', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/');
  const css = await page.evaluate(() =>
    [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).join('\n')
  );
  expect(css).toMatch(/::view-transition-group\(\*\)[^}]*animation-duration: var\(--dur-base\)/);
  // Chrome serialises `animation: none` as its full longhand, which still ends in the `none` name.
  expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*::view-transition-group\(\*\)[^}]*animation:[^;]*\bnone;/);
  await page.close();
});
