import { test, expect } from '@playwright/test';

declare global {
  interface Window { __motion: { triggerCount(): number } }
}

test('ScrollTrigger count does not grow across View Transitions', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);

  const counts: number[] = [];
  counts.push(await page.evaluate(() => window.__motion.triggerCount()));

  for (let i = 0; i < 3; i++) {
    await page.goto('/privacy');
    await page.waitForTimeout(600);
    await page.goto('/');
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
