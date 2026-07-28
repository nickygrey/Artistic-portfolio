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
});
