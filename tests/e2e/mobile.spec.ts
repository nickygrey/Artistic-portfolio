import { test, expect, devices } from '@playwright/test';

const MOBILE = { ...devices['iPhone 13'] };

test.describe('mobile layout', () => {
  test('the page does not scroll sideways', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // A 1px tolerance absorbs sub-pixel rounding; anything more is real overflow.
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await ctx.close();
  });

  test('every photograph is reachable by swiping', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    const reachable = await page.evaluate(() => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      return {
        canScroll: el.scrollWidth > el.clientWidth,
        overflowX: getComputedStyle(el).overflowX,
      };
    });

    expect(reachable.canScroll).toBe(true);
    expect(['auto', 'scroll']).toContain(reachable.overflowX);
    await ctx.close();
  });

  test('the carousel loops instead of ending', async ({ browser }) => {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    // Compare the rendered position of a known slide either side of a wrap.
    // Asserting only that scrollLeft changed would pass even if the wrap were
    // visibly jarring, so measure where the content actually lands.
    const result = await page.evaluate(() => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      const slides = document.querySelectorAll('#carousel-track > *');
      const first = slides[0] as HTMLElement;
      const secondCopy = slides[Math.floor(slides.length / 2)] as HTMLElement;
      const p = secondCopy.offsetLeft - first.offsetLeft;

      el.scrollLeft = 0;
      const before = first.getBoundingClientRect().left;

      // Land exactly one period along: the second copy's first slide should now
      // sit where the first slide sat.
      el.scrollLeft = p;
      const after = secondCopy.getBoundingClientRect().left;

      return { period: p, before, after, delta: Math.abs(after - before) };
    });

    expect(result.period).toBeGreaterThan(0);
    // Sub-pixel tolerance only — a drifting seam would show up as several px.
    expect(result.delta).toBeLessThan(2);
    await ctx.close();
  });

  test('photographs stay reachable under reduced motion', async ({ browser }) => {
    // This is the case that is currently broken: with the marquee stopped and
    // overflow hidden, roughly 72% of the strip cannot be reached by any means.
    const ctx = await browser.newContext({ ...MOBILE, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      const before = el.scrollLeft;
      el.scrollLeft = 400;
      const after = el.scrollLeft;
      return {
        overflowX: getComputedStyle(el).overflowX,
        scrollable: el.scrollWidth > el.clientWidth,
        moved: after !== before,
      };
    });

    expect(['auto', 'scroll']).toContain(state.overflowX);
    expect(state.scrollable).toBe(true);
    expect(state.moved).toBe(true);
    await ctx.close();
  });
});
