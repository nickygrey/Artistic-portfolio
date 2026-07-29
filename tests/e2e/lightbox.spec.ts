import { test, expect, type Page } from '@playwright/test';

/**
 * Native width of every photo in src/assets/photos (all 1066x1600 — see
 * src/lib/photos.ts). The lightbox exists specifically so a visitor can
 * look at a photograph closely; it must show this resolution regardless of
 * what the carousel thumbnail happened to load for its own, much smaller,
 * on-screen slot.
 */
const NATIVE_PHOTO_WIDTH = 1066;

/**
 * Opens the lightbox on the first carousel slide. `{ force: true }` is
 * required, not a shortcut: the desktop marquee moves the track
 * continuously (data-animation="marquee"), so Playwright's default
 * actionability wait ("element must be stable") never resolves — the slide
 * is always mid-transform. Clicking still lands on the right element; only
 * the "hasn't moved recently" check is skipped.
 */
async function openLightboxOnFirstSlide(page: Page) {
  const slide = page.locator('.carousel-slide[data-index="0"]').first();
  await slide.click({ force: true });
  await page.waitForSelector('#lightbox.is-open');
}

/**
 * naturalWidth is 0 until the image resource has actually finished
 * decoding — waiting for it (rather than reading naturalWidth immediately
 * after setting src) is what makes this test meaningful instead of racy.
 */
async function waitForLightboxImageLoaded(page: Page) {
  await page.waitForFunction(() => {
    const img = document.getElementById('lightbox-img') as HTMLImageElement | null;
    return !!img && img.complete && img.naturalWidth > 0;
  });
}

for (const dpr of [1, 2]) {
  test(`lightbox shows the full source resolution, not an upscaled thumbnail (DPR ${dpr})`, async ({
    browser,
  }) => {
    // A plain desktop-sized viewport, not a mobile device preset: this is
    // exactly the "normal external monitor" scenario the regression this
    // test guards against was measured against — the carousel thumbnail's
    // sizes="(max-width: 480px) 140px, (max-width: 900px) 180px, 230px"
    // caps its resolved candidate at 230px display width, so at 1280px
    // wide neither DPR 1 nor DPR 2 ever needs the thumbnail's full 1066w
    // srcset tier. The lightbox must still show 1066px regardless.
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: dpr,
    });
    const page = await ctx.newPage();
    await page.goto('/');

    await openLightboxOnFirstSlide(page);
    await waitForLightboxImageLoaded(page);

    const naturalWidth = await page.evaluate(
      () => (document.getElementById('lightbox-img') as HTMLImageElement).naturalWidth
    );

    expect(naturalWidth).toBe(NATIVE_PHOTO_WIDTH);

    await ctx.close();
  });
}

test('lightbox alt text describes the actual photograph shown', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');

  await openLightboxOnFirstSlide(page);
  await waitForLightboxImageLoaded(page);

  const alt = await page.locator('#lightbox-img').getAttribute('alt');
  expect(alt).toMatch(/Photography by P\.V\./);

  await ctx.close();
});
