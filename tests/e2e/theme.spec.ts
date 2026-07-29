import { test, expect } from '@playwright/test';

/** WCAG relative luminance and contrast ratio. */
function ratio(a: [number,number,number], b: [number,number,number]) {
  const lum = (c: [number,number,number]) => {
    const [r, g, bl] = c.map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const rgb = (s: string): [number,number,number] => {
  const m = s.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
  return [m[0], m[1], m[2]];
};

test('dark is the default for a visitor who has never chosen', async ({ browser }) => {
  // colorScheme light proves the default ignores the system preference,
  // which is the deliberate behaviour, not an accident.
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('a stored light preference still wins', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('text and accent clear their contrast floors on the dark ground', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  const c = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const read = (v: string) => { probe.style.color = v; return getComputedStyle(probe).color; };
    const out = {
      bg: read(s.getPropertyValue('--color-bg').trim()),
      text: read(s.getPropertyValue('--color-text').trim()),
      accent: read(s.getPropertyValue('--color-accent').trim()),
    };
    probe.remove();
    return out;
  });
  expect(ratio(rgb(c.text), rgb(c.bg))).toBeGreaterThanOrEqual(7);
  expect(ratio(rgb(c.accent), rgb(c.bg))).toBeGreaterThanOrEqual(4.5);
});

test('no photograph is sepia-filtered', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const filtered = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter(i => { const f = getComputedStyle(i).filter; return f && f !== 'none'; })
      .map(i => i.className)
  );
  expect(filtered).toEqual([]);
});

test('a system-preference change for a visitor who has never chosen is not persisted', async ({ browser }) => {
  // A first-time visitor has made no choice. If the OS is set to "Automatic"
  // (common on macOS/Windows/iOS) and it flips appearance while the tab is
  // open, that must not be recorded as a deliberate choice: it must not
  // write to localStorage, or dark would be permanently overridden the next
  // time the OS happens to schedule a light switch.
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(500);

  const stored = await page.evaluate(() => localStorage.getItem('theme'));
  expect(stored).toBeNull();

  await ctx.close();
});
