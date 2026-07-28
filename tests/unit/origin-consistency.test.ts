// The site origin is duplicated in four places that nothing enforces:
// astro.config.mjs `site`, src/lib/seo.ts `SITE`, the Astro.site fallback in
// Layout.astro, and public/robots.txt's `Sitemap:` line. If any one of them
// drifts (e.g. `site` moves to `https://www.nickygrey.com`), the sitemap and
// og:image would point at one origin while canonical/hreflang/JSON-LD and
// robots.txt keep pointing at another — a site-wide, contradictory
// canonicalisation that no other test would notice. These tests pin the
// duplicated values to each other so a drift fails loudly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE } from '../../src/lib/seo';

const configSource = () => readFileSync('astro.config.mjs', 'utf8');

describe('origin consistency', () => {
  it('SITE in src/lib/seo.ts matches `site` in astro.config.mjs', () => {
    const match = configSource().match(/site:\s*['"]([^'"]+)['"]/);
    expect(match, 'astro.config.mjs must declare site: "..."').toBeTruthy();
    expect(SITE).toBe(match![1]);
  });

  it('the Astro.site fallback in Layout.astro matches SITE', () => {
    const layout = readFileSync('src/layouts/Layout.astro', 'utf8');
    const match = layout.match(/Astro\.site\?\.toString\(\)\.replace\([^)]*\)\s*\|\|\s*['"]([^'"]+)['"]/);
    expect(match, 'Layout.astro must fall back to an absolute site origin').toBeTruthy();
    expect(SITE).toBe(match![1]);
  });

  it("public/robots.txt's Sitemap: line uses the same origin as SITE", () => {
    const robots = readFileSync('public/robots.txt', 'utf8');
    const match = robots.match(/^Sitemap:\s*(\S+)$/m);
    expect(match, 'robots.txt must declare a Sitemap: line').toBeTruthy();
    expect(match![1].startsWith(SITE)).toBe(true);
  });
});
