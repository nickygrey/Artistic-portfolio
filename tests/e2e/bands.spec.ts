// tests/e2e/bands.spec.ts
import { test, expect, devices, type Page } from '@playwright/test';
import sharp from 'sharp';

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

function contrastRatio(fg: readonly number[], bg: readonly number[]): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Measures the WCAG contrast ratio between an element's computed text/fill
 * colour and the pixels *actually rendered* behind it — a real screenshot,
 * sampled with `sharp`, not a re-derivation of the .band-scrim gradient
 * formula. That distinction matters: a test that recomputes the gradient
 * from the same constants the component uses would still pass if someone
 * weakened the gradient and "helpfully" updated both places, or would
 * simply drift if the two fell out of sync. Sampling the screenshot is
 * ground truth — it only sees what a real visitor's eye would.
 */
async function measureRenderedContrast(
  page: Page,
  selector: string,
  colorOf: (el: Element) => string
): Promise<{ contrastRatio: number; bgPixel: [number, number, number] } | null> {
  const locator = page.locator(selector).first();
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return null;

  const color = await locator.evaluate(colorOf);
  const screenshotBuf = await page.screenshot();
  const { data, info } = await sharp(screenshotBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  function pixelAt(x: number, y: number): [number, number, number] {
    const px = Math.max(0, Math.min(info.width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(info.height - 1, Math.round(y)));
    const idx = (py * info.width + px) * info.channels;
    return [data[idx], data[idx + 1], data[idx + 2]];
  }

  // Average a 5x3 grid across the element's box rather than one centre
  // pixel — more representative of a photographic (non-uniform) background.
  const samples: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      samples.push(pixelAt(box.x + (box.width * (i + 0.5)) / 5, box.y + (box.height * (j + 0.5)) / 3));
    }
  }
  const n = samples.length;
  const bgPixel: [number, number, number] = [
    samples.reduce((s, p) => s + p[0], 0) / n,
    samples.reduce((s, p) => s + p[1], 0) / n,
    samples.reduce((s, p) => s + p[2], 0) / n,
  ];

  const [fr, fg, fb, fa] = parseColor(color);
  const flattened = [fr * fa + bgPixel[0] * (1 - fa), fg * fa + bgPixel[1] * (1 - fa), fb * fa + bgPixel[2] * (1 - fa)];
  return { contrastRatio: contrastRatio(flattened, bgPixel), bgPixel };
}

test('bands span the full viewport width without overflow', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const bands = [...document.querySelectorAll('.band')];
    const vw = document.documentElement.clientWidth;
    return {
      count: bands.length,
      fullWidth: bands.every(b => Math.abs(b.getBoundingClientRect().width - vw) < 2),
      tallEnough: bands.every(b => b.getBoundingClientRect().height > window.innerHeight * 0.8),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(r.count).toBe(3);
  expect(r.fullWidth).toBe(true);
  expect(r.tallEnough).toBe(true);
  expect(r.overflow).toBeLessThanOrEqual(1);
});

test('bands carry an image that actually loaded', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.band')?.scrollIntoView());
  await page.waitForTimeout(2000);
  const loaded = await page.evaluate(() => {
    const img = document.querySelector('.band img') as HTMLImageElement;
    return { complete: img?.complete, natural: img?.naturalWidth ?? 0 };
  });
  expect(loaded.complete).toBe(true);
  expect(loaded.natural).toBeGreaterThan(0);
});

test('header inverts to its light-on-dark state when a band fills the viewport', async ({ page }) => {
  // Bands carry data-header-theme="dark" paired with a top scrim
  // (.band-scrim in ImageBand.astro) that guarantees darkness under the
  // header regardless of the photograph — mirroring Hero.astro's own
  // data-header-theme/.hero-overlay pairing. Without the marker, the
  // header's IntersectionObserver never sees the band as a "dark section"
  // and .is-over-dark never activates, leaving near-white header text
  // (--color-text in the default dark theme) over whatever the band
  // happens to render.
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.band')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1000); // theme IntersectionObserver settle
  await expect(page.locator('.header')).toHaveClass(/is-over-dark/);
});

/**
 * Real, measured contrast over a band — not just the is-over-dark class
 * assertion above. That assertion only guards the marker wiring; it would
 * stay green even if .band-scrim's gradient were weakened to the point of
 * illegibility (exactly what shipped initially: a percentage-based
 * gradient that passed on desktop but left the header in the gradient's
 * transparent tail on landscape phones, where the 66vh band is only
 * ~248-259px tall). So this covers the actual matrix that broke that
 * version: portrait *and* landscape, mobile *and* desktop, *both* themes,
 * and every element the header renders over a band — including
 * `.nav-toggle`, which (unlike the four text elements) has no hardcoded
 * white and only got one after this was found to invert with the site
 * theme (near-black bars in light theme).
 *
 * AA for normal text is 4.5:1; the logo and active language button
 * qualify as "large text" (>=24px) and only need 3:1, but this asserts
 * 4.5:1 across the board as a stricter, uniform regression floor — every
 * element here measured well clear of it once the fix was tuned.
 */
const WCAG_AA_NORMAL_TEXT = 4.5;

const viewports = {
  'desktop': { width: 1440, height: 900 },
  'mobile portrait (iPhone 13)': { width: 390, height: 844 },
  'mobile landscape (iPhone SE)': { width: 667, height: 375 },
} as const;

for (const [viewportLabel, viewport] of Object.entries(viewports)) {
  for (const theme of ['dark', 'light'] as const) {
    test(`header elements clear WCAG AA over a band: ${viewportLabel}, ${theme} theme`, async ({ browser }) => {
      const isMobile = viewport.width <= 900;
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);

      await page.goto('/');
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('.band')?.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(1000);

      await expect(page.locator('.header')).toHaveClass(/is-over-dark/);

      // Closed-header elements actually rendered over the band's pixels.
      // On mobile, #nav-links (navlink/lang-switcher) is display:none until
      // the hamburger opens — once open it's an opaque panel with its own
      // background, no longer sitting on the photograph, and already
      // covered by header-contrast.spec.ts's C1 test. So the mobile
      // surface exposed to the band is the logo and the hamburger only.
      const targets: Record<string, (el: Element) => string> = isMobile
        ? {
            '.logo': (el) => getComputedStyle(el).color,
            '.nav-toggle': (el) => getComputedStyle(el.querySelector('span')!).backgroundColor,
          }
        : {
            '.logo': (el) => getComputedStyle(el).color,
            '.navlink:not(.instagram)': (el) => getComputedStyle(el).color,
            '.lang-btn.is-active': (el) => getComputedStyle(el).color,
            '.lang-btn:not(.is-active)': (el) => getComputedStyle(el).color,
          };

      for (const [selector, colorOf] of Object.entries(targets)) {
        const measured = await measureRenderedContrast(page, selector, colorOf);
        expect(measured, `${selector} should be visible over the band`).not.toBeNull();
        expect(
          measured!.contrastRatio,
          `${selector} at ${viewportLabel}/${theme}: bg ${JSON.stringify(measured!.bgPixel)}`
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      }

      await ctx.close();
    });
  }
}

test('bands do not introduce horizontal overflow on mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  const o = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o).toBeLessThanOrEqual(1);
  await ctx.close();
});
