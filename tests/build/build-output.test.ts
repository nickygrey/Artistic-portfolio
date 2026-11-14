// tests/build/build-output.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const LOCALES = [
  { locale: 'en', prefix: '' },
  { locale: 'fr', prefix: '/fr' },
  { locale: 'de', prefix: '/de' },
] as const;
// Derived from the gallery folders, so a discipline that gains its first image is covered automatically.
const ACTIVE = readdirSync('src/content/galleries', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).filter((s) =>
  readdirSync(`src/content/galleries/${s}`).some((f) => /\.(jpe?g|png|webp)$/i.test(f))
);
const PATHS = [
  { path: '/', home: true, gallery: false },
  { path: '/about/', home: false, gallery: false },
  { path: '/privacy/', home: false, gallery: false },
  ...ACTIVE.map((s) => ({ path: `/work/${s}/`, home: false, gallery: true })),
];
const PAGES = LOCALES.flatMap(({ locale, prefix }) =>
  PATHS.map(({ path, home, gallery }) => ({
    file: `dist${prefix}${path}index.html`,
    locale,
    canonical: `https://nickygrey.com${prefix}${path}`,
    home,
    gallery,
  }))
);

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

  it.each(PAGES)('$file og:image and twitter:image are absolute and exist in dist', ({ file, gallery }) => {
    const html = read(file);
    const og = html.match(/<meta property="og:image" content="([^"]+)">/)?.[1] ?? '';
    expect(html).toContain(`<meta name="twitter:image" content="${og}">`);
    if (!gallery) {
      expect(og).toBe(OG_IMAGE);
    } else {
      expect(og.startsWith('https://nickygrey.com/')).toBe(true);
      expect(existsSync(`dist${og.replace('https://nickygrey.com', '')}`)).toBe(true);
    }
  });

  // Home, about and galleries each describe themselves; the privacy policy has nothing to say to a search engine.
  it.each(PAGES)('$file emits one JSON-LD block, except the privacy policy', ({ file }) => {
    const count = (read(file).match(/application\/ld\+json/g) || []).length;
    expect(count).toBe(file.includes('/privacy/') ? 0 : 1);
  });

  it.each(PAGES.filter((p) => !p.file.includes('/privacy/')))('$file JSON-LD parses, names the person and their alias, and claims no address', ({ file }) => {
    const raw = read(file).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
    const parsed = JSON.parse(raw);
    const person = parsed['@graph'].find((n: any) => n['@type'] === 'Person');
    expect(person.name).toBe('Vyacheslav Plotnikov');
    expect(person.alternateName).toBe('Nicky Grey');
    expect(raw).not.toContain('address');
  });

  it.each(PAGES.filter((p) => p.gallery))('$file JSON-LD describes this page in its own locale', ({ file, locale, canonical }) => {
    const raw = read(file).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
    const graph = JSON.parse(raw)['@graph'];
    const page = graph.find((n: any) => n['@type'] === 'CollectionPage');
    expect(page.url).toBe(canonical);
    expect(page.inLanguage).toBe(locale);
    expect(existsSync(`dist${page.primaryImageOfPage.replace('https://nickygrey.com', '')}`)).toBe(true);
    const crumbs = graph.find((n: any) => n['@type'] === 'BreadcrumbList').itemListElement;
    expect(crumbs[crumbs.length - 1].item).toBe(canonical);
  });

  // Search results cut a title near 60 characters and a description near 160.
  it.each(PAGES)('$file title fits a search result and names the person', ({ file }) => {
    const title = decodeEntities(read(file).match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    expect(title).toContain('Vyacheslav Plotnikov');
    expect([...title].length).toBeLessThanOrEqual(60);
  });

  it.each(PAGES.filter((p) => !p.file.includes('/privacy/')))('$file title says where: Luxembourg, or on the about page the person', ({ file, locale }) => {
    const title = decodeEntities(read(file).match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    if (file.includes('/about/')) expect(title).toContain('Nicky Grey');
    else expect(title).toContain(locale === 'de' ? 'Luxemburg' : 'Luxembourg');
  });

  it.each(PAGES)('$file description is 70-160 characters', ({ file }) => {
    const d = decodeEntities(read(file).match(/<meta name="description" content="([^"]*)">/)?.[1] ?? '');
    expect([...d].length).toBeGreaterThanOrEqual(70);
    expect([...d].length).toBeLessThanOrEqual(160);
  });

  it('no two pages share a title or a description', () => {
    for (const re of [/<title>([^<]*)<\/title>/, /<meta name="description" content="([^"]*)">/]) {
      const values = PAGES.map((p) => read(p.file).match(re)?.[1] ?? '');
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it.each(PAGES.filter((p) => p.gallery))('$file says in prose what the gallery is and where', ({ file, locale }) => {
    const intro = read(file).match(/<p class="gallery__intro"[^>]*>([^<]+)<\/p>/)?.[1] ?? '';
    expect(intro).toContain('Vyacheslav Plotnikov');
    expect(intro).toContain(locale === 'de' ? 'Luxemburg' : 'Luxembourg');
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

  it('sitemap lists exactly the built pages\' canonical URLs', () => {
    expect(sitemapLocs().sort()).toEqual(PAGES.map((p) => p.canonical).sort());
  });
});
