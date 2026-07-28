import { test, expect } from '@playwright/test';

/**
 * Regression coverage for the whole-branch review's C1 (mobile nav
 * white-on-white) and I4 (nothing but a comment protects is-over-dark vs
 * is-scrolled source order) findings.
 *
 * Both tests were verified to go red when their corresponding fix was
 * reverted, and green again once restored:
 *   - I4 test: red when `.header.is-over-dark` was moved before
 *     `.header.is-scrolled` in Header.astro (nav text painted
 *     rgb(32, 31, 29) — near-black — on the dark hero photo).
 *   - C1 test: red when the `.nav-links.is-open` override block was
 *     removed from Header.astro (contrast dropped to ~1.1:1).
 */

/** Parses `rgb(r, g, b)` / `rgba(r, g, b, a)` as returned by getComputedStyle. */
function parseColor(value: string): [number, number, number, number] {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`Unrecognized computed color: ${value}`);
  const parts = match[1].split(',').map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = parts;
  return [r, g, b, a];
}

function relativeLuminance([r, g, b]: readonly number[]): number {
  const channels = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between a (possibly translucent) foreground and an opaque background. */
function contrastRatio(fgValue: string, bgValue: string): number {
  const [fr, fg, fb, fa] = parseColor(fgValue);
  const [br, bg, bb] = parseColor(bgValue);

  // Flatten the foreground over the background using its alpha channel,
  // matching how the browser actually composites it on screen.
  const flattened: [number, number, number] = [
    fr * fa + br * (1 - fa),
    fg * fa + bg * (1 - fa),
    fb * fa + bb * (1 - fa),
  ];

  const l1 = relativeLuminance(flattened);
  const l2 = relativeLuminance([br, bg, bb]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('navlink stays light when is-over-dark and is-scrolled are both active (I4)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  // The hero is 100vh and carries data-header-theme="dark", so scrolling
  // 300px keeps it under the header band while also crossing the 80px
  // is-scrolled threshold — both classes are active simultaneously here.
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(300);

  const header = page.locator('.header');
  await expect(header).toHaveClass(/is-scrolled/);
  await expect(header).toHaveClass(/is-over-dark/);

  const navlinkColor = await page.locator('.navlink').first().evaluate((el) => getComputedStyle(el).color);
  const [r, g, b, a] = parseColor(navlinkColor);

  // .header.is-over-dark .navlink is rgba(255, 255, 255, 0.8). If source
  // order regresses and .is-scrolled wins instead, this becomes the
  // near-black var(--color-text) (~rgb(32, 31, 29)) painted on the dark
  // hero photo.
  expect(r).toBeGreaterThan(200);
  expect(g).toBeGreaterThan(200);
  expect(b).toBeGreaterThan(200);
  expect(a).toBeGreaterThan(0.5);
});

test('mobile nav links are readable against the open dropdown panel in light theme (C1)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const page = await ctx.newPage();

  await page.goto('/');
  await page.waitForTimeout(300); // let the is-over-dark IntersectionObserver settle; hero is dark at scroll 0

  await expect(page.locator('.header')).toHaveClass(/is-over-dark/);

  await page.locator('#nav-toggle').click();
  const panel = page.locator('.nav-links.is-open');
  await expect(panel).toBeVisible();
  await page.waitForTimeout(350); // mobileMenuSlide animation (0.3s)

  const navlink = panel.locator('.navlink').first();
  const langBtnActive = panel.locator('.lang-btn.is-active');

  const [navlinkColor, langBtnColor, panelBg] = await Promise.all([
    navlink.evaluate((el) => getComputedStyle(el).color),
    langBtnActive.evaluate((el) => getComputedStyle(el).color),
    panel.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);

  const navlinkRatio = contrastRatio(navlinkColor, panelBg);
  const langBtnRatio = contrastRatio(langBtnColor, panelBg);

  // WCAG AA for normal text is 4.5:1. Before the fix this measured ~1.1:1
  // for both .navlink and .lang-btn.is-active.
  expect(navlinkRatio).toBeGreaterThanOrEqual(4.5);
  expect(langBtnRatio).toBeGreaterThanOrEqual(4.5);

  await ctx.close();
});
