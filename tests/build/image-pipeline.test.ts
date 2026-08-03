// tests/build/image-pipeline.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => {
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/ missing — run `npm run build` before this suite');
  }
});

const html = () => readFileSync('dist/index.html', 'utf8');

describe('image pipeline', () => {
  it('serves no page photograph from public/images', () => {
    // og.jpg is referenced only in meta tags, never rendered, so it is exempt.
    // Remote img.youtube.com thumbnails are also out of scope — they are
    // placeholders the owner replaces, and are not served from public/.
    const imgTags = html().match(/<img[^>]*>/g) || [];
    const fromPublic = imgTags.filter(t => /src="\/images\//.test(t));
    expect(fromPublic).toEqual([]);
  });

  it('emits optimised derivatives', () => {
    const assets = readdirSync('dist/assets');
    expect(assets.some(f => f.endsWith('.avif') || f.endsWith('.webp'))).toBe(true);
  });

  it('offers responsive candidates for the hero', () => {
    const hero = (html().match(/<img[^>]*class="[^"]*hero-img[^"]*"[^>]*>/) || [])[0] || '';
    expect(hero).toMatch(/srcset=/);
    expect(hero.match(/\d+w/g)?.length || 0).toBeGreaterThan(1);
  });

  it('keeps every generated image under 400kB', () => {
    const dir = 'dist/assets';
    const heavy = readdirSync(dir)
      .filter(f => /\.(avif|webp|jpg|jpeg|png)$/.test(f))
      .map(f => ({ f, kb: statSync(join(dir, f)).size / 1024 }))
      .filter(x => x.kb > 400);
    expect(heavy).toEqual([]);
  });
});
