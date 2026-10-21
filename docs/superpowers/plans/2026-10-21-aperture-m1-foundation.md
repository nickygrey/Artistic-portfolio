# Aperture Redesign — Milestone 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long single page with the new page structure (home, four discipline galleries, about, privacy, in en/fr/de), on the new tokens, self-hosted fonts and color-world mechanism, with gallery content coming from folders. Visual polish comes in later milestones.

**Architecture:**
- Pure modules (`src/lib/disciplines.ts`, `src/lib/gallery.ts`) are unit-tested in Node.
- A thin Astro-only adapter (`src/lib/gallery-data.ts`) joins the image folders, found with `import.meta.glob`, to the YAML credits in an Astro content collection.
- Page markup lives in `src/views/*.astro`. Each locale's page file is a three-line wrapper around its view.

**Tech Stack:** Astro 5.7 (static), plain CSS, Vitest 2, Playwright, ffmpeg and yt-dlp (local tools only).

**Spec:** `docs/superpowers/specs/2026-10-21-aperture-redesign-design.md`

## Global Constraints

- No new npm dependencies.
- Plain CSS only, with no Tailwind and no CSS Modules. Global tokens go in `src/styles/global.css`; component rules go in scoped `<style>` blocks.
- Discipline slugs are English in every locale: `cinematography`, `documentary`, `portrait`, `photography`.
- Routes: `/`, `/work/<slug>/`, `/about/`, `/privacy/`, each also under `/fr/` and `/de/`. Trailing slash in every generated link.
- Neutral world: bg `#1c191b`, accent `#efeae2`.
- Discipline colors:

  | Discipline | bg | accent |
  | --- | --- | --- |
  | cinematography | `#22142a` | `#cfe07a` |
  | documentary | `#0f2a2e` | `#e8a57a` |
  | portrait | `#2b1512` | `#9fc3d6` |
  | photography | `#14251a` | `#c7b2e0` |

- Fonts are self-hosted from `public/fonts/`: Cormorant Garamond 400/500 and Satoshi 400/500. No request to `fonts.googleapis.com` or `fonts.gstatic.com` may remain.
- The site stores nothing in the browser: no `localStorage` and no `sessionStorage` anywhere in `src/`.
- Gallery images go through `astro:assets` with `widths={[480, 960, 1600, 2400]}`, `format="webp"` and `quality={72}`. If any generated file exceeds 400 kB, the existing image-pipeline test will fail; drop `2400` from the widths list in that case.
- Credit role keys are a closed list: `camera`, `lighting`, `edit`, `colour`, `direction`, `interview`, `photography`.
- Never remove either `initMotion()` call in `Layout.astro`. Both the synchronous call and the `astro:page-load` listener are load-bearing (see CLAUDE.md).
- **Suites:** `npm test` (unit) must pass after every task. `npm run build && npm run test:build` must pass after every task from Task 3 on. `npm run test:e2e` is expected to be red from Task 4 until Task 7, which restores it.
- **Commits** end with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

### Task 1: Discipline registry and translation parity

**Files:**
- Create: `src/lib/disciplines.ts`
- Modify: `src/i18n/translations.ts` (add 4 keys × 3 locales)
- Test: `tests/unit/disciplines.test.ts`, `tests/unit/translations.test.ts`

**Interfaces:**
- Produces:
  - `type DisciplineSlug`
  - `type World = 'neutral' | DisciplineSlug`
  - `interface WorldColors { bg: string; accent: string }`
  - `interface Discipline extends WorldColors { slug; nameKey: TranslationKey; years: string }`
  - `NEUTRAL: WorldColors`
  - `DISCIPLINES: readonly Discipline[]`
  - `getDiscipline(slug: string): Discipline | undefined`
  - `worldColors(world: World): WorldColors`
  - Translation keys `discipline.cinematography`, `discipline.documentary`, `discipline.portrait` and `discipline.photography`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/translations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { translations } from '../../src/i18n/translations';

describe('translations', () => {
  it('fr and de define exactly the keys en defines', () => {
    const en = Object.keys(translations.en).sort();
    expect(Object.keys(translations.fr).sort()).toEqual(en);
    expect(Object.keys(translations.de).sort()).toEqual(en);
  });

  it('no locale has an empty string', () => {
    for (const lang of ['en', 'fr', 'de'] as const) {
      const empty = Object.entries(translations[lang]).filter(([, v]) => !String(v).trim());
      expect(empty, lang).toEqual([]);
    }
  });
});
```

`tests/unit/disciplines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DISCIPLINES, NEUTRAL, getDiscipline, worldColors } from '../../src/lib/disciplines';
import { translations } from '../../src/i18n/translations';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('disciplines', () => {
  it('lists the four disciplines in home-page order', () => {
    expect(DISCIPLINES.map((d) => d.slug)).toEqual([
      'cinematography',
      'documentary',
      'portrait',
      'photography',
    ]);
  });

  it.each([...DISCIPLINES, { slug: 'neutral', ...NEUTRAL }])(
    '$slug accent on bg clears WCAG AAA (7:1)',
    ({ bg, accent }) => {
      expect(contrast(bg, accent)).toBeGreaterThanOrEqual(7);
    }
  );

  it.each(DISCIPLINES)('$slug has a display name in every locale', ({ nameKey }) => {
    for (const lang of ['en', 'fr', 'de'] as const) {
      expect((translations[lang] as Record<string, string>)[nameKey]).toBeTruthy();
    }
  });

  it('getDiscipline finds by slug and rejects anything else', () => {
    expect(getDiscipline('portrait')?.accent).toBe('#9fc3d6');
    expect(getDiscipline('Portrait')).toBeUndefined();
    expect(getDiscipline('neutral')).toBeUndefined();
  });

  it('worldColors maps neutral and every discipline', () => {
    expect(worldColors('neutral')).toEqual(NEUTRAL);
    for (const d of DISCIPLINES) {
      expect(worldColors(d.slug)).toEqual({ bg: d.bg, accent: d.accent });
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/disciplines.test.ts tests/unit/translations.test.ts`

Expected: `translations.test.ts` PASSES (parity already holds). `disciplines.test.ts` FAILS with "Failed to resolve import ../../src/lib/disciplines".

- [ ] **Step 3: Create `src/lib/disciplines.ts`**

```ts
import type { TranslationKey } from '../i18n/translations';

export type DisciplineSlug = 'cinematography' | 'documentary' | 'portrait' | 'photography';
export type World = 'neutral' | DisciplineSlug;

export interface WorldColors {
  bg: string;
  accent: string;
}

export interface Discipline extends WorldColors {
  slug: DisciplineSlug;
  nameKey: TranslationKey;
  /** Placeholder until the owner confirms (spec §10, item 3). */
  years: string;
}

export const NEUTRAL: WorldColors = { bg: '#1c191b', accent: '#efeae2' };

export const DISCIPLINES: readonly Discipline[] = [
  { slug: 'cinematography', nameKey: 'discipline.cinematography', bg: '#22142a', accent: '#cfe07a', years: '2019 — 2026' },
  { slug: 'documentary',    nameKey: 'discipline.documentary',    bg: '#0f2a2e', accent: '#e8a57a', years: '2023 — 2026' },
  { slug: 'portrait',       nameKey: 'discipline.portrait',       bg: '#2b1512', accent: '#9fc3d6', years: '2021 — 2026' },
  { slug: 'photography',    nameKey: 'discipline.photography',    bg: '#14251a', accent: '#c7b2e0', years: '2018 — 2026' },
];

export function getDiscipline(slug: string): Discipline | undefined {
  return DISCIPLINES.find((d) => d.slug === slug);
}

export function worldColors(world: World): WorldColors {
  if (world === 'neutral') return NEUTRAL;
  const { bg, accent } = getDiscipline(world)!;
  return { bg, accent };
}
```

- [ ] **Step 4: Add the display-name keys**

In `src/i18n/translations.ts`, add these after the `// Navigation` group of each locale:

```ts
    // Disciplines
    'discipline.cinematography': 'Cinematography',
    'discipline.documentary': 'Documentary',
    'discipline.portrait': 'Portrait',
    'discipline.photography': 'Photography',
```

fr:

```ts
    'discipline.cinematography': 'Cinématographie',
    'discipline.documentary': 'Documentaire',
    'discipline.portrait': 'Portrait',
    'discipline.photography': 'Photographie',
```

de:

```ts
    'discipline.cinematography': 'Bildgestaltung',
    'discipline.documentary': 'Dokumentarfilm',
    'discipline.portrait': 'Porträt',
    'discipline.photography': 'Fotografie',
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test`

Expected: all unit tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/disciplines.ts src/i18n/translations.ts tests/unit/disciplines.test.ts tests/unit/translations.test.ts
git commit -m "feat(m1): discipline registry with color worlds and AAA contrast test"
```

---

### Task 2: Gallery frame builder (pure)

**Files:**
- Create: `src/lib/gallery.ts`
- Test: `tests/unit/gallery.test.ts`

**Interfaces:**
- Produces:
  - `ROLE_KEYS` (readonly tuple)
  - `type RoleKey`
  - `interface CreditEntry { file: string; title?: string; client?: string; roles?: RoleKey[]; film?: string; alt?: string; cover?: boolean }`
  - `interface ImageEntry<I> { file: string; image: I }`
  - `interface Credit { title?: string; client?: string; roles: RoleKey[]; film?: string; alt?: string }`
  - `interface Frame<I> { index: number; file: string; image: I; cover: boolean; credit?: Credit }`. `index` is 1-based.
  - `isGalleryImage(file: string): boolean`
  - `buildFrames<I>(slug: string, images: ImageEntry<I>[], credits?: CreditEntry[]): Frame<I>[]`
  - `coverOf<I>(frames: Frame<I>[]): Frame<I> | undefined`

- [ ] **Step 1: Write the failing test**

`tests/unit/gallery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFrames, coverOf, isGalleryImage } from '../../src/lib/gallery';

const img = (file: string) => ({ file, image: `IMG:${file}` });

describe('isGalleryImage', () => {
  it('accepts jpg, jpeg, png and webp in any case', () => {
    for (const f of ['a.jpg', 'a.JPG', 'a.jpeg', 'a.png', 'a.WEBP']) expect(isGalleryImage(f)).toBe(true);
  });

  it('rejects everything else', () => {
    for (const f of ['.gitkeep', 'notes.txt', 'clip.mov', 'jpg']) expect(isGalleryImage(f)).toBe(false);
  });
});

describe('buildFrames', () => {
  it('returns no frames for an empty folder', () => {
    expect(buildFrames('portrait', [])).toEqual([]);
  });

  it('orders by filename, numerically, and indexes from 1', () => {
    const frames = buildFrames('portrait', [img('10.jpg'), img('2.jpg'), img('1.jpg')]);
    expect(frames.map((f) => [f.index, f.file])).toEqual([[1, '1.jpg'], [2, '2.jpg'], [3, '10.jpg']]);
  });

  it('skips files that are not images', () => {
    expect(buildFrames('portrait', [img('.gitkeep'), img('a.jpg')]).map((f) => f.file)).toEqual(['a.jpg']);
  });

  it('without credits, the first frame is the cover and no frame has a credit', () => {
    const frames = buildFrames('portrait', [img('b.jpg'), img('a.jpg')]);
    expect(frames.map((f) => f.cover)).toEqual([true, false]);
    expect(frames.every((f) => f.credit === undefined)).toBe(true);
  });

  it('attaches a partial credit and defaults roles to []', () => {
    const [frame] = buildFrames('documentary', [img('a.jpg')], [{ file: 'a.jpg', film: 'https://youtu.be/x' }]);
    expect(frame.credit).toEqual({ roles: [], film: 'https://youtu.be/x' });
  });

  it('a cover-only entry moves the cover without creating a credit', () => {
    const frames = buildFrames('portrait', [img('a.jpg'), img('b.jpg')], [{ file: 'b.jpg', cover: true }]);
    expect(frames.map((f) => f.cover)).toEqual([false, true]);
    expect(frames[1].credit).toBeUndefined();
    expect(coverOf(frames)?.file).toBe('b.jpg');
  });

  it('rejects credits for an image that is not in the folder, naming it', () => {
    expect(() => buildFrames('portrait', [img('a.jpg')], [{ file: 'typo.jpg', title: 'X' }])).toThrow(
      /portrait.*typo\.jpg/
    );
  });

  it('rejects the same file listed twice', () => {
    expect(() =>
      buildFrames('portrait', [img('a.jpg')], [{ file: 'a.jpg' }, { file: 'a.jpg' }])
    ).toThrow(/a\.jpg.*twice/);
  });

  it('rejects more than one cover', () => {
    expect(() =>
      buildFrames('portrait', [img('a.jpg'), img('b.jpg')], [
        { file: 'a.jpg', cover: true },
        { file: 'b.jpg', cover: true },
      ])
    ).toThrow(/at most one/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/gallery.test.ts`

Expected: FAIL with "Failed to resolve import ../../src/lib/gallery".

- [ ] **Step 3: Implement `src/lib/gallery.ts`**

```ts
export const ROLE_KEYS = ['camera', 'lighting', 'edit', 'colour', 'direction', 'interview', 'photography'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

export interface CreditEntry {
  file: string;
  title?: string;
  client?: string;
  roles?: RoleKey[];
  film?: string;
  alt?: string;
  cover?: boolean;
}

export interface ImageEntry<I> {
  file: string;
  image: I;
}

export interface Credit {
  title?: string;
  client?: string;
  roles: RoleKey[];
  film?: string;
  alt?: string;
}

export interface Frame<I> {
  /** 1-based display position; also the value of `?frame=` in single view. */
  index: number;
  file: string;
  image: I;
  cover: boolean;
  credit?: Credit;
}

export function isGalleryImage(file: string): boolean {
  const dot = file.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.includes(file.slice(dot + 1).toLowerCase());
}

export function buildFrames<I>(slug: string, images: ImageEntry<I>[], credits: CreditEntry[] = []): Frame<I>[] {
  const sorted = images
    .filter((i) => isGalleryImage(i.file))
    .sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true, sensitivity: 'base' }));
  const known = new Set(sorted.map((i) => i.file));

  const byFile = new Map<string, CreditEntry>();
  for (const c of credits) {
    if (!known.has(c.file)) {
      throw new Error(
        `Gallery "${slug}": ${slug}.yaml has credits for "${c.file}", but src/content/galleries/${slug}/ has no image with that name.`
      );
    }
    if (byFile.has(c.file)) {
      throw new Error(`Gallery "${slug}": ${slug}.yaml lists "${c.file}" twice.`);
    }
    byFile.set(c.file, c);
  }

  const covers = credits.filter((c) => c.cover);
  if (covers.length > 1) {
    throw new Error(
      `Gallery "${slug}": ${slug}.yaml marks ${covers.length} images as cover (${covers.map((c) => c.file).join(', ')}); mark at most one.`
    );
  }
  const coverFile = covers[0]?.file ?? sorted[0]?.file;

  return sorted.map((img, i) => {
    const entry = byFile.get(img.file);
    const credit = entry && toCredit(entry);
    return {
      index: i + 1,
      file: img.file,
      image: img.image,
      cover: img.file === coverFile,
      ...(credit ? { credit } : {}),
    };
  });
}

function toCredit({ title, client, roles, film, alt }: CreditEntry): Credit | undefined {
  if (!title && !client && !roles?.length && !film && !alt) return undefined;
  const credit: Credit = { roles: roles ?? [] };
  if (title) credit.title = title;
  if (client) credit.client = client;
  if (film) credit.film = film;
  if (alt) credit.alt = alt;
  return credit;
}

export function coverOf<I>(frames: Frame<I>[]): Frame<I> | undefined {
  return frames.find((f) => f.cover);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gallery.ts tests/unit/gallery.test.ts
git commit -m "feat(m1): pure gallery frame builder with credits and cover rules"
```

---

### Task 3: Content folders, credits collection, and starting content

**Files:**
- Create: `src/content.config.ts`, `src/lib/gallery-data.ts`
- Create: `src/content/galleries/{cinematography,documentary,portrait,photography}/` (each with `.gitkeep`)
- Create: `src/content/galleries/{cinematography,documentary,portrait,photography}.yaml`
- Copy (originals deleted in Task 7): `src/assets/photos/1.jpg … 7.jpg` → `src/content/galleries/portrait/01.jpg … 07.jpg`
- Copy (original deleted in Task 7): `src/assets/hero.jpg` → `src/content/galleries/photography/01.jpg`
- Test: `tests/build/galleries.test.ts`

**Interfaces:**
- Consumes: `buildFrames`, `Frame`, `ROLE_KEYS` (Task 2); `DISCIPLINES`, `Discipline`, `DisciplineSlug` (Task 1).
- Produces (Astro-only, from `src/lib/gallery-data.ts`):
  - `getGallery(slug: DisciplineSlug): Promise<Frame<ImageMetadata>[]>`
  - `getActiveDisciplines(): Promise<Array<{ discipline: Discipline; frames: Frame<ImageMetadata>[] }>>`
  - `galleryPaths(): Promise<Array<{ params: { discipline: DisciplineSlug } }>>`

  The old components still import `src/assets/photos/*` and `src/assets/hero.jpg`, so Step 3 *copies* them. Task 7 deletes the originals together with those components.

- [ ] **Step 1: Write the failing build test**

`tests/build/galleries.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run build && npx vitest run tests/build/galleries.test.ts`

Expected: FAIL on "every discipline has a folder".

- [ ] **Step 3: Create the folders and copy the starting images**

```bash
for s in cinematography documentary portrait photography; do
  mkdir -p src/content/galleries/$s && touch src/content/galleries/$s/.gitkeep
done
for i in 1 2 3 4 5 6 7; do cp src/assets/photos/$i.jpg src/content/galleries/portrait/0$i.jpg; done
cp src/assets/hero.jpg src/content/galleries/photography/01.jpg
```

- [ ] **Step 4: Write the credits files**

`src/content/galleries/portrait.yaml`:

```yaml
# Credits for src/content/galleries/portrait/. Every field is optional.
# file: image filename · title · client · roles: [camera, lighting, edit, colour, direction, interview, photography]
# film: link that becomes "Play film ↗" · alt: describes the image · cover: true picks the home-page strip image
frames:
  - file: 01.jpg
    alt: Woman in a black dress and sunglasses reclining on a curved concrete sculpture
  - file: 02.jpg
    alt: Woman in a blue dress standing at the water's edge on a beach
  - file: 03.jpg
    alt: Woman in a white halter dress leaning on a railing in front of green foliage
  - file: 04.jpg
    alt: Couple smiling together under hanging wisteria
  - file: 05.jpg
    alt: Woman with her eyes closed, face in soft sunlight
  - file: 06.jpg
    alt: Woman with curly hair holding white and pink tulips, seated on a wooden chair
  - file: 07.jpg
    alt: Woman in a white corset dress smiling in front of tall dark wooden doors
```

`src/content/galleries/photography.yaml`:

```yaml
# Credits for src/content/galleries/photography/. See portrait.yaml for the fields.
frames:
  - file: 01.jpg
    alt: A dark stream seen from above, with a white bird standing in the shallows
```

`src/content/galleries/cinematography.yaml` and `src/content/galleries/documentary.yaml`:

```yaml
# Credits for this discipline's folder. See portrait.yaml for the fields.
frames: []
```

- [ ] **Step 5: Create `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { ROLE_KEYS } from './lib/gallery';

const credits = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/galleries' }),
  schema: z.object({
    frames: z
      .array(
        z.object({
          file: z.string(),
          title: z.string().optional(),
          client: z.string().optional(),
          roles: z.array(z.enum(ROLE_KEYS)).optional(),
          film: z.string().url().optional(),
          alt: z.string().optional(),
          cover: z.boolean().optional(),
        })
      )
      .default([]),
  }),
});

export const collections = { credits };
```

- [ ] **Step 6: Create `src/lib/gallery-data.ts`**

```ts
import { getEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { buildFrames, type Frame, type ImageEntry } from './gallery';
import { DISCIPLINES, type Discipline, type DisciplineSlug } from './disciplines';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/galleries/*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);

function imagesFor(slug: DisciplineSlug): ImageEntry<ImageMetadata>[] {
  return Object.entries(modules)
    .filter(([path]) => path.split('/').at(-2) === slug)
    .map(([path, mod]) => ({ file: path.split('/').at(-1)!, image: mod.default }));
}

export async function getGallery(slug: DisciplineSlug): Promise<Frame<ImageMetadata>[]> {
  const entry = await getEntry('credits', slug);
  return buildFrames(slug, imagesFor(slug), entry?.data.frames);
}

export async function getActiveDisciplines(): Promise<
  Array<{ discipline: Discipline; frames: Frame<ImageMetadata>[] }>
> {
  const all = await Promise.all(
    DISCIPLINES.map(async (discipline) => ({ discipline, frames: await getGallery(discipline.slug) }))
  );
  return all.filter((d) => d.frames.length > 0);
}

export async function galleryPaths(): Promise<Array<{ params: { discipline: DisciplineSlug } }>> {
  return (await getActiveDisciplines()).map(({ discipline }) => ({ params: { discipline: discipline.slug } }));
}
```

- [ ] **Step 7: Prove the schema rejects an unknown role**

Temporarily change the first portrait entry in `portrait.yaml` to add `roles: [grip]`, then run `npx astro sync`.

Expected: it fails with an error naming `portrait.yaml` and listing the allowed role values. Revert the line, then run `npx astro sync` again. Expected: it succeeds.

- [ ] **Step 8: Run the suites**

Run: `npm test && npm run build && npm run test:build`

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/content.config.ts src/lib/gallery-data.ts src/content/galleries tests/build/galleries.test.ts
git commit -m "feat(m1): gallery folders, credits collection, starting content"
```

---

### Task 4: Self-hosted fonts and the new global stylesheet

**Files:**
- Create: `public/fonts/` with `satoshi-400.woff2`, `satoshi-500.woff2`, `cormorant-garamond-{400,500}-{latin,latin-ext}.woff2`, `Satoshi-FFL.txt`, `CormorantGaramond-OFL.txt`
- Rewrite: `src/styles/global.css`
- Modify: `src/layouts/Layout.astro` (the font lines in `<head>` only)
- Test: `tests/build/fonts.test.ts`

**Interfaces:**
- Produces CSS custom properties that every later task uses:
  - `--world-bg` and `--world-accent` (defaults to neutral; Layout overrides them per page in Task 5)
  - `--ink`, `--line` and `--control-line`
  - `--font-display` and `--font-sans`
  - `--step-title`, `--step-name`, `--step-label`, `--step-body`, `--size-nav`, `--size-eyebrow` and `--gutter`
- Produces the global classes `.display`, `.eyebrow` and `.visually-hidden`.

The old long-page components will look unstyled after this task. That's expected; Task 7 deletes them.

- [ ] **Step 1: Write the failing build test**

`tests/build/fonts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run build && npx vitest run tests/build/fonts.test.ts`

Expected: FAIL. "nothing in dist loads Google Fonts" lists the HTML pages.

- [ ] **Step 3: Download the fonts**

The tmp work happens in a fresh, empty directory.

```bash
T=$(mktemp -d) && mkdir -p public/fonts
curl -sL -o "$T/satoshi.zip" https://api.fontshare.com/v2/fonts/download/satoshi
unzip -q "$T/satoshi.zip" -d "$T/satoshi"
cp "$T"/satoshi/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Regular.woff2 public/fonts/satoshi-400.woff2
cp "$T"/satoshi/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Medium.woff2  public/fonts/satoshi-500.woff2
cp "$T"/satoshi/Satoshi_Complete/License/FFL.txt public/fonts/Satoshi-FFL.txt
for w in 400 500; do for s in latin latin-ext; do
  curl -sfL -o public/fonts/cormorant-garamond-$w-$s.woff2 \
    "https://cdn.jsdelivr.net/fontsource/fonts/cormorant-garamond@latest/$s-$w-normal.woff2"
done; done
curl -sfL -o public/fonts/CormorantGaramond-OFL.txt https://cdn.jsdelivr.net/npm/@fontsource/cormorant-garamond/LICENSE
ls -la public/fonts
```

Expected: 6 `.woff2` files, each 10 to 60 kB, and 2 license files.

- [ ] **Step 4: Rewrite `src/styles/global.css`**

Replace the whole file with:

```css
/* Fonts — self-hosted (no third-party requests; see privacy page). */
@font-face { font-family: "Satoshi"; src: url(/fonts/satoshi-400.woff2) format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "Satoshi"; src: url(/fonts/satoshi-500.woff2) format("woff2"); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: "Cormorant Garamond"; src: url(/fonts/cormorant-garamond-400-latin.woff2) format("woff2"); font-weight: 400; font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Cormorant Garamond"; src: url(/fonts/cormorant-garamond-400-latin-ext.woff2) format("woff2"); font-weight: 400; font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Cormorant Garamond"; src: url(/fonts/cormorant-garamond-500-latin.woff2) format("woff2"); font-weight: 500; font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Cormorant Garamond"; src: url(/fonts/cormorant-garamond-500-latin-ext.woff2) format("woff2"); font-weight: 500; font-display: swap;
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }

/* Metric-matched fallbacks: text keeps its size and line positions while the web fonts load. */
@font-face { font-family: "Satoshi Fallback"; src: local("Arial"); size-adjust: 96.4556%; ascent-override: 104.7113%; descent-override: 24.8819%; line-gap-override: 10.3675%; }
@font-face { font-family: "Cormorant Fallback"; src: local("Georgia"); size-adjust: 88.3803%; ascent-override: 104.5482%; descent-override: 32.4733%; line-gap-override: 0%; }

:root {
  /* Layout.astro overrides both per page from src/lib/disciplines.ts — the only source of world colors. */
  --world-bg: #1c191b;
  --world-accent: #efeae2;
  --ink: #efeae2;
  --line: color-mix(in srgb, var(--ink) 13%, transparent);
  --control-line: color-mix(in srgb, var(--world-accent) 35%, transparent);

  --font-display: "Cormorant Garamond", "Cormorant Fallback", Georgia, serif;
  --font-sans: "Satoshi", "Satoshi Fallback", system-ui, sans-serif;

  --step-title: clamp(2.75rem, 2.2rem + 2.4vw, 4.5rem);   /* 44 → 72px */
  --step-name: clamp(2.5rem, 2rem + 2.1vw, 4rem);         /* 40 → 64px */
  --step-label: clamp(1.125rem, 1.05rem + 0.35vw, 1.375rem);
  --step-body: clamp(0.9375rem, 0.9rem + 0.2vw, 1.0625rem);
  --size-nav: 0.8125rem;
  --size-eyebrow: 0.625rem;
  --gutter: clamp(16px, 2.2vw, 32px);
}

*, *::before, *::after { box-sizing: border-box; }

html {
  -webkit-text-size-adjust: 100%;
  background: var(--world-bg);
  color: var(--world-accent);
  color-scheme: dark;
}

body {
  margin: 0;
  min-height: 100svh;
  font-family: var(--font-sans);
  font-size: var(--step-body);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

img { display: block; max-width: 100%; height: auto; }
a { color: inherit; }
a, button, input, textarea, select { -webkit-tap-highlight-color: transparent; }

.display { font-family: var(--font-display); font-weight: 400; letter-spacing: -0.01em; line-height: 1; }
.eyebrow { font-weight: 500; font-size: var(--size-eyebrow); letter-spacing: 0.22em; text-transform: uppercase; }

:focus-visible { outline: 1px solid var(--world-accent); outline-offset: 3px; }

.visually-hidden {
  position: absolute !important; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
/* Lenis is never constructed on touch devices (src/motion/engine.ts); native smooth scroll covers in-page anchors there. */
@media (hover: none) and (pointer: coarse) and (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
```

- [ ] **Step 5: Replace the font lines in `src/layouts/Layout.astro`**

Delete the "Preconnect to external domains" block. That's the two `fonts.*` preconnects; the YouTube `dns-prefetch` lines go too. Also delete the "Preload critical fonts" block, which holds the Lora preload and the Google Fonts stylesheet. Put this in their place:

```astro
  <link rel="preload" href="/fonts/satoshi-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/cormorant-garamond-400-latin.woff2" as="font" type="font/woff2" crossorigin>
```

- [ ] **Step 6: Run the suites**

Run: `npm test && npm run build && npm run test:build`

Expected: all PASS. If `image-pipeline`'s hero test fails, that's unexpected at this point; stop and investigate, because no hero markup changed.

- [ ] **Step 7: Commit**

```bash
git add public/fonts src/styles/global.css src/layouts/Layout.astro tests/build/fonts.test.ts
git commit -m "feat(m1): self-hosted Cormorant and Satoshi, new global tokens, no Google Fonts"
```

---

### Task 5: Layout with color worlds, new Header and Footer, no browser storage

**Files:**
- Rewrite: `src/layouts/Layout.astro`, `src/components/Header.astro`, `src/components/Footer.astro`
- Modify: `src/i18n/translations.ts` (add keys)
- Test: `tests/build/layout.test.ts`, `tests/unit/no-browser-storage.test.ts`

**Interfaces:**
- Consumes: `worldColors`, `World` (Task 1); `stripLocale`, `localizedPath`, `canonicalUrl`, `hreflangAlternates`, `ogLocale`, `siteJsonLd`, `LOCALES` (existing `src/lib/seo.ts`).
- Produces:
  - `<Layout title: string; description?: string; lang?: Lang; world?: World; ogImage?: string>`. `ogImage` is an absolute URL. `description` defaults to `t(lang, 'meta.home.description')`.
  - `<Header lang>` and `<Footer lang>`.
  - Stable test hooks:
    - nav links carry `data-nav="home|work|about|contact"`, and the footer link carries `data-nav="privacy"`;
    - locale links carry `data-locale="en|fr|de"`;
    - `<html>` carries `data-world` and the inline style `--world-bg: …; --world-accent: …;`.
  - Translation keys: `header.eyebrow`, `nav.contact`, `nav.label`, `nav.language`, `meta.home.description`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/no-browser-storage.test.ts`:

```ts
import { it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );

// The privacy page promises the site stores nothing in the browser.
it('no source file touches localStorage or sessionStorage', () => {
  const offenders = walk('src')
    .filter((f) => /\.(astro|ts|js)$/.test(f))
    .filter((f) => /\b(localStorage|sessionStorage)\b/.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});
```

`tests/build/layout.test.ts`:

```ts
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

  it('there is no page loader any more', () => {
    for (const f of PAGES) expect(read(f)).not.toContain('page-loader');
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/unit/no-browser-storage.test.ts`

Expected: FAIL, listing `src/components/Header.astro` and `src/layouts/Layout.astro`.

Run: `npm run build && npx vitest run tests/build/layout.test.ts`

Expected: FAIL on `data-world`.

- [ ] **Step 3: Add the translation keys**

Add these to each locale, next to the `// Navigation` group:

```ts
    'nav.contact': 'Contact',
    'nav.label': 'Main',
    'nav.language': 'Language',
    'header.eyebrow': 'Cinematographer · Photographer — Luxembourg',
    'meta.home.description': 'Professional cinematographer, photographer and editor based in Luxembourg. Specializing in short films, documentaries, commercial work, and photography with a film-trained eye.',
```

fr:

```ts
    'nav.contact': 'Contact',
    'nav.label': 'Principale',
    'nav.language': 'Langue',
    'header.eyebrow': 'Cinéaste · Photographe — Luxembourg',
    'meta.home.description': 'Cinéaste, photographe et monteur professionnel basé au Luxembourg. Courts métrages, documentaires, projets commerciaux et photographie, avec un œil formé à l\'argentique.',
```

de:

```ts
    'nav.contact': 'Kontakt',
    'nav.label': 'Hauptnavigation',
    'nav.language': 'Sprache',
    'header.eyebrow': 'Kameramann · Fotograf — Luxemburg',
    'meta.home.description': 'Professioneller Kameramann, Fotograf und Editor in Luxemburg. Kurzfilme, Dokumentarfilme, kommerzielle Projekte und Fotografie mit einem analog geschulten Auge.',
```

- [ ] **Step 4: Rewrite `src/layouts/Layout.astro`**

```astro
---
import '../styles/global.css';
import { type Lang, defaultLang, t } from '../i18n/translations';
import { ClientRouter } from 'astro:transitions';
import { stripLocale, canonicalUrl, hreflangAlternates, ogLocale, siteJsonLd } from '../lib/seo';
import { worldColors, type World } from '../lib/disciplines';

interface Props {
  title: string;
  description?: string;
  lang?: Lang;
  world?: World;
  /** Absolute URL. Defaults to the site-wide 1200x630 og.jpg. */
  ogImage?: string;
}

const { title, lang = defaultLang, world = 'neutral', ogImage } = Astro.props;
const description = Astro.props.description ?? t(lang, 'meta.home.description');

const siteUrl = Astro.site?.toString().replace(/\/$/, '') || 'https://nickygrey.com';

// The URL is the ground truth for where a page renders. Fail the build if a
// page's `lang` prop disagrees with it, rather than ship mismatched SEO tags.
const { locale, path } = stripLocale(Astro.url.pathname);
if (lang !== locale) {
  throw new Error(
    `Layout: lang prop "${lang}" does not match the locale "${locale}" implied by the URL "${Astro.url.pathname}".`
  );
}

const canonical = canonicalUrl(path, locale);
const alternates = hreflangAlternates(path);
const isHome = path === '/';
const { bg, accent } = worldColors(world);
const image = ogImage ?? `${siteUrl}/images/og.jpg`;
---

<!DOCTYPE html>
<html lang={locale} data-world={world} style={`--world-bg: ${bg}; --world-accent: ${accent};`}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content={description}>
  <meta name="author" content="Vyacheslav Plotnikov">
  <link rel="canonical" href={canonical}>
  {alternates.map((a) => <link rel="alternate" hreflang={a.hreflang} href={a.href} />)}
  {isHome && <script type="application/ld+json" set:html={JSON.stringify(siteJsonLd())} />}

  <meta property="og:type" content="website">
  <meta property="og:title" content={title}>
  <meta property="og:description" content={description}>
  <meta property="og:url" content={canonical}>
  <meta property="og:image" content={image}>
  {!ogImage && <meta property="og:image:width" content="1200">}
  {!ogImage && <meta property="og:image:height" content="630">}
  <meta property="og:locale" content={ogLocale(locale)}>
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content={title}>
  <meta name="twitter:description" content={description}>
  <meta name="twitter:image" content={image}>

  <meta name="theme-color" content={bg}>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon.svg">

  <link rel="preload" href="/fonts/satoshi-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/cormorant-garamond-400-latin.woff2" as="font" type="font/woff2" crossorigin>

  <ClientRouter />
</head>
<body>
  <slot />

  <script>
    import { initMotion, teardownMotion } from '../motion';
    import { initWebGL, teardownWebGL } from '../webgl';

    // Both calls are intentional, not redundant. astro:page-load fires only
    // after every module script on the page has run, so it is what guarantees
    // late registerMotion() handlers are seen; the synchronous call avoids
    // waiting for that event on first load. Do not remove either call.
    initMotion();
    document.addEventListener('astro:page-load', initMotion);
    document.addEventListener('astro:before-swap', teardownMotion);

    initWebGL();
    document.addEventListener('astro:page-load', initWebGL);
    document.addEventListener('astro:before-swap', teardownWebGL);
  </script>
</body>
</html>
```

The old `keywords` meta, the theme script, the hero preload, the page loader and the custom view-transition keyframes are gone. Milestone 6 adds the new transitions.

- [ ] **Step 5: Rewrite `src/components/Header.astro`**

```astro
---
import { type Lang, t } from '../i18n/translations';
import { LOCALES, localizedPath, stripLocale } from '../lib/seo';

interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
const { path } = stripLocale(Astro.url.pathname);
const home = localizedPath('/', lang);
const about = localizedPath('/about/', lang);
---

<header class="site-header">
  <a class="site-header__name" href={home} data-nav="home">V. Plotnikov</a>
  <p class="site-header__eyebrow eyebrow">{t(lang, 'header.eyebrow')}</p>
  <nav class="site-header__nav" aria-label={t(lang, 'nav.label')}>
    <a href={home} data-nav="work">{t(lang, 'nav.work')}</a>
    <a href={about} data-nav="about">{t(lang, 'nav.about')}</a>
    <a href={`${about}#contact`} data-nav="contact">{t(lang, 'nav.contact')}</a>
    <ul class="site-header__locales" aria-label={t(lang, 'nav.language')}>
      {LOCALES.map((l) => (
        <li>
          <a href={localizedPath(path, l)} hreflang={l} lang={l} aria-current={l === lang ? 'page' : undefined} data-locale={l}>
            {l.toUpperCase()}
          </a>
        </li>
      ))}
    </ul>
  </nav>
</header>

<style>
  .site-header {
    position: fixed;
    inset: 0 0 auto;
    z-index: 10;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 22px var(--gutter);
    font-size: var(--size-nav);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .site-header a { text-decoration: none; text-underline-offset: 4px; }
  .site-header a:hover { text-decoration: underline; }
  .site-header__eyebrow { margin: 0; opacity: 0.8; }
  .site-header__nav { justify-self: end; display: flex; align-items: center; gap: 16px; }
  .site-header__locales { display: flex; gap: 6px; margin: 0 0 0 8px; padding: 0; list-style: none; opacity: 0.7; }
  .site-header__locales a[aria-current] { text-decoration: underline; }

  @media (max-width: 760px) {
    .site-header { grid-template-columns: 1fr auto; }
    .site-header__eyebrow {
      position: fixed;
      left: calc(var(--gutter) - 4px);
      top: 50%;
      writing-mode: vertical-rl;
      transform: translateY(-50%) rotate(180deg);
    }
  }
  @media (max-width: 480px) {
    .site-header { font-size: 11px; }
    .site-header__nav { gap: 10px; }
    .site-header__locales { gap: 4px; margin-left: 2px; }
  }
</style>
```

- [ ] **Step 6: Rewrite `src/components/Footer.astro`**

```astro
---
import { type Lang, t } from '../i18n/translations';
import { localizedPath } from '../lib/seo';

interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
---

<footer class="site-footer eyebrow">
  <p>{t(lang, 'footer.copyright')}</p>
  <a href={localizedPath('/privacy/', lang)} data-nav="privacy">{t(lang, 'footer.privacy')}</a>
</footer>

<style>
  .site-footer { display: flex; justify-content: space-between; gap: 16px; padding: 48px var(--gutter) 32px; opacity: 0.75; }
  .site-footer p { margin: 0; }
  .site-footer a { text-underline-offset: 4px; }
</style>
```

- [ ] **Step 7: Run the suites**

Run: `npm test && npm run build && npm run test:build`

Expected: all PASS. The old pages still render their old sections under the new Layout; that's expected.

- [ ] **Step 8: Commit**

```bash
git add src/layouts/Layout.astro src/components/Header.astro src/components/Footer.astro src/i18n/translations.ts tests/build/layout.test.ts tests/unit/no-browser-storage.test.ts
git commit -m "feat(m1): color-world layout, new header and footer, no browser storage"
```

---

### Task 6: New pages (home, galleries, about, privacy) in three locales

**Files:**
- Create: `src/views/HomeView.astro`, `src/views/GalleryView.astro`, `src/views/AboutView.astro`, `src/views/PrivacyView.astro`
- Create: `src/pages/work/[discipline].astro`, `src/pages/fr/work/[discipline].astro`, `src/pages/de/work/[discipline].astro`
- Create: `src/pages/about.astro`, `src/pages/fr/about.astro`, `src/pages/de/about.astro`
- Rewrite: `src/pages/index.astro`, `src/pages/privacy.astro`, and the same two files under `fr/` and `de/`
- Modify: `src/i18n/translations.ts`
- Modify: `tests/build/build-output.test.ts`, `tests/build/image-pipeline.test.ts`, `tests/build/galleries.test.ts`

**Interfaces:**
- Consumes:
  - `getActiveDisciplines`, `getGallery`, `galleryPaths` (Task 3)
  - `coverOf`, `Frame`, `RoleKey` (Task 2)
  - `getDiscipline`, `DisciplineSlug` (Task 1)
  - `Layout`, `Header`, `Footer` (Task 5)
- Produces:
  - The views `HomeView`, `GalleryView`, `AboutView` and `PrivacyView`, each taking `{ lang: Lang }`. `GalleryView` also takes `slug: DisciplineSlug`.
  - Test hooks that later milestones rely on:
    - home links carry `data-discipline="<slug>"` and `style="--tint: <accent>"`;
    - gallery items carry `data-frame="<index>"`;
    - the contact section is `<section id="contact">`.

The markup is deliberately plain. Milestones 2 to 5 replace each view's styling and behavior. Captions appear in the gallery grid for now, and milestone 4 moves them into single view.

- [ ] **Step 1: Update the build tests first (they will fail)**

In `tests/build/build-output.test.ts`, replace the hard-coded `PAGES` constant with a list derived from the gallery folders. That way, a discipline that gains its first image is covered automatically.

```ts
import { readdirSync } from 'node:fs';

const LOCALES = [
  { locale: 'en', prefix: '' },
  { locale: 'fr', prefix: '/fr' },
  { locale: 'de', prefix: '/de' },
] as const;
const ACTIVE = ['cinematography', 'documentary', 'portrait', 'photography'].filter((s) =>
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
```

Replace the og:image test with this version, since gallery pages now use their cover image:

```ts
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
```

Rename the sitemap test to `'sitemap lists exactly the built pages\' canonical URLs'`. Its body is unchanged.

In `tests/build/image-pipeline.test.ts`, replace the hero test with:

```ts
  it('offers responsive candidates for gallery frames', () => {
    const page = readFileSync('dist/work/portrait/index.html', 'utf8');
    const frame = (page.match(/<li data-frame="1">[\s\S]*?<img[^>]*>/) || [])[0] || '';
    expect(frame).toMatch(/srcset=/);
    expect(frame.match(/\d+w/g)?.length || 0).toBeGreaterThan(1);
  });
```

Append to `tests/build/galleries.test.ts`:

```ts
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
```

Also change its first import line to `import { existsSync, readdirSync, readFileSync } from 'node:fs';`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run build && npm run test:build`

Expected: FAIL. `dist/about/index.html` and `dist/work/portrait/index.html` are missing.

- [ ] **Step 3: Add the translation keys**

en:

```ts
    // Page metadata
    'meta.home.title': 'Vyacheslav Plotnikov — Cinematographer in Luxembourg',
    'meta.about.title': 'About — Vyacheslav Plotnikov',
    'meta.privacy.title': 'Privacy Policy — Vyacheslav Plotnikov',
    'meta.gallery.description': 'Selected frames by Vyacheslav Plotnikov, cinematographer and photographer in Luxembourg.',
    'home.heading': 'Vyacheslav Plotnikov — selected work',
    // Gallery
    'gallery.play': 'Play film ↗',
    'role.camera': 'Camera',
    'role.lighting': 'Lighting',
    'role.edit': 'Edit',
    'role.colour': 'Colour',
    'role.direction': 'Direction',
    'role.interview': 'Interview',
    'role.photography': 'Photography',
    // About page
    'about.lede': 'Cinematographer and photographer based in Luxembourg, working wherever the story is.',
    'about.contact': 'Commissions and collaborations:',
    'about.location': 'Luxembourg · Available across Europe',
    'about.portrait-alt': 'Portrait of Vyacheslav Plotnikov',
```

fr:

```ts
    'meta.home.title': 'Vyacheslav Plotnikov — Cinéaste & Photographe, Luxembourg',
    'meta.about.title': 'À propos — Vyacheslav Plotnikov',
    'meta.privacy.title': 'Politique de confidentialité — Vyacheslav Plotnikov',
    'meta.gallery.description': 'Images choisies de Vyacheslav Plotnikov, cinéaste et photographe au Luxembourg.',
    'home.heading': 'Vyacheslav Plotnikov — travaux choisis',
    'gallery.play': 'Voir le film ↗',
    'role.camera': 'Image',
    'role.lighting': 'Lumière',
    'role.edit': 'Montage',
    'role.colour': 'Étalonnage',
    'role.direction': 'Réalisation',
    'role.interview': 'Entretien',
    'role.photography': 'Photographie',
    'about.lede': "Cinéaste et photographe basé au Luxembourg, travaillant partout où l'histoire se trouve.",
    'about.contact': 'Commandes et collaborations :',
    'about.location': "Luxembourg · Disponible dans toute l'Europe",
    'about.portrait-alt': 'Portrait de Vyacheslav Plotnikov',
```

de:

```ts
    'meta.home.title': 'Vyacheslav Plotnikov — Kameramann & Fotograf, Luxemburg',
    'meta.about.title': 'Über mich — Vyacheslav Plotnikov',
    'meta.privacy.title': 'Datenschutzerklärung — Vyacheslav Plotnikov',
    'meta.gallery.description': 'Ausgewählte Bilder von Vyacheslav Plotnikov, Kameramann und Fotograf in Luxemburg.',
    'home.heading': 'Vyacheslav Plotnikov — ausgewählte Arbeiten',
    'gallery.play': 'Film ansehen ↗',
    'role.camera': 'Kamera',
    'role.lighting': 'Licht',
    'role.edit': 'Schnitt',
    'role.colour': 'Farbkorrektur',
    'role.direction': 'Regie',
    'role.interview': 'Interview',
    'role.photography': 'Fotografie',
    'about.lede': 'Kameramann und Fotograf in Luxemburg, unterwegs, wo immer die Geschichte ist.',
    'about.contact': 'Aufträge und Kooperationen:',
    'about.location': 'Luxemburg · In ganz Europa verfügbar',
    'about.portrait-alt': 'Porträt von Vyacheslav Plotnikov',
```

Change the existing privacy values in place:

| Key | en | fr | de |
| --- | --- | --- | --- |
| `privacy.storage.desc` | `This site uses no cookies and no analytics, and stores nothing in your browser.` | `Ce site n'utilise ni cookies ni outils d'analyse, et ne stocke rien dans votre navigateur.` | `Diese Website verwendet weder Cookies noch Analysen und speichert nichts in Ihrem Browser.` |
| `privacy.updated` | `Last updated: October 2026` | `Dernière mise à jour : octobre 2026` | `Zuletzt aktualisiert: Oktober 2026` |

- [ ] **Step 4: Create `src/views/HomeView.astro`**

```astro
---
import { Image } from 'astro:assets';
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import { type Lang, t } from '../i18n/translations';
import { localizedPath } from '../lib/seo';
import { coverOf } from '../lib/gallery';
import { getActiveDisciplines } from '../lib/gallery-data';

interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
const active = await getActiveDisciplines();
---

<Layout lang={lang} title={t(lang, 'meta.home.title')}>
  <Header lang={lang} />
  <main id="main-content" class="home">
    <h1 class="visually-hidden">{t(lang, 'home.heading')}</h1>
    <ul class="home__strips">
      {active.map(({ discipline, frames }) => (
        <li>
          <a
            href={localizedPath(`/work/${discipline.slug}/`, lang)}
            data-discipline={discipline.slug}
            style={`--tint: ${discipline.accent}`}
          >
            <Image
              src={coverOf(frames)!.image}
              alt=""
              widths={[480, 960]}
              sizes="(max-width: 760px) 100vw, 12vw"
              format="webp"
              quality={72}
              loading="eager"
            />
            <span class="display">{t(lang, discipline.nameKey)}</span>
          </a>
        </li>
      ))}
    </ul>
  </main>
</Layout>

<style>
  .home { min-height: 100svh; display: grid; place-items: center; padding: 96px var(--gutter); }
  .home__strips { display: flex; gap: 22px; margin: 0; padding: 0; list-style: none; }
  .home__strips a { display: block; width: clamp(96px, 8.5vw, 122px); text-decoration: none; }
  .home__strips img { width: 100%; aspect-ratio: 122 / 342; object-fit: cover; filter: grayscale(1); }
  .home__strips span { display: block; margin-top: 10px; font-size: var(--step-label); text-align: center; }
</style>
```

- [ ] **Step 5: Create `src/views/GalleryView.astro`**

```astro
---
import { Image, getImage } from 'astro:assets';
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import { type Lang, type TranslationKey, t } from '../i18n/translations';
import { getDiscipline, type DisciplineSlug } from '../lib/disciplines';
import { coverOf } from '../lib/gallery';
import { getGallery } from '../lib/gallery-data';

interface Props {
  lang: Lang;
  slug: DisciplineSlug;
}

const { lang, slug } = Astro.props;
const discipline = getDiscipline(slug)!;
const frames = await getGallery(slug);
const name = t(lang, discipline.nameKey);
const og = await getImage({ src: coverOf(frames)!.image, width: 1200, format: 'jpg', quality: 80 });
const siteUrl = Astro.site!.toString().replace(/\/$/, '');
const roleList = (roles: string[]) => roles.map((r) => t(lang, `role.${r}` as TranslationKey)).join(', ');
---

<Layout
  lang={lang}
  world={slug}
  title={`${name} — Vyacheslav Plotnikov`}
  description={`${name}. ${t(lang, 'meta.gallery.description')}`}
  ogImage={`${siteUrl}${og.src}`}
>
  <Header lang={lang} />
  <main id="main-content" class="gallery">
    <ol class="gallery__frames">
      {frames.map((f) => (
        <li data-frame={f.index}>
          <figure>
            <Image
              src={f.image}
              alt={f.credit?.alt ?? `${name}, ${f.index} / ${frames.length}`}
              widths={[480, 960, 1600, 2400]}
              sizes="(max-width: 760px) 50vw, 25vw"
              format="webp"
              quality={72}
              loading={f.index <= 4 ? 'eager' : 'lazy'}
            />
            {f.credit && (f.credit.title || f.credit.client || f.credit.roles.length > 0 || f.credit.film) && (
              <figcaption class="eyebrow">
                <span>{[f.credit.title, f.credit.client, roleList(f.credit.roles)].filter(Boolean).join(' — ')}</span>
                {f.credit.film && <a href={f.credit.film} target="_blank" rel="noopener">{t(lang, 'gallery.play')}</a>}
              </figcaption>
            )}
          </figure>
        </li>
      ))}
    </ol>
    <div class="gallery__title">
      <h1 class="display">{name}</h1>
      <p>{discipline.years}</p>
    </div>
  </main>
</Layout>

<style>
  .gallery { padding: 96px var(--gutter) 180px; }
  .gallery__frames {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: var(--gutter);
    align-items: start;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  figure { margin: 0; }
  figcaption { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
  .gallery__title { position: fixed; left: var(--gutter); bottom: 24px; }
  .gallery__title h1 { margin: 0; font-size: var(--step-title); }
  .gallery__title p { margin: 4px 0 0; }
</style>
```

- [ ] **Step 6: Create `src/views/AboutView.astro`**

```astro
---
import { Image } from 'astro:assets';
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import { type Lang, t } from '../i18n/translations';
import portrait from '../assets/portrait.jpg';

interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
---

<Layout lang={lang} title={t(lang, 'meta.about.title')}>
  <Header lang={lang} />
  <main id="main-content" class="about">
    <div class="about__intro">
      <div class="about__text">
        <h1 class="display">Vyacheslav Plotnikov</h1>
        <p>{t(lang, 'about.lede')}</p>
        <p>{t(lang, 'about.p2')}</p>
      </div>
      <Image
        src={portrait}
        alt={t(lang, 'about.portrait-alt')}
        widths={[480, 960, 1440]}
        sizes="(max-width: 760px) 100vw, 30vw"
        format="webp"
        quality={75}
      />
    </div>
    <section id="contact" class="about__contact" aria-labelledby="contact-heading">
      <h2 id="contact-heading" class="eyebrow">{t(lang, 'nav.contact')}</h2>
      <p>{t(lang, 'about.contact')} <a href="mailto:pv@nickygrey.com">pv@nickygrey.com</a></p>
      <p class="eyebrow">{t(lang, 'about.location')}</p>
    </section>
  </main>
  <Footer lang={lang} />
</Layout>

<style>
  .about { width: min(100% - 2 * var(--gutter), 980px); margin: 0 auto; padding-top: 120px; }
  .about__intro { display: grid; grid-template-columns: 1.15fr 1fr; gap: 6%; align-items: start; }
  .about__text h1 { margin: 0 0 16px; font-size: var(--step-name); }
  .about__text p { max-width: 62ch; }
  .about__contact { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--line); }
  @media (max-width: 760px) { .about__intro { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 7: Create `src/views/PrivacyView.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import { type Lang, t } from '../i18n/translations';
import { localizedPath } from '../lib/seo';

interface Props {
  lang: Lang;
}

const { lang } = Astro.props;
---

<Layout lang={lang} title={t(lang, 'meta.privacy.title')}>
  <Header lang={lang} />
  <main id="main-content" class="privacy">
    <article>
      <h1 class="display">{t(lang, 'privacy.title')}</h1>
      <p>{t(lang, 'privacy.intro')}</p>
      <p class="privacy__note">{t(lang, 'privacy.legal')}</p>

      <section>
        <h2 class="display">{t(lang, 'privacy.data.title')}</h2>
        <p class="privacy__basis">{t(lang, 'privacy.data.legal')}</p>
        <p>{t(lang, 'privacy.data.intro')}</p>
        <ul><li>{t(lang, 'privacy.data.list')}</li></ul>
        <p>{t(lang, 'privacy.data.purpose')}</p>
        <p>{t(lang, 'privacy.data.retention')}</p>
      </section>

      <section>
        <h2 class="display">{t(lang, 'privacy.thirdparty.title')}</h2>
        <p class="privacy__basis">{t(lang, 'privacy.thirdparty.legal')}</p>
        <ul>
          <li><strong>Formspree:</strong> {t(lang, 'privacy.thirdparty.formspree')}</li>
          <li><strong>GitHub Pages:</strong> {t(lang, 'privacy.thirdparty.hosting')}</li>
        </ul>
      </section>

      <section>
        <h2 class="display">{t(lang, 'privacy.storage.title')}</h2>
        <p>{t(lang, 'privacy.storage.desc')}</p>
      </section>

      <section>
        <h2 class="display">{t(lang, 'privacy.rights.title')}</h2>
        <p>{t(lang, 'privacy.rights.intro')}</p>
        <ul><li>{t(lang, 'privacy.rights.list')}</li></ul>
        <p>{t(lang, 'privacy.rights.desc')}</p>
        <p><a href="mailto:pv@nickygrey.com">pv@nickygrey.com</a></p>
        <p>{t(lang, 'privacy.rights.complaint')}</p>
      </section>

      <p class="privacy__updated eyebrow">{t(lang, 'privacy.updated')}</p>
      <a href={localizedPath('/', lang)}>{t(lang, 'privacy.back')}</a>
    </article>
  </main>
  <Footer lang={lang} />
</Layout>

<style>
  .privacy { width: min(100% - 2 * var(--gutter), 680px); margin: 0 auto; padding-top: clamp(100px, 12vw, 140px); }
  .privacy h1 { margin: 0 0 32px; font-size: var(--step-name); }
  .privacy h2 { margin: 40px 0 16px; font-size: clamp(1.375rem, 1.2rem + 0.8vw, 1.75rem); }
  .privacy ul { padding-left: 24px; }
  .privacy li { margin-bottom: 12px; }
  .privacy__note { padding-left: 16px; border-left: 1px solid var(--control-line); opacity: 0.8; }
  .privacy__basis { font-size: 0.8125rem; font-style: italic; opacity: 0.7; }
  .privacy__updated { margin-top: 48px; opacity: 0.7; }
  .privacy a { text-underline-offset: 4px; }
</style>
```

- [ ] **Step 8: Replace the page files with thin wrappers**

`src/pages/index.astro` is shown here. Make the same file under `fr/` and `de/`, with `lang="fr"` or `lang="de"` and import paths that go one more level up (`../../views/...`).

```astro
---
import HomeView from '../views/HomeView.astro';
---
<HomeView lang="en" />
```

`src/pages/about.astro`, `src/pages/privacy.astro` and their fr/de copies follow the same pattern with `AboutView` and `PrivacyView`.

`src/pages/work/[discipline].astro`:

```astro
---
import GalleryView from '../../views/GalleryView.astro';
import { galleryPaths } from '../../lib/gallery-data';
import type { DisciplineSlug } from '../../lib/disciplines';

export async function getStaticPaths() {
  return galleryPaths();
}

const { discipline } = Astro.params as { discipline: DisciplineSlug };
---
<GalleryView lang="en" slug={discipline} />
```

`src/pages/fr/work/[discipline].astro` and `src/pages/de/work/[discipline].astro` are the same with `../../../` import paths and `lang="fr"` or `lang="de"`.

- [ ] **Step 9: Run the suites**

Run: `npm test && npm run build && npm run test:build`

Expected: all PASS. If `keeps every generated image under 400kB` fails, drop `2400` from the `widths` in `GalleryView.astro` (see Global Constraints) and re-run.

- [ ] **Step 10: Look at it**

Run `npx astro dev --background` and note the port it reports. Open `/`, `/work/portrait/`, `/fr/about/` and `/de/privacy/`. Check that:
- the home page shows only the Portrait and Photography strips;
- the Portrait page has the oxblood background with sky-blue type;
- the locale switch keeps you on the same page.

Run `npx astro dev stop` when done.

- [ ] **Step 11: Commit**

```bash
git add src/views src/pages src/i18n/translations.ts tests/build
git commit -m "feat(m1): home, gallery, about and privacy pages in en/fr/de"
```

---

### Task 7: Delete the long page, and bring the browser tests back to green

**Files:**
- Delete components: `src/components/{About,Contact,DisciplinesStrip,FeaturedReel,Hero,Partners,PhotoCarousel,SelectedWork,Services,Testimonials}.astro`
- Delete libraries and shaders: `src/lib/hero-image.ts`, `src/lib/photos.ts`, `src/webgl/shaders/hero.ts`, `src/webgl/shaders/work.ts`
- Delete assets: `src/assets/photos/`, `src/assets/hero.jpg`, `src/assets/work-audience.png`, `src/assets/partners/`
- Delete tests: `tests/unit/webgl-hero-shader.test.ts`, `tests/unit/webgl-work-shader.test.ts`, and `tests/e2e/{lightbox,theme,header-contrast,mobile,anchor-scroll,modifier-click,webgl}.spec.ts`
- Modify: `src/i18n/translations.ts` (remove dead keys), `tests/e2e/lifecycle.spec.ts`
- Create: `tests/e2e/pages.spec.ts`

**Interfaces:**
- Consumes: the `data-nav`, `data-discipline`, `data-locale` and `data-world` hooks from Tasks 5 and 6.
- Produces: nothing new. Later milestones rewrite the deleted e2e specs:
  - Milestone 2: `modifier-click` for the strips, and `mobile` for the stacked layout.
  - Milestone 5: `anchor-scroll` for `#contact`.
  - Milestone 6: `webgl`.

  The generic WebGL regressions ("reduced motion creates no context", "supported() does not leak a probe context", "probe is cached") are restored in milestone 6 from this task's parent commit. Record that commit's hash in the commit message below.

- [ ] **Step 1: Write the new browser test (it fails until the deletions and fixes below)**

`tests/e2e/pages.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('a home strip opens its gallery and the page takes on that world', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[data-discipline="portrait"]').click();
  await page.waitForURL((u) => u.pathname === '/work/portrait/');
  // ClientRouter swaps <html> attributes; the world must follow the navigation.
  await expect(page.locator('html')).toHaveAttribute('data-world', 'portrait');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe('rgb(43, 21, 18)');
});

test('the locale switch keeps the visitor on the same page', async ({ page }) => {
  await page.goto('/work/portrait/');
  await page.locator('a[data-locale="fr"]').click();
  await page.waitForURL((u) => u.pathname === '/fr/work/portrait/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('Contact in the header lands on the contact section', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[data-nav="contact"]').click();
  await page.waitForURL((u) => u.pathname === '/about/');
  await expect(page.locator('#contact')).toBeInViewport();
});

test('the page never scrolls sideways at 375px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  for (const path of ['/', '/work/portrait/', '/about/', '/de/privacy/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
```

- [ ] **Step 2: Update `tests/e2e/lifecycle.spec.ts`**

Replace the body of the loop in the first test with navigation through the new header:

```ts
  for (let i = 0; i < 3; i++) {
    await page.locator('header a[data-nav="about"]').click();
    await page.waitForURL((url) => url.pathname === '/about/');
    await page.waitForTimeout(600);

    await page.locator('header a[data-nav="home"]').click();
    await page.waitForURL((url) => url.pathname === '/');
    await page.waitForTimeout(1200);

    counts.push(await page.evaluate(() => window.__motion.triggerCount()));
  }
```

- [ ] **Step 3: Delete the dead code**

```bash
git rm src/components/{About,Contact,DisciplinesStrip,FeaturedReel,Hero,Partners,PhotoCarousel,SelectedWork,Services,Testimonials}.astro
git rm src/lib/hero-image.ts src/lib/photos.ts src/webgl/shaders/hero.ts src/webgl/shaders/work.ts
git rm -r src/assets/photos src/assets/partners
git rm src/assets/hero.jpg src/assets/work-audience.png
git rm tests/unit/webgl-hero-shader.test.ts tests/unit/webgl-work-shader.test.ts
git rm tests/e2e/{lightbox,theme,header-contrast,mobile,anchor-scroll,modifier-click,webgl}.spec.ts
```

Then confirm nothing still imports what was deleted:

```bash
grep -rnE "components/(About|Contact|DisciplinesStrip|FeaturedReel|Hero|Partners|PhotoCarousel|SelectedWork|Services|Testimonials)|hero-image|lib/photos|shaders/(hero|work)|assets/(photos|partners|hero|work-audience)" src tests
```

Expected: no output.

- [ ] **Step 4: Remove dead translation keys from all three locales**

Every entry is a single line, so a line filter is safe:

```bash
python3 - <<'EOF'
import re
p = 'src/i18n/translations.ts'
dead = re.compile(r"^\s+'(nav\.(photos|reel|services)|hero\.[\w.-]+|reel\.[\w.-]+|about\.(label|title|p1)|services\.[\w.-]+|testimonials\.(label|title|quote1|quote3)|partner|privacy\.thirdparty\.fonts|privacy\.storage\.legal)':")
lines = open(p).read().split('\n')
kept = [l for l in lines if not dead.match(l)]
print(len(lines) - len(kept), 'lines removed')
open(p, 'w').write('\n'.join(kept))
EOF
```

Expected: `90 lines removed`, which is 30 keys × 3 locales. Then delete any `// Hero`, `// Reel`, `// Services` or `// Partner` comment lines that now head an empty group. Keep `contact.*`, `testimonials.quote2` and `about.p2`, because milestone 5 uses them.

- [ ] **Step 5: Run every suite**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`

Expected: all PASS. The e2e config starts its own dev server on port 4329 and uses `channel: 'chrome'`. If Playwright reports that Chrome isn't found, run `npx playwright install chrome` and re-run.

If the 375px test fails on the header, reduce `.site-header__nav` `gap` within the `max-width: 480px` rule until it fits. Don't hide the locale switch.

- [ ] **Step 6: Commit**

```bash
PARENT=$(git rev-parse --short HEAD)
git add -A src tests
git commit -m "refactor(m1): delete the long single page and its tests

Old WebGL e2e regressions to restore in milestone 6: git show $PARENT:tests/e2e/webgl.spec.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frame-grab tool, and a Documentary gallery from the four films

**Files:**
- Create: `scripts/grab-frames.sh` (executable)
- Create: `src/content/galleries/documentary/*.jpg` (generated)
- Modify: `src/content/galleries/documentary.yaml`
- Test: `tests/unit/grab-frames.test.ts`

**Interfaces:**
- Produces the command `scripts/grab-frames.sh [--count N | --at T1,T2,…] [--prefix NAME] [--out DIR] <video-file-or-URL> <discipline>`. It prints each written file path, one per line. `--prefix` is required for URLs; for local files it defaults to a slug of the filename.

- [ ] **Step 1: Write the failing test**

`tests/unit/grab-frames.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const SCRIPT = 'scripts/grab-frames.sh';

describe.skipIf(!hasFfmpeg)('grab-frames.sh', () => {
  let dir: string;
  let video: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'grab-'));
    video = join(dir, 'clip.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=320x180:rate=10', video]);
  });

  it('writes --count evenly spaced frames, named prefix-NN.jpg', () => {
    const out = join(dir, 'count');
    execFileSync('bash', [SCRIPT, '--count', '3', '--prefix', 't', '--out', out, video, 'documentary']);
    expect(readdirSync(out).sort()).toEqual(['t-01.jpg', 't-02.jpg', 't-03.jpg']);
  });

  it('writes one frame per --at timestamp', () => {
    const out = join(dir, 'at');
    execFileSync('bash', [SCRIPT, '--at', '00:00:01,00:00:02', '--out', out, video, 'portrait']);
    expect(readdirSync(out).sort()).toEqual(['clip-01.jpg', 'clip-02.jpg']);
  });

  it('refuses an unknown discipline', () => {
    const r = spawnSync('bash', [SCRIPT, '--out', join(dir, 'x'), video, 'weddings']);
    expect(r.status).not.toBe(0);
    expect(String(r.stderr)).toMatch(/Unknown discipline: weddings/);
  });

  it('refuses a URL without --prefix', () => {
    const r = spawnSync('bash', [SCRIPT, 'https://www.youtube.com/watch?v=x', 'documentary']);
    expect(r.status).not.toBe(0);
    expect(String(r.stderr)).toMatch(/--prefix/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/unit/grab-frames.test.ts`

Expected: FAIL. The script doesn't exist, so `bash` exits 127.

- [ ] **Step 3: Write `scripts/grab-frames.sh`**

```bash
#!/usr/bin/env bash
# Pull still frames from a film into a gallery folder.
#
#   scripts/grab-frames.sh [--count N | --at T1,T2,…] [--prefix NAME] [--out DIR] <video-file-or-URL> <discipline>
#
# Without --at, takes N frames (default 3) evenly spaced between 10% and 90%
# of the running time, which skips title cards and end credits. Frames land in
# src/content/galleries/<discipline>/ as <prefix>-01.jpg, <prefix>-02.jpg, …
# A filename prefix like "10-audience" also sets the frames' place in the
# gallery order. URLs need yt-dlp (brew install yt-dlp); original video files
# give better frames than YouTube and need only ffmpeg.
set -euo pipefail

count=3; at=""; prefix=""; out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --count)  count="$2"; shift 2 ;;
    --at)     at="$2"; shift 2 ;;
    --prefix) prefix="$2"; shift 2 ;;
    --out)    out="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 [--count N | --at T1,T2] [--prefix NAME] [--out DIR] <video-file-or-URL> <discipline>" >&2
  exit 2
fi
src="$1"; discipline="$2"

case "$discipline" in
  cinematography|documentary|portrait|photography) ;;
  *) echo "Unknown discipline: $discipline" >&2; exit 2 ;;
esac

is_url=false
[[ "$src" =~ ^https?:// ]] && is_url=true
if [[ -z "$prefix" ]]; then
  if $is_url; then echo "Pass --prefix NAME when the source is a URL." >&2; exit 2; fi
  prefix="$(basename "$src" | sed 's/\.[^.]*$//' | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '-')"
fi
out="${out:-src/content/galleries/$discipline}"

command -v ffmpeg >/dev/null || { echo "ffmpeg is required: brew install ffmpeg" >&2; exit 1; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if $is_url; then
  command -v yt-dlp >/dev/null || { echo "yt-dlp is required for URLs: brew install yt-dlp" >&2; exit 1; }
  yt-dlp -q -f 'bv*[height<=2160][ext=mp4]/bv*[height<=2160]/best' -o "$work/video.%(ext)s" "$src"
  video="$(ls "$work"/video.*)"
else
  [[ -f "$src" ]] || { echo "No such file: $src" >&2; exit 1; }
  video="$src"
fi

if [[ -z "$at" ]]; then
  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")"
  at="$(awk -v d="$duration" -v n="$count" 'BEGIN {
    for (i = 0; i < n; i++) { f = (n == 1) ? 0.5 : i / (n - 1); printf "%s%.3f", (i ? "," : ""), d * (0.1 + 0.8 * f) }
  }')"
fi

mkdir -p "$out"
IFS=',' read -ra stamps <<< "$at"
i=0
for t in "${stamps[@]}"; do
  i=$((i + 1))
  file="$out/$prefix-$(printf '%02d' "$i").jpg"
  ffmpeg -loglevel error -y -ss "$t" -i "$video" -frames:v 1 -q:v 2 "$file"
  echo "$file"
done
```

Then run `chmod +x scripts/grab-frames.sh`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/grab-frames.test.ts`

Expected: 4 PASS.

- [ ] **Step 5: Grab frames from the four films**

```bash
command -v yt-dlp || brew install yt-dlp
scripts/grab-frames.sh --count 3 --prefix 10-audience        "https://www.youtube.com/watch?v=0Wb-eaG1Vio" documentary
scripts/grab-frames.sh --count 2 --prefix 20-nadine-robert   "https://www.youtube.com/watch?v=uqHGwlVwo8c" documentary
scripts/grab-frames.sh --count 2 --prefix 30-tetiana-popyk   "https://www.youtube.com/watch?v=ozb0hqq4Udg" documentary
scripts/grab-frames.sh --count 2 --prefix 40-sarah-mandres   "https://www.youtube.com/watch?v=xN6xxZU8gqY" documentary
```

Open every file in `src/content/galleries/documentary/`. A frame must be replaced if it:
- is a title card or logo (the "UGEGRAFF" card in particular);
- is black or mid-fade;
- is motion-blurred;
- shows on-screen subtitles.

To replace one, re-run that film with `--at` timestamps chosen by scrubbing the film, using the same `--prefix` so it overwrites.

- [ ] **Step 6: Write `src/content/galleries/documentary.yaml`**

Write one entry per frame. The `alt` describes what is actually in that frame, written after looking at it. The `roles` are from the About copy ("I shoot, grade and cut"), and the owner confirms them per film (spec §10). Use this shape:

```yaml
# Credits for src/content/galleries/documentary/. See portrait.yaml for the fields.
# roles: from the About copy; owner to confirm per film.
frames:
  - file: 10-audience-01.jpg
    title: Audience
    roles: [camera, edit, colour]
    film: https://www.youtube.com/watch?v=0Wb-eaG1Vio&t=71s
    alt: <what this frame shows>
    cover: true
  - file: 20-nadine-robert-01.jpg
    title: Nadine Robert
    client: Ugegraff
    roles: [camera, edit]
    film: https://www.youtube.com/watch?v=uqHGwlVwo8c&t=100s
    alt: <what this frame shows>
```

Use the same pattern for every other frame. Tetiana Popyk's link is `https://www.youtube.com/watch?v=ozb0hqq4Udg&t=10s` and Sarah Mandres's is `https://www.youtube.com/watch?v=xN6xxZU8gqY`. The `<what this frame shows>` text is filled in from the frame itself; none may remain when committing. Check with `grep -c '<what' src/content/galleries/documentary.yaml`, which must print `0`.

- [ ] **Step 7: Run every suite and look at it**

Run: `npm test && npm run build && npm run test:build && npm run test:e2e`

Expected: all PASS. The dynamic build tests now also cover `/work/documentary/` in three locales, and the home page shows three strips.

- [ ] **Step 8: Commit**

```bash
git add scripts/grab-frames.sh tests/unit/grab-frames.test.ts src/content/galleries/documentary src/content/galleries/documentary.yaml
git commit -m "feat(m1): frame-grab tool and a Documentary gallery from the four films"
```

---

## After milestone 1

These are still open with the owner (spec §10). None of them blocks milestone 2:
- the "Worked with" list
- "Available across Europe"
- year ranges
- which testimonial to use
- more images, including anything for Cinematography, which stays hidden until its folder has an image
- the per-film roles
- a native check of the fr/de copy

Next plan: `docs/superpowers/plans/<date>-aperture-m2-home.md`, written once milestone 1 has merged into this branch.
