import { test, expect, type Page } from '@playwright/test';

const FORMSPREE = 'https://formspree.io/f/xwvgojzz';

async function fill(page: Page) {
  await page.locator('input[name="name"]').fill('Ada');
  await page.locator('input[name="email"]').fill('ada@example.com');
  await page.locator('textarea[name="message"]').fill('A portrait session in May.');
}

test('a sent message is confirmed in place and the form clears', async ({ page }) => {
  let body = '';
  await page.route(FORMSPREE, async (route) => {
    body = route.request().postData() ?? '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/about/');
  await fill(page);
  await page.locator('.contact__send').click();
  await expect(page.locator('[data-form-status]')).toContainText('Thank you');
  await expect(page.locator('input[name="name"]')).toHaveValue('');
  await expect(page.locator('.contact__send')).toBeEnabled();
  expect(new URL(page.url()).pathname).toBe('/about/');
  expect(body).toContain('ada@example.com');
});

test('a failed send says so, offers the email address, and keeps what was typed', async ({ page }) => {
  await page.route(FORMSPREE, (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/about/');
  await fill(page);
  await page.locator('.contact__send').click();
  await expect(page.locator('[data-form-status]')).toContainText("couldn't be sent");
  await expect(page.locator('[data-form-status] a[href="mailto:pv@nickygrey.com"]')).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue('Ada');
});

test('an empty form is stopped by the browser and nothing is sent', async ({ page }) => {
  let requests = 0;
  await page.route(FORMSPREE, (route) => {
    requests++;
    return route.fulfill({ status: 200, body: '{}' });
  });
  await page.goto('/about/');
  await page.locator('.contact__send').click();
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
  expect(await page.locator('input[name="name"]').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
});

test('while sending, the button is disabled and says so', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(FORMSPREE, async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/about/');
  await fill(page);
  await page.locator('.contact__send').click();
  await expect(page.locator('.contact__send')).toBeDisabled();
  await expect(page.locator('.contact__send')).toHaveText('Sending…');
  release();
  await expect(page.locator('.contact__send')).toBeEnabled();
  await expect(page.locator('.contact__send')).toHaveText('Send enquiry');
});

test('the discipline links take their gallery colours', async ({ page }) => {
  await page.goto('/about/');
  expect(await page.locator('.intro__link[href="/work/analog/"]').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(232, 165, 122)');
  expect(await page.locator('.intro__link[href="/work/portrait/"]').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(159, 195, 214)');
});

test('the corner brackets draw in and end fully visible', async ({ page }) => {
  await page.goto('/about/');
  await page.waitForTimeout(150);
  const early = await page.$$eval('.frame__corner', (els) => els.map((e) => getComputedStyle(e).transform));
  expect(early.some((t) => t !== 'none'), 'brackets are mid-draw shortly after load').toBe(true);
  await page.waitForTimeout(2200);
  const late = await page.$$eval('.frame__corner', (els) => els.map((e) => [getComputedStyle(e).transform, getComputedStyle(e).opacity]));
  for (const [t, o] of late) {
    expect(t).toBe('none');
    expect(o).toBe('1');
  }
});
