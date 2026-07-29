# Image-Led Cinematic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-page portfolio into an image-led cinematic experience — an optimised image pipeline, full-bleed photographic bands, a near-black ground, and WebGL shaders on the hero and Selected Work.

**Architecture:** Images move from `public/` to `src/assets/` and render through Astro's `<Image>`, which generates AVIF/WebP at multiple widths. A new `ImageBand` component places full-viewport photographs between sections. A single fixed full-viewport WebGL canvas (OGL) renders shader surfaces positioned to match the live transformed rects of specific `<img>` elements, driven by the existing `gsap.ticker`, and tears itself down entirely when unsupported.

**Tech Stack:** Astro 5 (static, i18n en/fr/de), Astro `<Image>` + sharp, OGL, GSAP + ScrollTrigger + Lenis (already present), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-29-image-led-cinematic-design.md`

## Global Constraints

- Repo is `astro-portfolio/`. The outer `design_handoff_portfolio/src/` tree is a **stale duplicate** — never edit it.
- Branch is `feat/webgl-cinematic`. **Never commit to `main`** — `main` deploys live to nickygrey.com on push.
- **One page.** No per-project pages, no CMS, no new routes.
- **An element's resting DOM state must be its fully-revealed state.** `<img>` elements stay in the DOM, in normal layout, fully visible. WebGL renders *over* them and never replaces them.
- **Never a second RAF loop.** Frames come from `gsap.ticker` only; any ticker callback must be a named function so it can be passed to `gsap.ticker.remove()`.
- Anything a handler creates that is not ScrollTrigger-attached — contexts, listeners, ticker callbacks, timers, DOM nodes — must be undone in its teardown.
- Touch is `(hover: none) and (pointer: coarse)`, matching `isTouch()` in `src/motion/engine.ts`. No second definition.
- WebGL must not initialise when context creation fails, when `prefers-reduced-motion: reduce` is set, or when measured frame rate falls below **50fps** over the first second.
- Ground must satisfy: body text at `--color-text` clears **7:1** contrast; gold accent clears **4.5:1**.
- No page-visible photograph may be served from `public/images/` after Task 1. Largest single image transferred on initial load must be under **400 kB**.
- Existing suites stay green: 56 unit (`npm test`), 42 build-output (`npm run test:build`, needs a prior build), 21 Playwright (`npm run test:e2e`).
- `npm run build` must pass reporting `6 page(s) built`.
- Line numbers are indicative, not authoritative. Locate by `grep -n`; content wins.

---

### Task 1: Image pipeline

`public/images/` holds **11 MB** of unoptimised files — `slava new-6 (1).jpg` at 6.7 MB and `hero.jpg` at 1.6 MB. Astro does nothing to files in `public/`. Adding full-bleed photography on top of this would produce a page of tens of megabytes.

**Files:**
- Create: `src/assets/` (move images here from `public/images/`)
- Create: `src/lib/photos.ts`
- Modify: `src/components/Hero.astro`, `src/components/About.astro`, `src/components/PhotoCarousel.astro`, `src/components/SelectedWork.astro`, `src/components/Partners.astro`
- Test: `tests/build/image-pipeline.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `src/lib/photos.ts` exporting `photos: ImageMetadata[]`, consumed by `PhotoCarousel.astro`

- [ ] **Step 1: Move the images**

```bash
mkdir -p src/assets/photos src/assets/partners
git mv public/images/hero.jpg src/assets/hero.jpg
git mv "public/images/slava new-6 (1).jpg" src/assets/portrait.jpg
git mv public/images/photos/*.jpg src/assets/photos/
git mv public/images/partners/*.png src/assets/partners/
```

Leave `public/images/og.jpg` where it is — the OpenGraph image must be a stable, absolute, unhashed URL, and Astro would fingerprint it. Leave `public/favicon.*` and `public/CNAME` alone.

`Screenshot 2026-07-19 at 12.25.53.png` is a Selected Work thumbnail and is replaced in Task 5; leave it in `public/` for now so nothing breaks in between.

- [ ] **Step 2: Build the photo list**

`PhotoCarousel.astro` currently builds paths at runtime with `` src={`${base}images/photos/${num}.jpg`} ``. `<Image>` cannot consume a runtime string — it needs `ImageMetadata` from an import. Use `import.meta.glob` with `eager: true`:

```ts
// src/lib/photos.ts

/**
 * Every photograph in src/assets/photos, sorted numerically by filename.
 * `import.meta.glob` with eager:true gives Astro the static references it
 * needs to optimise each file — a runtime template string cannot.
 * Adding a photograph means dropping a file in the directory; nothing else.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/*.{jpg,jpeg,png}',
  { eager: true }
);

export const photos: ImageMetadata[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, mod]) => mod.default);
```

- [ ] **Step 3: Convert the components**

In each component, import the asset and render through `<Image>`. The hero, as the largest and only above-the-fold photograph:

```astro
---
import { Image } from 'astro:assets';
import heroImage from '../assets/hero.jpg';
---
<Image
  src={heroImage}
  alt=""
  class="hero-img"
  widths={[900, 1440, 1920, 2560]}
  sizes="100vw"
  formats={['avif', 'webp']}
  quality={82}
  loading="eager"
  fetchpriority="high"
/>
```

For `PhotoCarousel.astro`, import `photos` from `../lib/photos` and map over it. Keep `data-original-count={photos.length}` — the endless-marquee cloning depends on it.

For `About.astro` use `portrait.jpg`; for `Partners.astro` the two logos. Keep every existing class name so the CSS and the motion attributes keep matching.

**Preserve `loading="lazy"` on everything below the fold**, and keep `decoding="async"`.

- [ ] **Step 4: Write the build-output test**

```ts
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
```

- [ ] **Step 5: Build and verify the weight actually dropped**

Run: `npm run build && npm run test:build`
Expected: all pass, `6 page(s) built`.

Then report the real numbers:

```bash
echo "before: 11M (public/images)"
du -sh dist/assets | cut -f1 | xargs echo "after (all generated assets):"
ls -S dist/assets | head -5
```

If the largest generated image still exceeds 400 kB, lower `quality` to 75 and rebuild. Report the actual figures rather than asserting success.

- [ ] **Step 6: Full suite and commit**

Run: `npm test && npm run test:e2e`
Expected: 56 unit, 21 Playwright.

```bash
git add src/ public/ tests/ && git commit -m "feat: move images to the Astro asset pipeline"
```

---

### Task 2: Near-black ground

**Files:**
- Modify: `src/styles/global.css` (the `[data-theme="dark"]` block, and `.plate`)
- Modify: `src/layouts/Layout.astro` (theme resolution)
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: dark as the default theme

- [ ] **Step 1: Deepen the dark palette**

In `src/styles/global.css`, the `[data-theme="dark"]` block currently opens with `--color-bg: #141210`. Change to a warm near-black and lift the surface slightly so it still separates:

```css
--color-bg: #0b0a09;
--color-surface: #161412;
```

Leave `--color-text: #e8e6e3` and `--color-accent: #d4a24a` unchanged — Step 4 verifies they clear the contrast floors against the new ground.

- [ ] **Step 2: Make dark the default**

In `src/layouts/Layout.astro`, the inline theme script currently reads:

```js
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = stored || (prefersDark ? 'dark' : 'light');
```

Replace those two lines with:

```js
// Dark is the design target for this site, so it is the default for anyone
// who has not chosen. A stored choice always wins, including "light".
const theme = stored || 'dark';
```

Remove the now-unused `prefersDark` binding. The toggle itself is untouched.

- [ ] **Step 3: Remove the sepia filter**

In `global.css`, the `.plate` rule contains
`filter: sepia(0.22) saturate(0.82) contrast(1.05);`. Delete that line. Keep the border and outline — on the new dark ground `--color-surface` is `#161412`, so they read as dark-on-dark rather than as a bright frame.

- [ ] **Step 4: Write the contrast and default-theme test**

```ts
// tests/e2e/theme.spec.ts
import { test, expect } from '@playwright/test';

/** WCAG relative luminance and contrast ratio. */
function ratio(a: [number,number,number], b: [number,number,number]) {
  const lum = (c: [number,number,number]) => {
    const [r, g, bl] = c.map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const rgb = (s: string): [number,number,number] => {
  const m = s.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
  return [m[0], m[1], m[2]];
};

test('dark is the default for a visitor who has never chosen', async ({ browser }) => {
  // colorScheme light proves the default ignores the system preference,
  // which is the deliberate behaviour, not an accident.
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('a stored light preference still wins', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem('theme', 'light'));
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(800);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('text and accent clear their contrast floors on the dark ground', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  const c = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const probe = document.createElement('div');
    document.body.appendChild(probe);
    const read = (v: string) => { probe.style.color = v; return getComputedStyle(probe).color; };
    const out = {
      bg: read(s.getPropertyValue('--color-bg').trim()),
      text: read(s.getPropertyValue('--color-text').trim()),
      accent: read(s.getPropertyValue('--color-accent').trim()),
    };
    probe.remove();
    return out;
  });
  expect(ratio(rgb(c.text), rgb(c.bg))).toBeGreaterThanOrEqual(7);
  expect(ratio(rgb(c.accent), rgb(c.bg))).toBeGreaterThanOrEqual(4.5);
});

test('no photograph is sepia-filtered', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const filtered = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter(i => { const f = getComputedStyle(i).filter; return f && f !== 'none'; })
      .map(i => i.className)
  );
  expect(filtered).toEqual([]);
});
```

- [ ] **Step 5: Run, look, commit**

Run: `npm run test:e2e`
Expected: all pass, 21 existing plus your 4.

Then load the site and actually look at it on the new ground — report whether the photographs read as glowing or as muddy. If body copy feels heavy at 7:1, that is a signal the ground is too black for a page with this much prose; say so rather than adjusting the floor.

```bash
git add src/styles/global.css src/layouts/Layout.astro tests/e2e/theme.spec.ts
git commit -m "feat: near-black ground, dark by default, no sepia"
```

---

### Task 3: Full-bleed image bands

**Files:**
- Create: `src/components/ImageBand.astro`
- Modify: `src/pages/index.astro`, `src/pages/fr/index.astro`, `src/pages/de/index.astro`
- Test: `tests/e2e/bands.spec.ts`

**Interfaces:**
- Consumes: `<Image>` from `astro:assets`
- Produces: `<ImageBand src={ImageMetadata} alt={string} />`

- [ ] **Step 1: Build the component**

```astro
---
// src/components/ImageBand.astro
import { Image } from 'astro:assets';

interface Props {
  src: ImageMetadata;
  /** Empty string marks the band decorative; screen readers skip it. */
  alt: string;
}
const { src, alt } = Astro.props;
---

<div class="band" role={alt === '' ? 'presentation' : undefined}>
  <Image
    src={src}
    alt={alt}
    widths={[900, 1440, 1920, 2560, 3000]}
    sizes="100vw"
    formats={['avif', 'webp']}
    quality={80}
    loading="lazy"
    decoding="async"
  />
</div>

<style>
  .band {
    position: relative;
    width: 100%;
    margin-inline: calc(50% - 50vw);
    max-width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  .band img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* A full viewport of image is overwhelming on a phone held vertically,
     and eats the scroll budget. Two-thirds keeps the impact, not the fatigue. */
  @media (max-width: 900px) {
    .band { height: 66vh; height: 66dvh; }
  }
</style>
```

The `margin-inline: calc(50% - 50vw)` full-bleed technique is the same one `.photo-carousel` uses — it reaches both viewport edges without ever exceeding them, which is what fixed the horizontal-overflow bug. Do not substitute a negative margin.

- [ ] **Step 2: Place three bands**

In `src/pages/index.astro`, import the component and three images from `src/assets/`, then place bands between sections per the spec:

```astro
import ImageBand from '../components/ImageBand.astro';
import band1 from '../assets/band-1.jpg';
import band2 from '../assets/band-2.jpg';
import band3 from '../assets/band-3.jpg';
```

- after `<DisciplinesStrip />` → `<ImageBand src={band1} alt="" />`
- after `<SelectedWork />` → `<ImageBand src={band2} alt="" />`
- after `<PhotoCarousel />` → `<ImageBand src={band3} alt="" />`

Bands are decorative, so `alt=""` — the photographs carry no information a screen-reader user needs that the surrounding sections do not already provide.

**The real band images have not been supplied yet.** Use three existing photographs from `src/assets/photos/` as stand-ins, copied to `band-1.jpg`, `band-2.jpg`, `band-3.jpg` so the filenames are stable and swapping in real files later is a one-file-at-a-time operation with no code change. Note in your report which stand-ins you used.

Mirror the same placement in `fr/index.astro` and `de/index.astro`.

- [ ] **Step 3: Write the test**

```ts
// tests/e2e/bands.spec.ts
import { test, expect, devices } from '@playwright/test';

test('bands span the full viewport width without overflow', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const bands = [...document.querySelectorAll('.band')];
    const vw = document.documentElement.clientWidth;
    return {
      count: bands.length,
      fullWidth: bands.every(b => Math.abs(b.getBoundingClientRect().width - vw) < 2),
      tallEnough: bands.every(b => b.getBoundingClientRect().height > window.innerHeight * 0.8),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(r.count).toBe(3);
  expect(r.fullWidth).toBe(true);
  expect(r.tallEnough).toBe(true);
  expect(r.overflow).toBeLessThanOrEqual(1);
});

test('bands carry an image that actually loaded', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.band')?.scrollIntoView());
  await page.waitForTimeout(2000);
  const loaded = await page.evaluate(() => {
    const img = document.querySelector('.band img') as HTMLImageElement;
    return { complete: img?.complete, natural: img?.naturalWidth ?? 0 };
  });
  expect(loaded.complete).toBe(true);
  expect(loaded.natural).toBeGreaterThan(0);
});

test('bands do not introduce horizontal overflow on mobile', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  const o = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o).toBeLessThanOrEqual(1);
  await ctx.close();
});
```

- [ ] **Step 4: Run and commit**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`
Expected: all green; report the new page height and the total transferred bytes on initial load.

```bash
git add src/components/ImageBand.astro src/pages/ src/assets/ tests/e2e/bands.spec.ts
git commit -m "feat: full-bleed photographic bands"
```

---

### Task 4: Enlarge the photo strip

The strip is currently `height: clamp(200px, 28vw, 340px)` — a decorative ribbon rather than a presentation of work.

**Files:**
- Modify: `src/styles/global.css` (`.carousel-slide`)
- Test: `tests/e2e/mobile.spec.ts` (existing landscape assertions must still hold)

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Increase the height**

In `global.css`, `.carousel-slide` has `height: clamp(200px, 28vw, 340px)`. Change to:

```css
height: clamp(260px, 38vw, 520px);
```

- [ ] **Step 2: Re-check the landscape invariant — this is the risk**

The endless marquee requires one loop period to fit inside the scrollable range, and `ensureScrollableRange()` clones copies until it does. Taller slides mean **wider** slides (they scale by aspect ratio), which lengthens the period and can push it past the range again — the exact defect that caused the landscape freeze-and-jump.

There is also a pre-existing `@media (max-width: 900px) and (orientation: landscape) { .carousel-slide { height: 35vh } }` rule; check whether it needs to move in step.

Run the existing landscape tests, then measure directly at 844×390 and 390×844: report `period`, `maxScroll`, and the clone count. The cloning should absorb the change automatically — but verify it, do not assume.

- [ ] **Step 3: Run and commit**

Run: `npm run test:e2e`
Expected: all pass, including the landscape and soft-navigation tests.

```bash
git add src/styles/global.css && git commit -m "feat: enlarge the photo strip"
```

---

### Task 5: WebGL foundation

The infrastructure only. No visible effect yet — this task's deliverable is a canvas that provably positions itself over an image and provably refuses to run when it should not.

**Files:**
- Create: `src/webgl/renderer.ts`, `src/webgl/surface.ts`, `src/webgl/index.ts`
- Modify: `package.json`, `src/layouts/Layout.astro`
- Test: `tests/e2e/webgl.spec.ts`

**Interfaces:**
- Consumes: `gsap` from the existing motion system
- Produces:
  - `initWebGL(): void` — idempotent; safe on every `astro:page-load`
  - `registerSurface(el: HTMLImageElement, shader: ShaderSpec): void`
  - `teardownWebGL(): void`
  - `interface ShaderSpec { fragment: string; uniforms?: Record<string, unknown> }`
  - `window.__webgl` debug handle exposing `{ active(): boolean; surfaces(): number }`

- [ ] **Step 1: Install OGL**

```bash
npm install ogl@^1.0.11
```

33 kB gzip. `three` was measured at 178 kB for a use case with no scene graph, lighting or 3D camera.

- [ ] **Step 2: Implement the renderer**

One fixed full-viewport canvas behind the content, with a mesh per registered image positioned from that image's **live** rect.

```ts
// src/webgl/renderer.ts
import { Renderer, Camera, Transform } from 'ogl';
import gsap from 'gsap';

let renderer: Renderer | null = null;
let scene: Transform | null = null;
let camera: Camera | null = null;
let canvas: HTMLCanvasElement | null = null;
export interface SurfaceHandle {
  update: () => void;
  destroy: () => void;
  /** Live mesh/element geometry, for registration assertions in tests. */
  debug: () => {
    el: string;
    rect: DOMRect;
    mesh: { x: number; y: number; sx: number; sy: number };
    visible: boolean;
  };
}

const surfaces: SurfaceHandle[] = [];

/** Frames sampled before judging whether this device can hold the effects. */
const FPS_SAMPLE_FRAMES = 60;
const FPS_FLOOR = 50;

export function supported(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

// Named so gsap.ticker.remove() can take it back.
function tick() {
  if (!renderer || !scene || !camera) return;
  for (const s of surfaces) s.update();
  renderer.render({ scene, camera });
}

let frames = 0;
let started = 0;
function fpsGuard() {
  if (frames === 0) started = performance.now();
  frames++;
  if (frames < FPS_SAMPLE_FRAMES) return;
  const fps = (frames * 1000) / (performance.now() - started);
  gsap.ticker.remove(fpsGuard);
  if (fps < FPS_FLOOR) {
    // Too slow to be worth it. The DOM images were never hidden, so the page
    // simply reverts to its unenhanced, entirely functional state.
    teardownWebGL();
  }
}

export function initWebGL(): void {
  teardownWebGL();
  if (!supported()) return;

  renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio, 2) });
  canvas = renderer.gl.canvas as HTMLCanvasElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '1',
  });
  document.body.appendChild(canvas);

  camera = new Camera(renderer.gl, { fov: 45 });
  camera.position.z = 5;
  scene = new Transform();

  resize();
  window.addEventListener('resize', resize, { passive: true });

  gsap.ticker.add(tick);
  frames = 0;
  gsap.ticker.add(fpsGuard);
}

function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.perspective({ aspect: window.innerWidth / window.innerHeight });
}

export function teardownWebGL(): void {
  gsap.ticker.remove(tick);
  gsap.ticker.remove(fpsGuard);
  window.removeEventListener('resize', resize);
  while (surfaces.length) surfaces.pop()?.destroy();
  const gl = renderer?.gl;
  canvas?.remove();
  // Release the GPU context explicitly; browsers cap concurrent contexts and
  // a leaked one across navigations will eventually refuse to create another.
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  renderer = null; scene = null; camera = null; canvas = null;
}

export function getScene() { return { renderer, scene, camera, surfaces }; }

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__webgl = {
    active: () => !!renderer,
    surfaces: () => surfaces.length,
    // Registration is the likeliest place for a subtle bug, and it only shows
    // mid-scroll. Exposing live geometry is what lets a test catch drift.
    debug: () => surfaces.map(s => s.debug()),
  };
}
```

- [ ] **Step 3: Implement the surface**

The critical piece. Both shader targets sit under elements GSAP transforms continuously — `.project-scale` carries a scrubbed scale, `.hero-img` a composed zoom/parallax timeline. A mesh positioned from static layout geometry will drift out of registration mid-scroll.

`getBoundingClientRect()` reflects live transforms, so re-reading it per frame is correct. Read it in the same `gsap.ticker` pass that already drives Lenis — never from a separate RAF loop.

```ts
// src/webgl/surface.ts
import { Program, Mesh, Plane, Texture } from 'ogl';
import { getScene } from './renderer';

export interface ShaderSpec {
  fragment: string;
  uniforms?: Record<string, unknown>;
}

const VERTEX = `
attribute vec2 uv;
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export function registerSurface(el: HTMLImageElement, shader: ShaderSpec): void {
  const { renderer, scene, camera, surfaces } = getScene();
  if (!renderer || !scene || !camera) return;
  const gl = renderer.gl;

  const texture = new Texture(gl);
  const load = () => { texture.image = el; };
  if (el.complete && el.naturalWidth > 0) load();
  else el.addEventListener('load', load, { once: true });

  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: shader.fragment,
    uniforms: {
      tMap: { value: texture },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uVelocity: { value: 0 },
      ...(shader.uniforms ?? {}),
    },
    transparent: true,
  });

  const mesh = new Mesh(gl, { geometry: new Plane(gl, { widthSegments: 32, heightSegments: 32 }), program });
  mesh.setParent(scene);

  /**
   * Match the mesh to the element's LIVE rect, which includes any GSAP
   * transform applied this frame. Converting CSS pixels to world units at the
   * camera's z keeps the mesh exactly over the element at any viewport size.
   */
  function update() {
    const r = el.getBoundingClientRect();
    const h = 2 * Math.tan((camera!.fov * Math.PI) / 360) * camera!.position.z;
    const w = h * (window.innerWidth / window.innerHeight);
    mesh.scale.x = (r.width / window.innerWidth) * w;
    mesh.scale.y = (r.height / window.innerHeight) * h;
    mesh.position.x = ((r.left + r.width / 2) / window.innerWidth - 0.5) * w;
    mesh.position.y = -((r.top + r.height / 2) / window.innerHeight - 0.5) * h;
    mesh.visible = r.bottom > 0 && r.top < window.innerHeight;
    program.uniforms.uTime.value = performance.now() / 1000;
  }

  surfaces.push({
    update,
    destroy: () => {
      el.removeEventListener('load', load);
      mesh.setParent(null);
      program.remove();
      texture.image = null;
    },
    /** Exposed so a test can assert the mesh actually tracks its element. */
    debug: () => ({
      el: el.className,
      rect: el.getBoundingClientRect(),
      mesh: { x: mesh.position.x, y: mesh.position.y, sx: mesh.scale.x, sy: mesh.scale.y },
      visible: mesh.visible,
    }),
  });
}
```

- [ ] **Step 4: Wire into the layout**

```ts
// src/webgl/index.ts
export { initWebGL, teardownWebGL, supported } from './renderer';
export { registerSurface } from './surface';
export type { ShaderSpec } from './surface';
```

In `Layout.astro`'s script, alongside the existing motion wiring:

```ts
import { initWebGL, teardownWebGL } from '../webgl';

initWebGL();
document.addEventListener('astro:page-load', initWebGL);
document.addEventListener('astro:before-swap', teardownWebGL);
```

- [ ] **Step 5: Write the degradation tests**

```ts
// tests/e2e/webgl.spec.ts
import { test, expect } from '@playwright/test';

declare global { interface Window { __webgl: { active(): boolean; surfaces(): number } } }

test('a canvas is created and does not cover the content', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { pointer: getComputedStyle(c).pointerEvents, hidden: c.getAttribute('aria-hidden') } : null;
  });
  expect(r?.pointer).toBe('none');
  expect(r?.hidden).toBe('true');
});

test('reduced motion creates no context at all', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.active())).toBe(false);
  expect(await page.locator('canvas').count()).toBe(0);
  await ctx.close();
});

test('with WebGL unavailable, every photograph is still visible', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) {
      if (t === 'webgl' || t === 'webgl2') return null;
      // @ts-expect-error passthrough
      return orig.call(this, t, ...a);
    };
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.active())).toBe(false);
  const invisible = await page.evaluate(() =>
    [...document.querySelectorAll('img')].filter(i => {
      const s = getComputedStyle(i); const r = i.getBoundingClientRect();
      return r.width > 0 && (s.visibility === 'hidden' || Number(s.opacity) < 0.01);
    }).length
  );
  expect(invisible).toBe(0);
  await ctx.close();
});

test('the context is released across navigation', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 3; i++) {
    await page.locator('footer a[href="/privacy"]').first().click();
    await page.waitForURL(/privacy/);
    await page.waitForTimeout(600);
    await page.goBack();
    await page.waitForTimeout(1200);
  }
  // Exactly one canvas, not one per navigation.
  expect(await page.locator('canvas').count()).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 6: Run and commit**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`
Expected: all green. Report the new gzip bundle figure against the 60.66 kB baseline.

```bash
git add package.json package-lock.json src/webgl/ src/layouts/Layout.astro tests/e2e/webgl.spec.ts
git commit -m "feat: WebGL foundation with full degradation"
```

---

### Task 6: Hero displacement shader

**Files:**
- Create: `src/webgl/shaders/hero.ts`
- Modify: `src/components/Hero.astro`
- Test: `tests/e2e/webgl.spec.ts`

**Interfaces:**
- Consumes: `registerSurface`, `ShaderSpec` from `../webgl`
- Produces: nothing

- [ ] **Step 1: Write the shader**

Displacement rises with scroll velocity; grain is constant and fine. Both are deliberately subtle — this sits under a headline that must stay readable.

```ts
// src/webgl/shaders/hero.ts
import type { ShaderSpec } from '../surface';

export const heroShader: ShaderSpec = {
  fragment: `
precision highp float;
uniform sampler2D tMap;
uniform float uTime;
uniform float uVelocity;
varying vec2 vUv;

// Cheap hash noise — no texture lookup, no dependency.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  // Horizontal smear that grows with scroll speed, strongest mid-frame.
  float wave = sin(uv.y * 8.0 + uTime * 0.4) * 0.5 + 0.5;
  uv.x += wave * uVelocity * 0.012;

  vec3 col = texture2D(tMap, uv).rgb;

  // Fine grain, animated so it reads as film rather than as a static overlay.
  float g = hash(uv * 900.0 + fract(uTime) * 100.0);
  col += (g - 0.5) * 0.045;

  gl_FragColor = vec4(col, 1.0);
}`,
};
```

- [ ] **Step 2: Register it**

In `Hero.astro`'s existing script, alongside the `registerMotion('hero', …)` handler:

```ts
import { registerSurface, supported } from '../webgl';
import { heroShader } from '../webgl/shaders/hero';

if (supported()) {
  const img = document.querySelector('.hero-img') as HTMLImageElement | null;
  if (img) registerSurface(img, heroShader);
}
```

Feed `uVelocity` from the ScrollTrigger the motion engine already runs, normalised and smoothed — a raw velocity value produces a jarring smear. Clamp the normalised value to `[0, 1]`.

**Do not hide the `<img>`.** The canvas draws over it. If WebGL never initialises the photograph is simply there, which is the whole degradation contract.

- [ ] **Step 3: Add the registration test**

```ts
test('the hero surface registers and tracks its image while scrolling', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__webgl.surfaces())).toBeGreaterThan(0);

  // Registration must hold MID-scroll, not only at rest — the hero image is
  // continuously transformed by GSAP, and drift only appears in motion.
  // Compare the mesh's world position against the position the element's LIVE
  // rect implies, using the same projection maths the surface uses. Asserting
  // the canvas is viewport-sized would prove nothing about the mesh.
  const drift = await page.evaluate(async () => {
    window.scrollTo(0, 320);
    await new Promise(r => setTimeout(r, 500));

    const s = window.__webgl.debug().find(d => d.el.includes('hero-img'));
    if (!s) return null;

    const fov = 45, camZ = 5;
    const h = 2 * Math.tan((fov * Math.PI) / 360) * camZ;
    const w = h * (window.innerWidth / window.innerHeight);
    const expectX = ((s.rect.left + s.rect.width / 2) / window.innerWidth - 0.5) * w;
    const expectY = -((s.rect.top + s.rect.height / 2) / window.innerHeight - 0.5) * h;

    return {
      dx: Math.abs(s.mesh.x - expectX),
      dy: Math.abs(s.mesh.y - expectY),
      scrolled: window.scrollY,
    };
  });

  expect(drift).not.toBeNull();
  expect(drift!.scrolled).toBeGreaterThan(0);   // we really are mid-scroll
  expect(drift!.dx).toBeLessThan(0.02);          // world units, ~1px at this fov
  expect(drift!.dy).toBeLessThan(0.02);
});
```

- [ ] **Step 4: Look at it, then commit**

Run the suite, then load the page and scroll. Report what the effect actually looks like: whether the smear reads as cinematic or as a glitch, and whether the headline stays readable over it. If it reads as a glitch, reduce the `0.012` multiplier and say what you settled on.

```bash
git add src/webgl/shaders/hero.ts src/components/Hero.astro tests/e2e/webgl.spec.ts
git commit -m "feat: hero displacement and grain shader"
```

---

### Task 7: Selected Work hover and dissolve

**Files:**
- Create: `src/webgl/shaders/work.ts`
- Modify: `src/components/SelectedWork.astro`
- Test: `tests/e2e/webgl.spec.ts`

**Interfaces:**
- Consumes: `registerSurface`, `ShaderSpec` from `../webgl`
- Produces: nothing

- [ ] **Step 1: Write the shader**

```ts
// src/webgl/shaders/work.ts
import type { ShaderSpec } from '../surface';

export const workShader: ShaderSpec = {
  fragment: `
precision highp float;
uniform sampler2D tMap;
uniform float uTime;
uniform float uHover;      // 0 at rest, 1 fully hovered
uniform vec2  uMouse;      // cursor in element UV space
varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  // Ripple radiating from the cursor, amplitude driven by hover.
  float d = distance(uv, uMouse);
  float ripple = sin(d * 22.0 - uTime * 3.0) * 0.006 * uHover;
  uv += normalize(uv - uMouse + 0.0001) * ripple;

  gl_FragColor = vec4(texture2D(tMap, uv).rgb, 1.0);
}`,
  uniforms: { uMouse: { value: [0.5, 0.5] } },
};
```

- [ ] **Step 2: Register per card and drive the uniforms**

In `SelectedWork.astro`, register each `.project-scale img`. On `pointerenter`/`pointerleave`, tween `uHover` between 0 and 1 with GSAP rather than setting it directly — a step change looks mechanical. On `pointermove`, update `uMouse` from the cursor's position within the element's rect.

Use **`pointer` events, not `mouse`**, and skip registration entirely when `(hover: none) and (pointer: coarse)` matches — a ripple that follows a finger it cannot see is meaningless, and the GPU cost on touch is unjustified.

Remove every listener in the surface's `destroy`.

- [ ] **Step 3: The dissolve**

On click, run a GSAP timeline that raises a `uDissolve` uniform from 0 to 1 over ~0.7s while the full view opens, rather than cutting. Add `uniform float uDissolve;` to the shader and mix toward the target state by it.

**The existing `.card-link` click behaviour must survive.** Those links open YouTube; the dissolve is a visual accompaniment, not a replacement. Do not `preventDefault()` on a plain click, and do not intercept modifier-clicks or non-primary buttons — that regression has already been fixed once in this codebase and must not return.

- [ ] **Step 4: Test hover and the click contract**

```ts
test('hovering a work card changes the shader state', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.querySelector('#work')?.scrollIntoView());
  await page.waitForTimeout(1800);
  const before = await page.evaluate(() => window.__webgl.surfaces());
  expect(before).toBeGreaterThan(1);
  await page.locator('#work .card-link').first().hover();
  await page.waitForTimeout(500);
  // The card is still a link and still points where it did.
  const href = await page.locator('#work .card-link').first().getAttribute('href');
  expect(href).toContain('youtube.com');
});

test('modifier-click on a work card is not intercepted', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => document.querySelector('#work')?.scrollIntoView());
  await page.waitForTimeout(1800);
  const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await page.locator('#work .card-link').first().click({ modifiers: ['Meta'] });
  expect(await popup).not.toBeNull();
});
```

- [ ] **Step 5: Iterate on the dissolve, then commit**

This is the effect the spec identifies as make-or-break. Run it against the real photographs, not a flat colour. Report what it looks like and what you changed to get there.

```bash
git add src/webgl/shaders/work.ts src/components/SelectedWork.astro tests/e2e/webgl.spec.ts
git commit -m "feat: work card hover ripple and dissolve"
```

---

## Verification Summary

```bash
npm test           # 56 unit — no build needed
npm run build      # 6 page(s) built
npm run test:build # 42 + image-pipeline assertions — requires the build
npm run test:e2e   # 21 existing + theme, bands, webgl
```

Manual checks automation cannot settle: whether the ground makes photographs glow or look muddy, whether the hero smear reads as cinematic or as a glitch, and whether the dissolve is better than a cut.

## Owner Actions (not blocking)

The build uses stand-ins where real assets are missing. Swapping them is a file replacement with no code change:

- `src/assets/band-1.jpg`, `band-2.jpg`, `band-3.jpg` — landscape, 3000px wide
- `src/assets/photos/*.jpg` — 12–20, any orientation, 2000px long edge
- Four chosen 16:9 film frames replacing the YouTube auto-grabs and `Screenshot 2026-07-19 at 12.25.53.png` in `SelectedWork.astro`

## Known Follow-Ups (out of scope)

- The French and German pages serve English meta descriptions.
- Two carried mobile minors: a mid-gesture clone-trim jump, and a broken image permanently disabling the landscape clone check.
- The Google Drive "Full archive" link reads as unfinished on a professional portfolio.
