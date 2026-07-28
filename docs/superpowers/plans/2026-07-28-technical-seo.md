# Technical SEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site crawlability, correct multilingual signalling, structured data, working social previews, and searchable title tags.

**Architecture:** Pure URL and schema builders live in `src/lib/seo.ts` with no Astro or I/O dependencies, so hreflang construction is unit-testable. `Layout.astro` renders what those builders return. Sitemap generation is delegated to `@astrojs/sitemap`, a build-time integration that ships no runtime JavaScript.

**Tech Stack:** Astro 5.7.13 (static, i18n en/fr/de), `@astrojs/sitemap` 3.7.3, Vitest, Playwright, sharp 0.33.5 (already present).

**Spec:** `docs/superpowers/specs/2026-07-28-technical-seo-design.md`

## Global Constraints

- Repo is `astro-portfolio/`. The outer `design_handoff_portfolio/src/` tree is a **stale duplicate** — never edit it.
- Branch is `feat/technical-seo`. Do not commit to `main` — `main` is deployed live to nickygrey.com on push.
- Node `>=22.12.0`.
- Canonical name is **`Vyacheslav Plotnikov`** — exact spelling, in title, `og:title`, `author` meta and JSON-LD `name`. `P.V.` remains only as visual branding in the header logo and page loader; do not remove it from those.
- **No postal address and no business-registration claims anywhere in the structured data.** The entity is an individual professional without a public studio address. JSON-LD is a factual assertion to search engines.
- i18n: `en` is the default locale and is **unprefixed**; `fr` and `de` are prefixed. All six built pages: `/`, `/privacy/`, `/fr/`, `/fr/privacy/`, `/de/`, `/de/privacy/`.
- Homepage titles must be 50–60 characters. Privacy page titles are exempt.
- `@astrojs/sitemap` is a build-time dependency only. It must not add runtime JavaScript to the 60.66 kB bundle — verify the bundle is unchanged.
- `npm run build` must pass reporting `6 page(s) built`. `npm test` and `npm run test:e2e` must stay green.
- Line numbers are indicative, not authoritative. Locate targets by `grep -n`; content wins.

---

### Task 1: SEO URL and schema builders

Pure functions, no Astro APIs, no I/O. This is where hreflang correctness is won or lost — the default locale is unprefixed while the others are not, so every URL is an off-by-one-slash risk, and a wrong hreflang actively misinforms search engines.

**Files:**
- Create: `src/lib/seo.ts`
- Test: `tests/unit/seo.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Locale = 'en' | 'fr' | 'de'`
  - `LOCALES: readonly Locale[]`, `DEFAULT_LOCALE: Locale`, `SITE: string`
  - `stripLocale(pathname: string): { locale: Locale; path: string }`
  - `localizedPath(path: string, locale: Locale): string`
  - `canonicalUrl(path: string, locale: Locale, site?: string): string`
  - `hreflangAlternates(path: string, site?: string): Array<{ hreflang: string; href: string }>`
  - `ogLocale(locale: Locale): string`
  - `siteJsonLd(site?: string): object`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/seo.test.ts
import { describe, it, expect } from 'vitest';
import {
  LOCALES, DEFAULT_LOCALE, SITE,
  stripLocale, localizedPath, canonicalUrl, hreflangAlternates, ogLocale, siteJsonLd,
} from '../../src/lib/seo';

describe('constants', () => {
  it('has three locales with en as the unprefixed default', () => {
    expect([...LOCALES]).toEqual(['en', 'fr', 'de']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('has an absolute site origin with no trailing slash', () => {
    expect(SITE).toBe('https://nickygrey.com');
  });
});

describe('stripLocale', () => {
  it('treats an unprefixed path as the default locale', () => {
    expect(stripLocale('/')).toEqual({ locale: 'en', path: '/' });
    expect(stripLocale('/privacy/')).toEqual({ locale: 'en', path: '/privacy/' });
  });

  it('extracts a prefixed locale and returns the remaining path', () => {
    expect(stripLocale('/fr/')).toEqual({ locale: 'fr', path: '/' });
    expect(stripLocale('/de/')).toEqual({ locale: 'de', path: '/' });
    expect(stripLocale('/fr/privacy/')).toEqual({ locale: 'fr', path: '/privacy/' });
    expect(stripLocale('/de/privacy/')).toEqual({ locale: 'de', path: '/privacy/' });
  });

  it('only matches a whole first segment, never a prefix of one', () => {
    // '/french-films/' must not be read as locale 'fr'
    expect(stripLocale('/french-films/')).toEqual({ locale: 'en', path: '/french-films/' });
    expect(stripLocale('/design/')).toEqual({ locale: 'en', path: '/design/' });
  });

  it('normalises a missing trailing slash', () => {
    expect(stripLocale('/privacy')).toEqual({ locale: 'en', path: '/privacy/' });
    expect(stripLocale('/fr/privacy')).toEqual({ locale: 'fr', path: '/privacy/' });
    expect(stripLocale('/fr')).toEqual({ locale: 'fr', path: '/' });
  });
});

describe('localizedPath', () => {
  it('leaves the default locale unprefixed', () => {
    expect(localizedPath('/', 'en')).toBe('/');
    expect(localizedPath('/privacy/', 'en')).toBe('/privacy/');
  });

  it('prefixes non-default locales', () => {
    expect(localizedPath('/', 'fr')).toBe('/fr/');
    expect(localizedPath('/', 'de')).toBe('/de/');
    expect(localizedPath('/privacy/', 'fr')).toBe('/fr/privacy/');
    expect(localizedPath('/privacy/', 'de')).toBe('/de/privacy/');
  });

  it('is idempotent with respect to trailing slashes', () => {
    expect(localizedPath('/privacy', 'fr')).toBe('/fr/privacy/');
  });
});

describe('canonicalUrl', () => {
  it('builds an absolute URL for each locale', () => {
    expect(canonicalUrl('/', 'en')).toBe('https://nickygrey.com/');
    expect(canonicalUrl('/', 'fr')).toBe('https://nickygrey.com/fr/');
    expect(canonicalUrl('/privacy/', 'de')).toBe('https://nickygrey.com/de/privacy/');
  });

  it('never produces a double slash', () => {
    for (const l of LOCALES) {
      for (const p of ['/', '/privacy/']) {
        expect(canonicalUrl(p, l)).not.toMatch(/([^:])\/\//);
      }
    }
  });
});

describe('hreflangAlternates', () => {
  it('emits one entry per locale plus x-default', () => {
    const alts = hreflangAlternates('/');
    expect(alts.map((a) => a.hreflang)).toEqual(['en', 'fr', 'de', 'x-default']);
  });

  it('points x-default at the default locale', () => {
    const alts = hreflangAlternates('/privacy/');
    const xd = alts.find((a) => a.hreflang === 'x-default');
    const en = alts.find((a) => a.hreflang === 'en');
    expect(xd?.href).toBe(en?.href);
    expect(xd?.href).toBe('https://nickygrey.com/privacy/');
  });

  it('builds correct hrefs for a sub-page', () => {
    const alts = hreflangAlternates('/privacy/');
    expect(alts.find((a) => a.hreflang === 'fr')?.href).toBe('https://nickygrey.com/fr/privacy/');
    expect(alts.find((a) => a.hreflang === 'de')?.href).toBe('https://nickygrey.com/de/privacy/');
  });

  it('produces only absolute URLs', () => {
    for (const a of hreflangAlternates('/')) {
      expect(a.href.startsWith('https://')).toBe(true);
    }
  });
});

describe('ogLocale', () => {
  it('maps each locale to an OpenGraph locale code', () => {
    expect(ogLocale('en')).toBe('en_US');
    expect(ogLocale('fr')).toBe('fr_FR');
    expect(ogLocale('de')).toBe('de_DE');
  });
});

describe('siteJsonLd', () => {
  const ld = siteJsonLd() as any;

  it('is a schema.org graph with a Person and a ProfessionalService', () => {
    expect(ld['@context']).toBe('https://schema.org');
    const types = ld['@graph'].map((n: any) => n['@type']);
    expect(types).toContain('Person');
    expect(types).toContain('ProfessionalService');
  });

  it('names the person exactly as decided', () => {
    const person = ld['@graph'].find((n: any) => n['@type'] === 'Person');
    expect(person.name).toBe('Vyacheslav Plotnikov');
    expect(person.email).toBe('mailto:pv@nickygrey.com');
    expect(person.sameAs).toContain('https://instagram.com/nickygreys');
  });

  it('claims Luxembourg as service area and lists the three services', () => {
    const svc = ld['@graph'].find((n: any) => n['@type'] === 'ProfessionalService');
    expect(svc.areaServed.name).toBe('Luxembourg');
    const offers = svc.hasOfferCatalog.itemListElement.map((i: any) => i.name);
    expect(offers).toEqual(['Cinematography', 'Photography', 'Editing & Colour']);
  });

  it('makes NO address or business-registration claim', () => {
    const json = JSON.stringify(ld);
    expect(json).not.toContain('address');
    expect(json).not.toContain('PostalAddress');
    expect(json).not.toContain('streetAddress');
    expect(json).not.toContain('vatID');
    expect(json).not.toContain('taxID');
  });

  it('links the service to the person by @id rather than duplicating them', () => {
    const person = ld['@graph'].find((n: any) => n['@type'] === 'Person');
    const svc = ld['@graph'].find((n: any) => n['@type'] === 'ProfessionalService');
    expect(person['@id']).toBeTruthy();
    expect(svc.founder['@id']).toBe(person['@id']);
  });

  it('serialises to valid JSON', () => {
    expect(() => JSON.parse(JSON.stringify(ld))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../../src/lib/seo`.

- [ ] **Step 3: Implement**

```ts
// src/lib/seo.ts

export type Locale = 'en' | 'fr' | 'de';

export const LOCALES: readonly Locale[] = ['en', 'fr', 'de'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

/** Absolute origin, no trailing slash. Matches `site` in astro.config.mjs. */
export const SITE = 'https://nickygrey.com';

const PREFIXED = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/** Leading and trailing slash, always. '/privacy' -> '/privacy/' */
function normalise(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Split a pathname into its locale and the locale-independent remainder.
 * The default locale is unprefixed, so anything without a recognised first
 * segment belongs to it. Matching is on the whole segment — '/french-films/'
 * is not locale 'fr'.
 */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const p = normalise(pathname);
  for (const locale of PREFIXED) {
    if (p === `/${locale}/` ) return { locale, path: '/' };
    if (p.startsWith(`/${locale}/`)) return { locale, path: p.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: p };
}

/** Apply a locale prefix to a locale-independent path. */
export function localizedPath(path: string, locale: Locale): string {
  const p = normalise(path);
  return locale === DEFAULT_LOCALE ? p : `/${locale}${p}`;
}

export function canonicalUrl(path: string, locale: Locale, site: string = SITE): string {
  return `${site}${localizedPath(path, locale)}`;
}

/**
 * One entry per locale plus x-default, which tells search engines what to
 * serve a visitor whose language we do not cover.
 */
export function hreflangAlternates(
  path: string,
  site: string = SITE
): Array<{ hreflang: string; href: string }> {
  const alts = LOCALES.map((locale) => ({
    hreflang: locale as string,
    href: canonicalUrl(path, locale, site),
  }));
  alts.push({ hreflang: 'x-default', href: canonicalUrl(path, DEFAULT_LOCALE, site) });
  return alts;
}

const OG_LOCALES: Record<Locale, string> = {
  en: 'en_US',
  fr: 'fr_FR',
  de: 'de_DE',
};

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale];
}

/**
 * Person + ProfessionalService, linked by @id.
 * Deliberately asserts no postal address and no business registration —
 * the entity is an individual professional without a public studio.
 */
export function siteJsonLd(site: string = SITE): object {
  const personId = `${site}/#person`;
  const serviceId = `${site}/#service`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: 'Vyacheslav Plotnikov',
        url: `${site}/`,
        email: 'mailto:pv@nickygrey.com',
        jobTitle: 'Cinematographer, Photographer & Editor',
        image: `${site}/images/og.jpg`,
        sameAs: ['https://instagram.com/nickygreys'],
      },
      {
        '@type': 'ProfessionalService',
        '@id': serviceId,
        name: 'Vyacheslav Plotnikov — Cinematography & Photography',
        url: `${site}/`,
        image: `${site}/images/og.jpg`,
        email: 'mailto:pv@nickygrey.com',
        founder: { '@id': personId },
        areaServed: { '@type': 'Country', name: 'Luxembourg' },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Services',
          itemListElement: [
            { '@type': 'Offer', name: 'Cinematography' },
            { '@type': 'Offer', name: 'Photography' },
            { '@type': 'Offer', name: 'Editing & Colour' },
          ],
        },
      },
    ],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all seo tests green, plus the 28 existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo.ts tests/unit/seo.test.ts
git commit -m "feat: add SEO URL and schema builders"
```

---

### Task 2: Wire the head, and fix the titles

**Files:**
- Modify: `src/layouts/Layout.astro`
- Modify: `src/pages/index.astro`, `src/pages/fr/index.astro`, `src/pages/de/index.astro`
- Modify: `src/pages/privacy.astro`, `src/pages/fr/privacy.astro`, `src/pages/de/privacy.astro`

**Interfaces:**
- Consumes: `stripLocale`, `canonicalUrl`, `hreflangAlternates`, `ogLocale`, `siteJsonLd` from `../lib/seo`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the head elements**

In `Layout.astro`'s frontmatter, derive the current path and locale from `Astro.url`, then render. Add a `Props` field so only homepages emit structured data:

```astro
---
import { stripLocale, canonicalUrl, hreflangAlternates, ogLocale, siteJsonLd } from '../lib/seo';

// ... existing props ...
const { path } = stripLocale(Astro.url.pathname);
const canonical = canonicalUrl(path, lang);
const alternates = hreflangAlternates(path);
const jsonLd = siteJsonLd();
const isHome = path === '/';
---
```

In `<head>`, after the `<title>`:

```astro
<link rel="canonical" href={canonical}>
{alternates.map((a) => (
  <link rel="alternate" hreflang={a.hreflang} href={a.href} />
))}
{isHome && (
  <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
)}
```

Structured data is emitted only on the three locale homepages. Repeating entity markup on every page is a recognised anti-pattern.

- [ ] **Step 2: Fix the OpenGraph block**

Three defects in the existing block, all in `Layout.astro`:

- `og:title` and `twitter:title` are the string `P.V.` — replace both with `{title}`, so they carry the real page title.
- `og:locale` is hardcoded `en_US` on all three languages — replace with `{ogLocale(lang)}`.
- `og:url` is missing entirely — add `<meta property="og:url" content={canonical}>`.

Also point `og:image` and `twitter:image` at `` `${siteUrl}/images/og.jpg` `` (created in Task 4). Add `<meta property="og:image:width" content="1200">` and `<meta property="og:image:height" content="630">` — scrapers use these to lay out the card before fetching the file.

- [ ] **Step 3: Update the default title and description**

In `Layout.astro`'s prop defaults, replace the title default:

```
'P.V. — Cinematographer & Photographer'
```

with:

```
'Vyacheslav Plotnikov — Cinematographer in Luxembourg'
```

Leave the `description` default as it is — it already reads well and mentions Luxembourg.

Do **not** touch `P.V.` in `Header.astro`'s logo or the page loader in `Layout.astro`'s `<body>`. That is deliberate visual branding.

- [ ] **Step 4: Set the six page titles**

Exact strings, character counts verified:

| file | title |
| ---- | ----- |
| `src/pages/index.astro` | `Vyacheslav Plotnikov — Cinematographer in Luxembourg` |
| `src/pages/fr/index.astro` | `Vyacheslav Plotnikov — Cinéaste & Photographe, Luxembourg` |
| `src/pages/de/index.astro` | `Vyacheslav Plotnikov — Kameramann & Fotograf, Luxemburg` |
| `src/pages/privacy.astro` | `Privacy Policy — Vyacheslav Plotnikov` |
| `src/pages/fr/privacy.astro` | `Politique de confidentialité — Vyacheslav Plotnikov` |
| `src/pages/de/privacy.astro` | `Datenschutzerklärung — Vyacheslav Plotnikov` |

Note `Luxemburg` in the German title — that is the German spelling, not a typo. The em dash `—` is U+2014 in all six.

`src/pages/index.astro` currently passes no `title`, relying on the Layout default. Pass it explicitly anyway, so all six pages read the same way.

- [ ] **Step 5: Verify the rendered head**

Run `npm run build`, then inspect the built HTML:

```bash
grep -o '<title>[^<]*</title>' dist/index.html dist/fr/index.html dist/de/index.html
grep -c 'rel="alternate"' dist/index.html          # expect 4
grep -o 'rel="canonical" href="[^"]*"' dist/fr/privacy/index.html
grep -c 'application/ld+json' dist/index.html      # expect 1
grep -c 'application/ld+json' dist/privacy/index.html  # expect 0
grep -o 'og:locale" content="[^"]*"' dist/de/index.html
```

Expected: each title matches the table; four alternates per page; `/fr/privacy/`'s canonical is `https://nickygrey.com/fr/privacy/`; JSON-LD present on homepages only; `og:locale` is `de_DE` on the German page.

- [ ] **Step 6: Run the suite**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all pass; `6 page(s) built`.

- [ ] **Step 7: Commit**

```bash
git add src/layouts/Layout.astro src/pages/
git commit -m "feat: add canonical, hreflang, JSON-LD and searchable titles"
```

---

### Task 3: Sitemap and robots.txt

**Files:**
- Modify: `package.json`, `astro.config.mjs`
- Create: `public/robots.txt`

**Interfaces:**
- Consumes: nothing
- Produces: `dist/sitemap-index.xml`, `dist/sitemap-0.xml`

- [ ] **Step 1: Install the integration**

```bash
npm install @astrojs/sitemap@^3.7.3
```

This is a build-time integration. It emits no runtime JavaScript — Step 4 verifies the bundle is unchanged.

- [ ] **Step 2: Configure it**

In `astro.config.mjs`, import and register the integration. Its `i18n` option is what makes it emit `<xhtml:link rel="alternate" hreflang>` entries inside the sitemap, which is the second place search engines look for translation relationships:

```js
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // ... existing config unchanged ...
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', fr: 'fr', de: 'de' },
      },
    }),
  ],
});
```

Leave the existing `site`, `base`, `output`, `build` and `i18n` blocks exactly as they are.

- [ ] **Step 3: Create robots.txt**

```
User-agent: *
Allow: /

Sitemap: https://nickygrey.com/sitemap-index.xml
```

Written to `public/robots.txt` so it is copied to the site root verbatim.

- [ ] **Step 4: Verify**

```bash
npm run build
ls dist/sitemap-index.xml dist/sitemap-0.xml dist/robots.txt
grep -c '<loc>' dist/sitemap-0.xml        # expect 6
grep -c 'hreflang' dist/sitemap-0.xml     # expect > 0
```

Expected: both sitemap files and `robots.txt` exist; six `<loc>` entries, one per built page; hreflang entries present.

Then confirm the bundle is unchanged — read the gzip figures from the build output and check the `engine` chunk is still ~54.9 kB and that no new JavaScript chunk appeared. If a new chunk did appear, stop and report it: that would mean the integration is shipping runtime code, which contradicts the reason it was chosen.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs public/robots.txt
git commit -m "feat: add sitemap and robots.txt"
```

---

### Task 4: Correctly sized og:image

The current social preview is 7.04 MB — over X/Twitter's and LinkedIn's ~5 MB limits — so shares render with no image at all.

**Files:**
- Create: `public/images/og.jpg`
- Test: `tests/unit/og-image.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `public/images/og.jpg` at 1200×630

- [ ] **Step 1: Generate the image**

`sharp` 0.33.5 is already installed as an Astro dependency. Run this once from the repo root; commit the output rather than generating at build time, since the source photograph rarely changes:

```bash
node -e "
const sharp = require('sharp');
sharp('public/images/slava new-6 (1).jpg')
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('public/images/og.jpg')
  .then(i => console.log('wrote', i.width + 'x' + i.height, Math.round(i.size/1024) + 'kB'));
"
```

`fit: 'cover'` with `position: 'attention'` crops to the most visually salient region rather than the geometric centre, which matters when cropping a portrait orientation source to a 1.91:1 card.

Expected output: `1200x630`, roughly 150–250 kB. If it lands above 400 kB, lower `quality` to 75 and re-run.

- [ ] **Step 2: Write the assertion test**

```ts
// tests/unit/og-image.test.ts
import { describe, it, expect } from 'vitest';
import { statSync, readFileSync } from 'node:fs';

const OG = 'public/images/og.jpg';

/** Read intrinsic size from the JPEG SOF marker — no image library needed. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker found');
}

describe('og:image', () => {
  it('exists', () => {
    expect(() => statSync(OG)).not.toThrow();
  });

  it('is 1200x630, the aspect ratio every platform crops to', () => {
    expect(jpegSize(readFileSync(OG))).toEqual({ width: 1200, height: 630 });
  });

  it('is comfortably under the 5MB platform limit', () => {
    const kb = statSync(OG).size / 1024;
    expect(kb).toBeLessThan(1024);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: PASS — three og:image tests, plus everything from Tasks 1–3.

- [ ] **Step 4: Commit**

```bash
git add public/images/og.jpg tests/unit/og-image.test.ts
git commit -m "feat: add correctly sized og:image"
```

The 6.7 MB `slava new-6 (1).jpg` stays in place — other things may reference it, and removing it is not this task's job.

---

### Task 5: Built-output verification

The earlier tasks assert their own pieces. This one asserts the *built site* is correct, which is the only thing search engines ever see.

**Files:**
- Create: `tests/build/build-output.test.ts`
- Modify: `vitest.config.ts`, `package.json`

**Interfaces:**
- Consumes: `dist/` produced by `npm run build`
- Produces: an `npm run test:build` script

- [ ] **Step 1: Separate this suite from the fast unit tests**

These tests read `dist/`, so they only pass after a build. Keeping them in the
default `npm test` would make the fast unit suite fail on a clean checkout,
which is a trap for anyone running tests before building.

Give them their own directory and script. In `vitest.config.ts`, widen the
include to cover both:

```ts
include: ['tests/unit/**/*.test.ts', 'tests/build/**/*.test.ts'],
```

In `package.json`, scope the existing script and add a second:

```json
"test": "vitest run tests/unit",
"test:build": "vitest run tests/build"
```

`npm test` stays fast and standalone; `npm run test:build` is the one that
requires a prior `npm run build`.

- [ ] **Step 2: Write the test**

```ts
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
```

- [ ] **Step 3: Run it**

Run: `npm run build && npm run test:build`
Expected: PASS. Then run `npm test` on its own and confirm it still passes
**without** a prior build — that is the trap Step 1 exists to avoid.

- [ ] **Step 4: Commit**

```bash
git add tests/build/build-output.test.ts vitest.config.ts package.json
git commit -m "test: assert built output SEO correctness"
```

---

## Verification Summary

```bash
npm test           # fast unit suite: seo, og-image + the 28 pre-existing. No build needed.
npm run build      # must report 6 page(s) built
npm run test:build # asserts dist/ — requires the build above
npm run test:e2e   # 6 motion tests must stay green
```

Manual checks automation does not cover: paste the deployed URL into a social-preview debugger to confirm the card renders, and submit `sitemap-index.xml` in Google Search Console.

## Known Follow-Ups (out of scope)

- `public/images/hero.jpg` is 1.6 MB and `slava new-6 (1).jpg` is 6.7 MB. Page speed is a ranking factor, and these outweigh the entire 60.66 kB JavaScript bundle by more than 100×.
- Backlink acquisition is off-site work: IMDb credits, client and production company sites, Vimeo and YouTube profiles, film festival listings, Luxembourg creative directories, Behance, LinkedIn, and collaborators crediting back.
