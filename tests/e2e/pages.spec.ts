import { test, expect } from '@playwright/test';

test('a home strip opens its gallery and the page takes on that world', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[data-discipline="portrait"]').click();
  await page.waitForURL((u) => u.pathname === '/work/portrait/');
  // ClientRouter swaps <html> attributes; the world must follow the navigation.
  await expect(page.locator('html')).toHaveAttribute('data-world', 'portrait');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe('rgb(43, 21, 18)');
});

test('the locale switch keeps the visitor on the same page', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.locator('a[data-locale="fr"]').click();
  await page.waitForURL((u) => u.pathname === '/fr/work/portrait/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('Contact in the header lands on the contact section', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[data-nav="contact"]').click();
  await page.waitForURL((u) => u.pathname === '/about/');
  await expect(page.locator('#contact')).toBeInViewport();
});

test('the page never scrolls sideways at 375px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  for (const path of ['/', '/work/portrait/', '/about/', '/de/privacy/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});

test('the header eyebrow never collides with the nav or the page content', async ({ browser }) => {
  test.setTimeout(90_000);
  for (const width of [375, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    for (const path of ['/', '/work/portrait/', '/about/', '/de/privacy/']) {
      await page.goto(path);
      await page.waitForTimeout(2200);
      const hits = await page.evaluate(() => {
        const eyebrow = document.querySelector('.site-header__eyebrow')!.getBoundingClientRect();
        const overlaps = (r: DOMRect) =>
          r.width > 0 && r.height > 0 &&
          r.left < eyebrow.right && r.right > eyebrow.left && r.top < eyebrow.bottom && r.bottom > eyebrow.top;
        const others = [
          ...document.querySelectorAll('.site-header__nav, .site-header__name, main img, main h1, main p, main li'),
        ];
        return others
          .filter((el) => !el.closest('.is-canvas li'))
          .filter((el) => overlaps(el.getBoundingClientRect()))
          .map((el) => el.tagName + '.' + el.className);
      });
      expect(hits, `${width}px ${path}`).toEqual([]);
    }
    await ctx.close();
  }
});
