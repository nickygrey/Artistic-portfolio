import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

beforeAll(() => {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing — run `npm run build` first');
});

const read = (f: string) => readFileSync(f, 'utf8');
const PAGES = ['dist/index.html', 'dist/fr/index.html', 'dist/de/index.html', 'dist/privacy/index.html'];

describe('layout', () => {
  it.each(PAGES)('%s declares its world and paints it', (file) => {
    const html = read(file);
    const style = html.match(/<html[^>]*data-world="([a-z]+)"[^>]*style="--world-bg: (#[0-9a-f]{6}); --world-accent: (#[0-9a-f]{6});"/);
    expect(style, 'html carries data-world and world colors').not.toBeNull();
    expect(html).toContain(`<meta name="theme-color" content="${style![2]}">`);
  });

  it.each(PAGES)('%s has the header nav and three locale links', (file) => {
    const html = read(file);
    for (const nav of ['home', 'work', 'about', 'contact']) expect(html).toContain(`data-nav="${nav}"`);
    for (const l of ['en', 'fr', 'de']) expect(html).toContain(`data-locale="${l}"`);
  });

  it('locale links point at the same page in each locale', () => {
    const html = read('dist/fr/privacy/index.html');
    expect(html).toMatch(/href="\/privacy\/"[^>]*data-locale="en"/);
    expect(html).toMatch(/href="\/fr\/privacy\/"[^>]*data-locale="fr"/);
    expect(html).toMatch(/href="\/de\/privacy\/"[^>]*data-locale="de"/);
  });

  it.each(PAGES)('%s exposes the motion scale to CSS, zeroed under reduced motion', (file) => {
    const html = read(file);
    expect(html).toMatch(/:root\{--dur-fast: 0\.5s;/);
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\)\{:root\{--dur-fast: 0s; --dur-base: 0s; --dur-slow: 0s;\}\}/);
  });

  it('the header marks the current section', () => {
    const current = (file: string) =>
      [...read(file).matchAll(/<a [^>]*data-nav="(\w+)"[^>]*>/g)].filter((m) => m[0].includes('aria-current="page"')).map((m) => m[1]);
    expect(current('dist/index.html')).toEqual(['work']);
    expect(current('dist/work/portrait/index.html')).toEqual(['work']);
    expect(current('dist/fr/about/index.html')).toEqual(['about']);
    expect(current('dist/privacy/index.html')).toEqual([]);
  });

  it.each(PAGES)('%s opens with a skip link to the main content', (file) => {
    const html = read(file);
    const body = html.slice(html.indexOf('<body'));
    expect(body).toMatch(/^<body[^>]*>\s*<a[^>]*class="skip-link"[^>]*href="#main-content"/);
    expect(html).toContain('id="main-content"');
  });

  it('keeps the name out of machine translation', () => {
    expect(read('dist/de/index.html')).toMatch(/<a[^>]*data-nav="home"[^>]*translate="no"|translate="no"[^>]*data-nav="home"/);
  });

  it('there is no page loader any more', () => {
    for (const f of PAGES) expect(read(f)).not.toContain('page-loader');
  });
});
