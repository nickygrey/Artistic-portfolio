import { test, expect, type Page } from '@playwright/test';

/** Every CSP violation the page reports, from the very first script onwards. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __csp: string[] }).__csp = []);
    document.addEventListener('securitypolicyviolation', (e) => seen.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await watchViolations(page);
});

test('every feature runs under the policy with no violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2600);
  await page.locator('a[data-discipline="portrait"]').hover();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __webgl: { active(): boolean } }).__webgl.active()), 'WebGL runs').toBe(true);

  await page.locator('a[data-discipline="portrait"]').click();
  await page.waitForURL(/\/work\/portrait\/$/);
  await expect(page.locator('main.gallery')).toHaveClass(/is-canvas/);
  await page.mouse.move(900, 450);
  await page.mouse.down();
  await page.mouse.move(500, 450, { steps: 8 });
  await page.mouse.up();
  await page.locator('.gallery__controls [data-open]').click();
  await expect(page.locator('[data-single]')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');

  await page.locator('header a[data-locale="fr"]').click();
  await page.waitForURL(/\/fr\/work\/portrait\/$/);
  await page.locator('header a[data-nav="contact"]').click();
  await page.waitForURL((u) => u.pathname === '/fr/about/');

  await page.route('https://formspree.io/f/xwvgojzz', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.locator('input[name="name"]').fill('Ada');
  await page.locator('input[name="email"]').fill('ada@example.com');
  await page.locator('textarea[name="message"]').fill('Bonjour');
  await page.locator('.contact__send').click();
  await expect(page.locator('[data-form-status]')).toContainText('Merci');

  expect(await violations(page)).toEqual([]);
});

test('the policy is really enforced: an injected script is refused', async ({ page }) => {
  await page.goto('/about/');
  const ran = await page.evaluate(async () => {
    (window as unknown as { __pwned?: boolean }).__pwned = false;
    const s = document.createElement('script');
    s.textContent = 'window.__pwned = true';
    document.head.append(s);
    const img = new Image();
    img.src = 'https://example.com/beacon.gif';
    await new Promise((r) => setTimeout(r, 300));
    return (window as unknown as { __pwned: boolean }).__pwned;
  });
  expect(ran).toBe(false);
  const v = await violations(page);
  expect(v.some((x) => x.startsWith('script-src'))).toBe(true);
  expect(v.some((x) => x.startsWith('img-src') && x.includes('example.com'))).toBe(true);
});
