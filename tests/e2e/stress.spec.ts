import { test, expect, type Page } from '@playwright/test';

/*
 * Worst-case content (break-ui). The canvas reads its frames from the page's
 * <li data-frame> list at mount, so that list is its data boundary: the tests
 * reshape it and re-mount through the real lifecycle events.
 */
async function remountWith(page: Page, count: number) {
  await page.evaluate((n) => {
    document.dispatchEvent(new Event('astro:before-swap'));
    const list = document.querySelector('.gallery__frames')!;
    const originals = [...list.querySelectorAll<HTMLElement>(':scope > li')];
    originals.slice(n).forEach((li) => li.remove());
    for (let i = originals.length; i < n; i++) {
      const li = originals[i % originals.length].cloneNode(true) as HTMLElement;
      li.dataset.frame = String(i + 1);
      li.removeAttribute('data-cover');
      li.querySelectorAll('[data-astro-transition-scope]').forEach((el) => el.removeAttribute('data-astro-transition-scope'));
      list.append(li);
    }
    document.dispatchEvent(new Event('astro:page-load'));
  }, count);
  await page.waitForTimeout(400);
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const offset = (page: Page) => page.evaluate(() => (window as unknown as { __gallery: { offset(): { x: number } } }).__gallery.offset());

async function drag(page: Page, dx: number) {
  await page.mouse.move(900, 450);
  await page.mouse.down();
  await page.mouse.move(900 + dx, 450, { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('a gallery of one photograph still fills, drags and wraps', async ({ page }) => {
  await page.goto('/work/analog/');
  await remountWith(page, 1);
  expect(await page.locator('[data-frame]:not([data-clone])').count()).toBe(1);
  const onScreen = await page.$$eval('[data-frame]', (els) =>
    els.filter((e) => { const r = e.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; }).length
  );
  expect(onScreen).toBeGreaterThanOrEqual(3);
  const before = await offset(page);
  await drag(page, -500);
  await page.waitForTimeout(1200);
  expect(before.x - (await offset(page)).x).toBeGreaterThan(400);
});

test('a gallery of sixty photographs mounts fast and keeps its frame rate', async ({ page }) => {
  await page.goto('/work/portrait/');
  const t0 = Date.now();
  await remountWith(page, 60);
  const mountMs = Date.now() - t0;
  expect(await page.locator('[data-frame]:not([data-clone])').count()).toBe(60);
  expect(await page.locator('[data-clone]').count(), 'sixty photographs need no repeats').toBe(0);
  expect(mountMs).toBeLessThan(1500);
  const fps = await page.evaluate(() => new Promise<number>((resolve) => {
    let n = 0; const start = performance.now();
    const f = () => { n++; performance.now() - start < 1000 ? requestAnimationFrame(f) : resolve(n); };
    requestAnimationFrame(f);
  }));
  expect(fps).toBeGreaterThanOrEqual(50);
});

test('a long German gallery title stays clear of the controls at every width', async ({ browser }) => {
  for (const width of [375, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(width === 375 ? { hasTouch: true, isMobile: true } : {}) });
    const page = await ctx.newPage();
    await page.goto('/de/work/analog/');
    await page.locator('.gallery__title h1').evaluate((h) => (h.textContent = 'Dokumentarfotografie & Reportage'));
    await page.waitForTimeout(300);
    const [title, controls] = await Promise.all([
      page.locator('.gallery__title h1').boundingBox(),
      page.locator('.gallery__controls').boundingBox(),
    ]);
    const overlap = title!.x + title!.width > controls!.x && title!.y + title!.height > controls!.y && title!.y < controls!.y + controls!.height;
    expect(overlap, `${width}px`).toBe(false);
    expect(await noOverflow(page), `${width}px`).toBeLessThanOrEqual(0);
    await ctx.close();
  }
});

test('a long credit line in single view wraps within the photograph', async ({ page }) => {
  await page.goto('/work/portrait/?frame=2');
  await page.waitForTimeout(400);
  const fig = page.locator('[data-single-frame="2"]');
  await fig.evaluate((f) => {
    const cap = document.createElement('figcaption');
    cap.className = 'single__credit eyebrow';
    // As if rendered from credits: carry the component's style scope like server-rendered markup does.
    for (const a of f.getAttributeNames()) if (a.startsWith('data-astro-cid')) cap.setAttribute(a, '');
    cap.textContent = 'Luxembourg City Film Festival Opening Night — Ministère de la Culture — Camera, Lighting, Edit, Colour';
    f.append(cap);
  });
  const [img, cap] = await Promise.all([fig.locator('img').boundingBox(), fig.locator('figcaption').boundingBox()]);
  expect(cap!.width).toBeLessThanOrEqual(img!.width + 1);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('the contact form survives real worst-case input and a failure message', async ({ browser }) => {
  for (const width of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.route('https://formspree.io/f/xwvgojzz', (r) => r.fulfill({ status: 500, body: '{}' }));
    await page.goto('/de/about/');
    await page.locator('input[name="name"]').fill('Aleksandra Wiśniewska-Kowalczyk');
    await page.locator('input[name="email"]').fill('bartholomew.fitzgerald@northwind-industries-holdings.example.com');
    await page.locator('textarea[name="message"]').fill(
      ('Hochzeitsreportage und Porträts in Esch-sur-Alzette, Ende Mai. ' .repeat(30)) +
        'https://www.example.com/a/very/long/reference/link/that/never/breaks/naturally/in/a/textarea/at/all'
    );
    await page.locator('.contact__send').click();
    await expect(page.locator('[data-form-status]')).toContainText('noch einmal');
    expect(await noOverflow(page), `${width}px`).toBeLessThanOrEqual(0);
    const status = await page.locator('[data-form-status]').boundingBox();
    const form = await page.locator('#contact-form').boundingBox();
    expect(status!.x + status!.width).toBeLessThanOrEqual(form!.x + form!.width + 1);
    await ctx.close();
  }
});
