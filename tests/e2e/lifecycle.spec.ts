import { test, expect } from '@playwright/test';

declare global {
  interface Window { __motion: { triggerCount(): number } }
}

test('ScrollTrigger count does not grow across View Transitions', async ({ page }) => {
  // page.goto() is a full browser navigation that discards the JS realm —
  // it never exercises ClientRouter, which only intercepts same-document
  // link clicks. Only the very first entry into the site may use goto();
  // every subsequent navigation below is a real click on an in-page <a>
  // so the swap actually goes through ClientRouter and the engine's
  // astro:page-load / teardown cycle is what's under test, not a fresh
  // module load.
  await page.goto('/');
  await page.waitForTimeout(1200);

  const counts: number[] = [];
  counts.push(await page.evaluate(() => window.__motion.triggerCount()));

  for (let i = 0; i < 3; i++) {
    await page.locator('footer a[href="/privacy"]').click();
    await page.waitForURL((url) => url.pathname === '/privacy');
    await page.waitForTimeout(600);

    await page.locator('a.logo[href="/"]').click();
    await page.waitForURL((url) => url.pathname === '/');
    await page.waitForTimeout(1200);

    counts.push(await page.evaluate(() => window.__motion.triggerCount()));
  }

  // Every return to '/' must rebuild the same number of triggers.
  for (const c of counts) {
    expect(c).toBe(counts[0]);
  }
});

test('reduced motion leaves all content visible', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);

  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-animation]')]
      .filter((el) => Number(getComputedStyle(el).opacity) < 0.99).length
  );
  expect(hidden).toBe(0);
  await ctx.close();
});
