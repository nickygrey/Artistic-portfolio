import { test, expect } from '@playwright/test';

/**
 * Regression coverage for a bug introduced by preventNativeAnchorJump()
 * itself (see its doc comment in src/motion/engine.ts). That listener was
 * added to stop Chromium's native fragment-jump from racing Lenis's smooth
 * anchor scroll, by calling event.preventDefault() in the capture phase for
 * any click on a same-host/same-pathname/has-hash link. It originally did
 * this unconditionally, with no check of keyboard modifiers or which mouse
 * button was pressed.
 *
 * Concrete failure: a user cmd-clicks (macOS) a nav link intending to open
 * that section in a new background tab. preventDefault() in the capture
 * phase cancelled the browser's native "open in new tab" action, so no tab
 * opened — and Lenis's own bubble-phase handler then smooth-scrolled the
 * *current* tab instead, since it has an identical host/pathname/hash match
 * with no modifier check of its own. Before preventNativeAnchorJump was
 * added, nothing intercepted this click and modifier-clicks worked
 * normally.
 *
 * This test asserts both halves of correct behaviour:
 *   1. The new tab actually opens (proves preventDefault() was skipped).
 *   2. The current tab's scroll position does not move (proves Lenis's own
 *      onClick, which has no modifier check either, was also kept from
 *      acting on this click — see suppressLenisAnchorForThisDispatch() in
 *      engine.ts for how).
 *
 * Verified to fail without the fix: temporarily reverting the modifier
 * guard in preventNativeAnchorJump() turns assertion (1) red (no `page`
 * event fires — the tab never opens) with the same symptom described
 * above.
 *
 * This machine/browser is macOS Chrome, where Cmd (Meta) is the modifier
 * Chromium maps to "open in new background tab" for a plain click — Ctrl
 * does not trigger that native behaviour on this platform (verified
 * separately), so it wouldn't exercise assertion (1) here even though the
 * engine's own guard checks ctrlKey too, for Windows/Linux. Meta is used
 * for that reason, not because ctrlKey is unhandled.
 */
test('cmd-clicking an in-page anchor opens a new tab and does not scroll the current one', async ({
  page,
  context,
}) => {
  await page.goto('/');
  // See anchor-scroll.spec.ts for why this wait exists: initMotion() (which
  // wires up both Lenis and this listener) runs on astro:page-load, and the
  // dev server's first compile of the motion bundle can be slow under
  // parallel test-worker load.
  await page.waitForTimeout(1000);

  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBe(0); // sanity: starting at the top of the page

  const newPagePromise = context.waitForEvent('page');
  await page.locator('a.navlink[href="#about"]').click({ modifiers: ['Meta'] });

  const newPage = await newPagePromise;
  await newPage.waitForLoadState();
  expect(new URL(newPage.url()).hash).toBe('#about');
  await newPage.close();

  // Give Lenis's ticker a beat to have run, if it was ever going to.
  await page.waitForTimeout(500);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBe(scrollBefore);
});
