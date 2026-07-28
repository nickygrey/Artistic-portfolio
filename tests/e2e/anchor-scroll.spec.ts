import { test, expect } from '@playwright/test';

/**
 * Regression coverage for I2 (in-page anchor links teleporting instead of
 * animating). Two bugs had to be fixed here, in sequence:
 *
 *   1. `html { scroll-behavior: smooth }` was removed (it fought Lenis)
 *      with nothing put in its place — Lenis's `anchors` option was never
 *      enabled, so every anchor click was a plain, instant browser jump.
 *   2. Enabling `anchors: true` on its own was not sufficient: Lenis's own
 *      click handler doesn't call preventDefault(), and in Chromium the
 *      browser's native fragment-jump fires synchronously before Lenis's
 *      handler runs — so Lenis computed its scroll target from a stale,
 *      pre-jump cache and forcibly dragged the page back to the top
 *      instead of animating to the anchor. See preventNativeAnchorJump()
 *      in src/motion/engine.ts for the full explanation and fix.
 *
 * This test would have caught both: bug 1 fails the "passes through
 * intermediate values" assertion (a teleport has none), bug 2 fails the
 * "ends near the real target" assertion (it lands back at ~0 instead).
 *
 * Correctness is judged from native browser events, not elapsed wall-clock
 * time: Lenis's animation is driven by requestAnimationFrame via
 * gsap.ticker, and under parallel test-worker CPU contention its
 * real-world duration can stretch well past its nominal 1.1s — a
 * fixed-timeout polling budget was observed to flake under 3-worker load
 * for exactly that reason, both by sampling too little of the animation
 * and by mistaking a slow frame gap for the animation having settled.
 * Listening for 'scroll' (every real position change, however the browser
 * batches them) and waiting for the native 'scrollend' event (fired once
 * the browser itself considers scrolling to have stopped, regardless of
 * how long that took) sidesteps timing assumptions entirely.
 */
test('clicking an in-page anchor link animates the scroll instead of teleporting', async ({ page }) => {
  await page.goto('/');
  // initMotion() (which wires up Lenis's anchors handling) runs on
  // astro:page-load; under parallel test-worker load the dev server's
  // first compile of the motion bundle can be slow enough that a shorter
  // wait sometimes samples before Lenis exists yet.
  await page.waitForTimeout(1000);

  const targetOffset = await page.locator('#about').evaluate((el) => (el as HTMLElement).offsetTop);
  expect(targetOffset).toBeGreaterThan(500); // sanity: #about is genuinely far down the page

  // Awaited *before* the click: this round-trips to the page and back, so
  // by the time it resolves the listeners are guaranteed attached. Firing
  // this concurrently with the click (not awaiting it first) would race —
  // the click could reach the page before the listener setup does.
  await page.evaluate(() => {
    (window as unknown as { __capture: Promise<{ samples: number[]; finalY: number }> }).__capture = new Promise(
      (resolve) => {
        const samples: number[] = [];
        const onScroll = () => samples.push(window.scrollY);
        window.addEventListener('scroll', onScroll, { passive: true });
        const finish = () => {
          window.removeEventListener('scroll', onScroll);
          resolve({ samples, finalY: window.scrollY });
        };
        window.addEventListener('scrollend', finish, { once: true });
        // Safety net in case 'scrollend' never fires for some reason —
        // generous, since this only matters if the browser signal itself
        // fails, not as the primary completion detector.
        setTimeout(finish, 8000);
      }
    );
  });

  await page.locator('a.navlink[href="#about"]').click();
  const { samples, finalY } = await page.evaluate(
    () => (window as unknown as { __capture: Promise<{ samples: number[]; finalY: number }> }).__capture
  );

  // A teleport looks like a single scroll event straight to (near) the
  // final value, with nothing in between. An animation passes through
  // intermediate values strictly between 0 and the target on its way there.
  const midFlight = samples.some((y) => y > targetOffset * 0.1 && y < targetOffset * 0.9);
  expect(midFlight).toBe(true);

  // And it has to actually arrive: not stall partway, not overshoot to the
  // stale-cache bug's ~0.
  expect(Math.abs(finalY - targetOffset)).toBeLessThan(10);
});
