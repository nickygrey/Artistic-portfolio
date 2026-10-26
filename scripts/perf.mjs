// Core Web Vitals on a mid-range phone profile, against a production build.
//
//   npm run build && npx astro preview --port 4340 --ignore-lock   (in another terminal)
//   node scripts/perf.mjs [base-url]
//
// Budgets (spec §8): LCP < 2500 ms, CLS < 0.05, INP < 200 ms.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4340';
const BUDGET = { lcp: 2500, cls: 0.05, inp: 200 };

const pages = [
  { path: '/', interact: null },
  // Opening a frame in single view: the heaviest interaction on the site.
  { path: '/work/portrait/', interact: async (page) => page.locator('[data-frame="1"] a').tap() },
  { path: '/about/', interact: async (page) => page.locator('input[name="name"]').tap() },
];

const browser = await chromium.launch();
let failed = false;

for (const { path, interact } of pages) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.addInitScript(() => {
    const w = window;
    w.__vitals = { lcp: 0, cls: 0, inp: 0 };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__vitals.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) w.__vitals.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__vitals.inp = Math.max(w.__vitals.inp, e.duration);
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });

  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  if (interact) {
    await interact(page);
    await page.waitForTimeout(1200);
  }
  const v = await page.evaluate(() => window.__vitals);
  const ok = v.lcp < BUDGET.lcp && v.cls < BUDGET.cls && v.inp < BUDGET.inp;
  failed ||= !ok;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${path.padEnd(18)} LCP ${Math.round(v.lcp)} ms   CLS ${v.cls.toFixed(3)}   INP≈ ${Math.round(v.inp)} ms`
  );
  await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
