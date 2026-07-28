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

    // Drives the component's actual wrap() function rather than asserting
    // static DOM geometry. A version of this test that only checked
    // offsetLeft-based positions after manually setting scrollLeft passed
    // even with the entire wrap implementation deleted — nothing forced the
    // app's own listener to run at all. This dispatches a real 'touchstart'
    // (which the component's own listener uses to pause autoplay, exactly as
    // a real touch would — wrap() is gated to a no-op while autoplay is
    // running, see PhotoCarousel.astro), then a real scrollLeft change past
    // each boundary, and waits for the resulting native 'scroll' event
    // (which is what actually invokes wrap()) before reading the outcome.
    //
    // The offset injected past each boundary (5px) is asserted back with a
    // tight tolerance rather than just "somewhere in range": wrap() must
    // subtract/add *exactly* one period, or a drifting seam (the flex `gap`
    // trap `period()` is designed to avoid) would show up here as several
    // px of error rather than passing.
    const result = await page.evaluate(async () => {
      const el = document.querySelector('#photo-carousel') as HTMLElement;
      const slides = document.querySelectorAll('#carousel-track > *');
      const first = slides[0] as HTMLElement;
      const secondCopy = slides[Math.floor(slides.length / 2)] as HTMLElement;
      const period = secondCopy.offsetLeft - first.offsetLeft;

      function nextScroll(): Promise<void> {
        return new Promise((resolve) => {
          el.addEventListener('scroll', () => resolve(), { once: true });
          // Fallback in case the assignment below doesn't change the rounded
          // scrollLeft value and so never fires a 'scroll' event at all.
          setTimeout(resolve, 200);
        });
      }

      // Pause autoplay the same way a real touch does, so the component's
      // scroll listener (and the wrap() it calls) is actually live — it is a
      // deliberate no-op while autoplay is running.
      el.dispatchEvent(new Event('touchstart'));

      // Forward: land 5px past the boundary, as a real drag or its momentum
      // would, and let the app's own listener correct it.
      el.scrollLeft = period + 5;
      await nextScroll();
      const afterForward = el.scrollLeft;

      // Backward: land at the clamped floor (native scrolling never reports
      // negative), and let the app wrap us to the equivalent tail position.
      el.scrollLeft = 0;
      await nextScroll();
      const afterBackward = el.scrollLeft;

      el.dispatchEvent(new Event('touchend'));

      return { period, afterForward, afterBackward };
    });

    expect(result.period).toBeGreaterThan(0);
    // Forward: period + 5 should have been corrected to exactly ~5.
    expect(Math.abs(result.afterForward - 5)).toBeLessThan(2);
    // Backward: 0 should have been corrected to exactly ~period.
    expect(Math.abs(result.afterBackward - result.period)).toBeLessThan(2);
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

  // Standalone controls only. A link inside a paragraph of body copy inherits
  // the line height of its prose, and forcing it to 44px would break the text
  // flow it lives in — so a blanket rule over every anchor would produce
  // false failures and train people to weaken this test.
  const TAP_TARGET_SELECTORS = [
    '.logo',
    '.nav-toggle',
    '.youtube-link',
    '.archive-link',
    'footer a',
  ];

  // 390 is the iPhone 13 the rest of this suite already uses. The other
  // three exist because a fixed padding tuned to only 390px passed there
  // and silently failed everywhere global.css's 380px breakpoint shrinks
  // .logo's font-size and .nav-toggle's own size — an iPhone SE (375),
  // a very common Android width (360), and the smallest width this site
  // supports (320) are what actually caught that. Every width below the
  // breakpoint (375/360/320) shares the same shrunk font-size, but they're
  // asserted individually rather than collapsed into "one representative
  // narrow width" so a regression at any specific width fails by name.
  const WIDTHS = [390, 375, 360, 320];

  for (const width of WIDTHS) {
    test(`tap targets meet the 44px minimum at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({
        ...MOBILE,
        viewport: { width, height: 844 },
      });
      const page = await ctx.newPage();
      await page.goto('/');
      await page.waitForTimeout(1500);

      const undersized = await page.evaluate((sels) => {
        const out: Array<{ sel: string; text: string; w: number; h: number }> = [];
        for (const sel of sels) {
          for (const el of Array.from(document.querySelectorAll(sel))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.width < 44 || r.height < 44) {
              out.push({
                sel,
                text: (el.textContent || '').trim().slice(0, 20),
                w: Math.round(r.width),
                h: Math.round(r.height),
              });
            }
          }
        }
        return out;
      }, TAP_TARGET_SELECTORS);

      expect(undersized).toEqual([]);
      await ctx.close();
    });
  }
});
