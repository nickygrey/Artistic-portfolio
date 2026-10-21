import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const SLUGS = ['portrait', 'analog'];
const IMAGE = /\.(jpe?g|png|webp)$/i;
const imageCount = (slug: string) => readdirSync(`src/content/galleries/${slug}`).filter((f) => IMAGE.test(f)).length;
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
    expect(imageCount('portrait')).toBeGreaterThanOrEqual(7);
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

describe('gallery markup', () => {
  const html = () => readFileSync('dist/work/portrait/index.html', 'utf8');

  it('shows images only: no captions in the grid', () => {
    expect(html()).not.toContain('<figcaption');
  });

  it('every frame is a link to its single view and carries its aspect ratio', () => {
    const frames = [...html().matchAll(/<li data-frame="(\d+)" data-aspect="([\d.]+)"[^>]*>\s*<a class="gallery__frame" href="\?frame=(\d+)"/g)];
    expect(frames.length).toBe(imageCount('portrait'));
    for (const f of frames) expect(f[1]).toBe(f[3]);
  });

  it('has a back link home, a drag hint hidden from screen readers, and lets the canvas own the wheel', () => {
    expect(html()).toMatch(/<a class="gallery__back" href="\/" aria-label="Back to all work"/);
    expect(html()).toMatch(/<p class="gallery__hint eyebrow" aria-hidden="true"/);
    expect(html()).toMatch(/<main[^>]*data-gallery[^>]*data-lenis-prevent/);
  });
});

describe('single view markup', () => {
  const html = () => readFileSync('dist/work/portrait/index.html', 'utf8');

  it('renders a hidden modal dialog named after the gallery', () => {
    expect(html()).toMatch(/<div[^>]*class="single"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Portraits"[^>]*data-single[^>]*hidden/);
  });

  it('has one stage figure and one rail button per frame, plus a live region', () => {
    expect(html().match(/data-single-frame="\d+"/g)).toHaveLength(imageCount('portrait'));
    expect(html().match(/data-goto="\d+"/g)).toHaveLength(imageCount('portrait'));
    expect(html()).toMatch(/aria-live="polite"[^>]*data-live/);
    expect(html()).toContain('data-position="{n} of {total}"');
  });

  it('offers Single from the grid, and carries no film links', () => {
    expect(html()).toMatch(/<button[^>]*data-open[^>]*>Single<\/button>/);
    expect(html()).not.toMatch(/youtube|Play film/i);
  });
});
