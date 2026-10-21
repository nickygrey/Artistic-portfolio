import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const SLUGS = ['portrait', 'analog'];
const IMAGE = /\.(jpe?g|png|webp)$/i;
const hasImages = (slug: string) =>
  readdirSync(`src/content/galleries/${slug}`).some((f) => IMAGE.test(f));

beforeAll(() => {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing — run `npm run build` first');
});

describe('gallery content', () => {
  it('every discipline has a folder and a credits file', () => {
    for (const s of SLUGS) {
      expect(existsSync(`src/content/galleries/${s}`), s).toBe(true);
      expect(existsSync(`src/content/galleries/${s}.yaml`), s).toBe(true);
    }
  });

  it('starting content is in place', () => {
    expect(readdirSync('src/content/galleries/portrait').filter((f) => IMAGE.test(f))).toHaveLength(7);
    expect(readdirSync('src/content/galleries/analog').filter((f) => IMAGE.test(f))).toHaveLength(6);
  });
});

describe('gallery routes', () => {
  it('an active discipline has a page in every locale and a strip on every home page', () => {
    for (const s of SLUGS.filter(hasImages)) {
      for (const prefix of ['', '/fr', '/de']) {
        expect(existsSync(`dist${prefix}/work/${s}/index.html`), `${prefix}/work/${s}`).toBe(true);
        expect(readFileSync(`dist${prefix}/index.html`, 'utf8')).toContain(`data-discipline="${s}"`);
      }
    }
  });

  it('an empty discipline has no page and no strip', () => {
    for (const s of SLUGS.filter((s) => !hasImages(s))) {
      expect(existsSync(`dist/work/${s}`), s).toBe(false);
      expect(readFileSync('dist/index.html', 'utf8')).not.toContain(`data-discipline="${s}"`);
    }
  });

  it('a gallery page paints its own world', () => {
    expect(readFileSync('dist/work/portrait/index.html', 'utf8')).toMatch(
      /<html[^>]*data-world="portrait"[^>]*--world-bg: #2b1512; --world-accent: #9fc3d6;/
    );
  });
});
