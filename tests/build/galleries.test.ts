import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';

const SLUGS = ['cinematography', 'documentary', 'portrait', 'photography'];
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
    expect(hasImages('photography')).toBe(true);
  });
});
