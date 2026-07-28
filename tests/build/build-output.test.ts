// tests/build/build-output.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const PAGES = [
  { file: 'dist/index.html',            locale: 'en', canonical: 'https://nickygrey.com/',              home: true },
  { file: 'dist/fr/index.html',         locale: 'fr', canonical: 'https://nickygrey.com/fr/',           home: true },
  { file: 'dist/de/index.html',         locale: 'de', canonical: 'https://nickygrey.com/de/',           home: true },
  { file: 'dist/privacy/index.html',    locale: 'en', canonical: 'https://nickygrey.com/privacy/',      home: false },
  { file: 'dist/fr/privacy/index.html', locale: 'fr', canonical: 'https://nickygrey.com/fr/privacy/',   home: false },
  { file: 'dist/de/privacy/index.html', locale: 'de', canonical: 'https://nickygrey.com/de/privacy/',   home: false },
];

const OG_IMAGE = 'https://nickygrey.com/images/og.jpg';

beforeAll(() => {
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/ missing — run `npm run build` before this suite');
  }
});

const read = (f: string) => readFileSync(f, 'utf8');

// The title-length budget is about what a person sees in a browser tab or a
// search result, not the byte count of escaped markup. Astro escapes text
// content when it serializes to HTML (e.g. `&` -> `&amp;`), so the raw
// <title> match must be decoded back to displayed text before counting.
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** All hreflang alternates on a page, as { hreflang, href } pairs. */
const hreflangLinks = (html: string) =>
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => ({
    hreflang: m[1],
    href: m[2],
  }));

const sitemapLocs = () =>
  [...read('dist/sitemap-0.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe('built pages', () => {
  it.each(PAGES)('$file has the right canonical', ({ file, canonical }) => {
    expect(read(file)).toContain(`<link rel="canonical" href="${canonical}">`);
  });

  it.each(PAGES)('$file has exactly one alternate for each of en/fr/de/x-default', ({ file }) => {
    const links = hreflangLinks(read(file));
    for (const hl of ['en', 'fr', 'de', 'x-default']) {
      expect(links.filter((l) => l.hreflang === hl)).toHaveLength(1);
    }
  });

  // Shape alone (the test above) is not enough: a page can advertise the
  // right set of hreflang *values* while every href is wrong (e.g. built
  // from the locale-prefixed pathname instead of the locale-independent
  // path). Cross-check the values that four independent sources emit for
  // the same page — the canonical link, the OG url, the page's own
  // self-referencing hreflang alternate, and the sitemap's <loc> for this
  // page — and require they all agree. If any one of these is derived from
  // a different, wrong base path, this catches it even though each source
  // individually still "looks like" valid markup.
  it.each(PAGES)('$file: canonical, og:url, self-hreflang and sitemap <loc> all agree', ({ file, locale, canonical }) => {
    const html = read(file);

    const canonicalHref = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    expect(canonicalHref).toBe(canonical);

    const ogUrl = html.match(/<meta property="og:url" content="([^"]+)">/)?.[1];
    expect(ogUrl).toBe(canonical);

    const selfHreflang = hreflangLinks(html).find((l) => l.hreflang === locale);
    expect(selfHreflang?.href).toBe(canonical);

    expect(sitemapLocs()).toContain(canonical);
  });

  it.each(PAGES)('$file declares its own og:locale', ({ file, locale }) => {
    const expected = { en: 'en_US', fr: 'fr_FR', de: 'de_DE' }[locale];
    expect(read(file)).toContain(`content="${expected}"`);
  });

  it.each(PAGES)('$file og:image and twitter:image point at the 1200x630 og.jpg', ({ file }) => {
    const html = read(file);
    expect(html).toContain(`<meta property="og:image" content="${OG_IMAGE}">`);
    expect(html).toContain(`<meta name="twitter:image" content="${OG_IMAGE}">`);
  });

  it.each(PAGES)('$file emits JSON-LD only when it is a homepage', ({ file, home }) => {
    const count = (read(file).match(/application\/ld\+json/g) || []).length;
    expect(count).toBe(home ? 1 : 0);
  });

  it.each(PAGES.filter((p) => p.home))('$file title is 50-60 characters', ({ file }) => {
    const raw = read(file).match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    const title = decodeEntities(raw);
    expect(title).toContain('Vyacheslav Plotnikov');
    expect([...title].length).toBeGreaterThanOrEqual(50);
    expect([...title].length).toBeLessThanOrEqual(60);
  });

  it('homepage JSON-LD parses and makes no address claim', () => {
    const html = read('dist/index.html');
    const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
    const parsed = JSON.parse(raw);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(JSON.stringify(parsed)).not.toContain('address');
  });
});

describe('crawl files', () => {
  it('robots.txt points at the sitemap index', () => {
    expect(read('dist/robots.txt')).toContain('Sitemap: https://nickygrey.com/sitemap-index.xml');
  });

  it('sitemap lists exactly the six pages\' canonical URLs', () => {
    expect(sitemapLocs().sort()).toEqual(PAGES.map((p) => p.canonical).sort());
  });
});
