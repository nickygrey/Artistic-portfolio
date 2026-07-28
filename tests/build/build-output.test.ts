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

beforeAll(() => {
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/ missing — run `npm run build` before this suite');
  }
});

const read = (f: string) => readFileSync(f, 'utf8');

describe('built pages', () => {
  it.each(PAGES)('$file has the right canonical', ({ file, canonical }) => {
    expect(read(file)).toContain(`<link rel="canonical" href="${canonical}">`);
  });

  it.each(PAGES)('$file has four hreflang alternates', ({ file }) => {
    const html = read(file);
    for (const hl of ['en', 'fr', 'de', 'x-default']) {
      expect(html).toContain(`hreflang="${hl}"`);
    }
  });

  it.each(PAGES)('$file declares its own og:locale', ({ file, locale }) => {
    const expected = { en: 'en_US', fr: 'fr_FR', de: 'de_DE' }[locale];
    expect(read(file)).toContain(`content="${expected}"`);
  });

  it.each(PAGES)('$file emits JSON-LD only when it is a homepage', ({ file, home }) => {
    const count = (read(file).match(/application\/ld\+json/g) || []).length;
    expect(count).toBe(home ? 1 : 0);
  });

  it.each(PAGES.filter((p) => p.home))('$file title is 50-60 characters', ({ file }) => {
    const title = read(file).match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
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

  it('sitemap lists all six pages', () => {
    const xml = read('dist/sitemap-0.xml');
    expect((xml.match(/<loc>/g) || []).length).toBe(6);
  });
});
