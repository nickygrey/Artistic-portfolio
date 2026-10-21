import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), ext) : ext.test(e.name) ? [join(dir, e.name)] : []
  );

beforeAll(() => {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing — run `npm run build` first');
});

describe('fonts', () => {
  it('nothing in dist loads Google Fonts', () => {
    const offenders = files('dist', /\.(html|css|js)$/).filter((f) =>
      /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('every @font-face url in the built CSS exists in dist', () => {
    const urls = files('dist', /\.css$/).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/url\((\/fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1])
    );
    expect(urls.length).toBeGreaterThanOrEqual(6);
    for (const u of urls) expect(existsSync(join('dist', u)), u).toBe(true);
  });

  it('every page preloads the two body-critical fonts', () => {
    for (const page of files('dist', /index\.html$/)) {
      const html = readFileSync(page, 'utf8');
      expect(html, page).toMatch(/<link rel="preload" href="\/fonts\/satoshi-400\.woff2" as="font" type="font\/woff2" crossorigin/);
      expect(html, page).toMatch(/<link rel="preload" href="\/fonts\/cormorant-garamond-400-latin\.woff2" as="font" type="font\/woff2" crossorigin/);
    }
  });

  it('ships the font licenses', () => {
    expect(existsSync('dist/fonts/Satoshi-FFL.txt')).toBe(true);
    expect(existsSync('dist/fonts/CormorantGaramond-OFL.txt')).toBe(true);
  });
});
