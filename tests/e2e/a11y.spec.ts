import { test, expect, type Page } from '@playwright/test';

/*
 * WCAG 2.2 AA via axe-core, the engine AccessLint wraps. Injected at test time
 * from cdnjs: never a dependency of the site, never shipped.
 */
const AXE = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

interface Violation {
  id: string;
  impact: string;
  help: string;
  nodes: Array<{ target: string[] }>;
}

async function audit(page: Page): Promise<string[]> {
  await page.addScriptTag({ url: AXE });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(ctx: Document, opts: object): Promise<{ violations: Violation[] }> } }).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations;
  });
  return violations.map((v: Violation) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

const PAGES = ['/', '/work/portrait/', '/work/portrait/?frame=3', '/about/', '/de/privacy/', '/fr/work/analog/'];

for (const [label, options] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['phone', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }],
] as const) {
  test.describe(`WCAG 2.2 AA, ${label}`, () => {
    for (const path of PAGES) {
      test(path, async ({ browser }) => {
        const ctx = await browser.newContext(options);
        const page = await ctx.newPage();
        await page.goto(path);
        await page.waitForTimeout(2600);
        expect(await audit(page)).toEqual([]);
        await ctx.close();
      });
    }
  });
}
