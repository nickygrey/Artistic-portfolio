# Aperture Redesign — Design

Date: 2026-10-21
Status: awaiting owner review
Reference: https://www.project-aperture.com (studied in a real browser on 2026-10-21)

## Revision — 2026-10-21, during milestone 1

The owner narrowed the site to photography only. This overrides anything below that says otherwise.

- **Two galleries, from the owner's own selection** in `FOR PORTFOLIO/`:
  - **Portraits** (`/work/portrait/`): 7 images, world oxblood `#2b1512` with sky `#9fc3d6`.
  - **Film** (`/work/film/`): 6 film scans from 2024, world teal `#0f2a2e` with apricot `#e8a57a`.
- **Removed:** Cinematography, Documentary and Photography; all film frame grabs and YouTube "Play film" links; the frame-grab script. The credits schema keeps its optional `film` field, but nothing uses it.
- **Image handling:** originals are copied in with EXIF rotation baked in, metadata stripped, and the long edge capped at 3200px. Gallery widths stop at 1600, because the 2400w WebP broke the 400 kB image budget.
- **Still the owner's call:** whether the header eyebrow should keep "Cinematographer" now that the site shows only photography.

## Goal

Replace the single long page with a quiet, image-first site in the language of Project Aperture, so that it:

1. no longer reads as a template: one distinct identity, one motion rhythm;
2. puts the work first: images carry the home page and the galleries, with almost no text;
3. wins brand and agency clients: credits, services, clients and a contact form are one click or one scroll away, but never compete with the images.

The engine stays: Astro 5 static output, plain CSS, the `src/motion/` system (GSAP + Lenis), the `src/webgl/` surface layer (ogl), i18n (en/fr/de), the SEO layer and the test setup. No new npm dependencies. GSAP 3.15 already ships Draggable, InertiaPlugin, Observer and Flip.

## Decisions made during brainstorming

| Topic | Decision |
| --- | --- |
| Scope | New design, same engine |
| Primary audience | Brands and agencies |
| Home | Pure Aperture strips (option A), with a **single-color tint** on hover instead of full color |
| Galleries | One per discipline: Cinematography, Documentary, Portrait, Photography |
| Gallery layout | Scatter canvas, no text in grid view; credits only in single view |
| About / Contact | About prose and portrait, plus a quiet sales layer below (option B) |
| Rendering | Real HTML images; WebGL draws effects over them and is optional |
| Theme | Dark only. Light/dark toggle removed |
| Images | Folder per discipline that the owner fills over time, plus frame grabs from the owner's films |

## 1. Pages and routes

| Page | Route (en) | fr / de |
| --- | --- | --- |
| Home | `/` | `/fr/`, `/de/` |
| Gallery ×4 | `/work/<discipline>` | `/fr/work/<discipline>`, `/de/work/<discipline>` |
| About + Contact | `/about` (form anchored at `#contact`) | `/fr/about`, `/de/about` |
| Privacy | `/privacy` | `/fr/privacy`, `/de/privacy` |

Discipline slugs are English in every locale (`cinematography`, `documentary`, `portrait`, `photography`); only display names are translated. That keeps hreflang alternates a pure locale-prefix swap, as `src/lib/seo.ts` already assumes.

A gallery with zero images is not built and its strip is not shown on the home page. A discipline appears automatically once its folder has at least one image.

Single view is part of the gallery page, not a separate route. Its state lives in the query string, `?frame=<n>` (1-based, by display order). A URL with `?frame` opens directly in single view, so a specific frame can be shared. An out-of-range or non-numeric value falls back to grid view.

### Header (every page)

Left: "V. Plotnikov", linking home. Centre: an eyebrow in small spaced capitals, "Cinematographer · Photographer — Luxembourg" (translated). Right: `Work · About · Contact` and a quiet `EN · FR · DE` switch. "Work" goes home; "Contact" goes to `/about#contact`. On phones the centre eyebrow moves to a vertical label on the left edge, as in the reference, and the right group stays inline because there are only three short words.

### Footer

There's no global footer, matching the reference. The copyright line and the Privacy link sit at the bottom of About and Privacy, and the contact form also links to Privacy (GDPR notice at the point of collection).

### Retired

The long-page sections are removed: Hero, FeaturedReel, SelectedWork, PhotoCarousel and its lightbox, Services, Testimonials, Partners and DisciplinesStrip, along with the theme toggle. Their content moves:

- The showreel becomes a frame in Cinematography with "Play film".
- The four films become frames in Documentary with credits.
- The testimonials shrink to one quote on About.
- The partners become the "Worked with" list.
- The Google Drive "Full archive" link moves to About's "What I do" column as "Full archive ↗".

## 2. Visual system

### Color worlds

Each discipline has a deep background (`bg`) and an opposite-hue accent (`accent`). The accent is used for:

- the home-strip tint;
- all gallery type and the controls;
- the discipline's inline link color in About prose.

Contrast ratios are accent on bg.

| World | bg | accent | Contrast |
| --- | --- | --- | --- |
| Neutral (home, about, privacy) | `#1c191b` | `#efeae2` | 14.6:1 |
| Cinematography | `#22142a` | `#cfe07a` | 12.2:1 |
| Documentary | `#0f2a2e` | `#e8a57a` | 7.3:1 |
| Portrait | `#2b1512` | `#9fc3d6` | 9.2:1 |
| Photography | `#14251a` | `#c7b2e0` | 8.3:1 |

All of these pass WCAG AAA for body text. Worlds are applied by a `data-world="<slug>"` attribute on `<html>`, which sets `--world-bg` and `--world-accent`. Everything else derives from those two values with `color-mix()`: control borders at 35% accent, dividers at 13% off-white. No other raw color values appear in components.

### Type

- **Display:** Cormorant Garamond 400 and 500. Used for the gallery titles, the About name and the home-strip labels.
- **Everything else:** Satoshi 400 and 500. Used for UI, body, eyebrows and credits.
- Lora is retired.
- Both families are self-hosted as WOFF2 subsets (Latin plus Latin Extended, enough for French and German) under `public/fonts/`, with `font-display: swap`, preloaded on every page, with metric-matched fallbacks to avoid layout shift.
- Google Fonts is removed entirely.
- Satoshi is under the ITF Free Font License (commercial use allowed). The license file ships alongside the fonts.

| Role | Font | Size (fluid, clamp) | Case and tracking |
| --- | --- | --- | --- |
| Gallery title | Cormorant 400 | 44 → 72px | Sentence case, −0.01em |
| About name | Cormorant 400 | 40 → 64px | — |
| Strip label | Cormorant 400 | 18 → 22px | — |
| Nav | Satoshi 400 | 13px | Uppercase, +0.02em |
| Eyebrow, credit, hints | Satoshi 500 | 10px | Uppercase, +0.22em |
| Body | Satoshi 400 | 15 → 17px | Line-height 1.6, measure ≤ 62ch |

Tokens live in `src/styles/global.css`, which is rewritten. The old light/dark token sets go.

## 3. Components

| Component | Purpose | Depends on |
| --- | --- | --- |
| `Layout.astro` | `<html data-world>`, fonts, header, ClientRouter, motion and WebGL lifecycle (the existing double `initMotion()` rule is kept) | — |
| `Header.astro` | Rewritten: nav, eyebrow, locale switch. No theme logic | i18n |
| `HomeStrips.astro` | The four strips. Each is an `<a>` to its gallery wrapping a grayscale `<img>` with its accent as `--tint` | `disciplines.ts`, gallery loader |
| `GalleryCanvas.astro` + `gallery/canvas.ts` | Grid view: scatter layout, drag, wheel, keys, wrap | `scatter.ts`, motion |
| `GallerySingle.astro` + `gallery/single.ts` | Single view: stage, rail, counter, credit line, `?frame` sync | gallery loader |
| `GalleryControls.astro` | Back/close round button and Grid/Single pill | — |
| `AboutIntro.astro` | Name, prose, bracketed portrait | i18n |
| `AboutDetails.astro` | Three columns: What I do, Worked with, Kind words | i18n |
| `ContactForm.astro` | Four underline fields. Posts to the existing Formspree endpoint `xwvgojzz` with fetch, and has inline success and error states. Without JS it falls back to a normal form POST | i18n |

### Pure modules (unit-tested, no DOM)

- **`src/lib/disciplines.ts`:** slug, display-name key, `bg`, `accent`, year range, cover-image selector.
- **`src/lib/gallery.ts`:** builds a discipline's frame list from its folder and optional credits file (see section 5). It handles ordering, credit lookup and a missing credits file.
- **`src/gallery/scatter.ts`:** `scatter(frames, tile, seed) → positions`. It's a deterministic jittered-grid layout with no overlaps, minimum gaps proportional to frame size, and stable output for a given seed, so builds are reproducible.
- **`src/gallery/wrap.ts`:** wrap math for the endless canvas, mapping canvas offset to tile-relative positions.
- **`src/gallery/frame-param.ts`:** parses and serializes `?frame`.

## 4. Motion and WebGL

All durations, easings and distances come from `src/motion/tokens.ts`, extended with these new tokens:

- `DRAG`: inertia resistance and wheel multiplier.
- `TRANSITION`: strip-to-gallery and grid-to-single durations.
- `BEND`: maximum velocity bend.

No values are written inline.

### Home

- Strips reveal by opening from their centre line (`clip-path`), staggered with `STAGGER.base`.
- On hover or focus, the strip takes its accent tint:
  - **Base layer (always present):** CSS `mix-blend-mode: multiply` of the grayscale image over the accent.
  - **WebGL layer, when available:** a duotone-plus-ripple shader replaces the CSS layer.
- On click, an Astro View Transition with a shared `transition:name` on the strip image and the gallery's first frame. The `<html>` world colors cross-fade, then the gallery frames scatter out from the shared frame.

### Gallery grid

- **Input:** Draggable plus InertiaPlugin for drag, and Observer for wheel and trackpad. Arrow keys pan by one frame step.
- **Endless canvas:** the canvas wraps when the scatter tile is larger than the viewport in that axis. Otherwise it's bounded with soft edges.
- **WebGL:** a velocity bend shader on every visible frame, through the existing surface system (`registerSurface`), which settles to flat on stop.
- **Opening a frame:** a click (not a drag) opens single view. The `isPlainPrimaryClick` helper in `src/lib/click.ts` keeps modifier clicks native.

### Single view

- Flip animates the chosen frame from its grid position to the stage, other frames fade, and the rail slides in.
- Left and right arrows step through frames, Escape returns to grid, and the URL updates with `history.replaceState`.

### About

SplitText line reveal on the prose, and the portrait brackets draw in.

### Lifecycle

Every Draggable, Observer and listener created by the gallery is registered with motion teardown (`astro:before-swap`). The existing e2e leak test is extended to count Draggables and Observers, not just ScrollTriggers.

### Reduced motion

- No ripple, no bend, no inertia; dragging still works 1:1.
- Strips appear without the reveal.
- Page and view changes are cross-fades.
- Lenis is not constructed, as today.

### Touch devices

- Home strips stack vertically: full-width bands, as in the reference's mobile view.
- Galleries render as a staggered two-column layout with native vertical scroll. No canvas drag, but tap still opens single view, where swipe steps between frames.
- The bend shader is off. The strip tint shows on tap and press.

### No WebGL or a weak GPU

The existing `supported()` check and the 50fps guard decide. The CSS tint stays, and nothing else changes.

### Accessibility

- Frames are `<button>` elements whose alt text comes from the credit, or a discipline-generic fallback. Tab order is display order.
- Single view announces "Frame n of N" through a polite live region.
- Focus returns to the originating frame on Escape.
- An element's resting DOM state is its fully revealed state (existing rule).

## 5. Content pipeline

### Folder structure

```
src/content/galleries/
  cinematography/   01-showreel.jpg, 02-....jpg   ← owner drops images here
  cinematography.yaml                             ← optional credits
  documentary/ …   documentary.yaml
  portrait/ …      portrait.yaml
  photography/ …   photography.yaml
```

- Any `jpg`, `jpeg`, `png` or `webp` in a folder appears in its gallery, ordered by filename. Prefixes like `01-` exist purely to set order.
- Images go through `astro:assets`: responsive WebP at 480/960/1600/2400 widths, with intrinsic size known at build time so there's no layout shift. The scatter layout uses each image's real aspect ratio.
- The credits file is optional, and so is every entry in it. A frame with no entry simply has no credit line.

```yaml
- file: 01-showreel.jpg
  title: Showreel 2026
  client:            # optional
  roles: [camera, edit, colour]   # keys, translated via i18n
  film: https://www.youtube.com/watch?v=…   # optional → "Play film ↗"
  alt: Night river with a white bird in the shallows
```

- Role keys are a closed list translated in `translations.ts`: `camera`, `lighting`, `edit`, `colour`, `direction`, `interview`, `photography`. An unknown key fails the build with a message naming the file and line.
- **The home-strip cover** is the first image in the folder, unless the credits file marks one with `cover: true`.

### Frame grabs

`scripts/grab-frames.sh <video-file-or-YouTube-URL> <discipline> [count]` extracts evenly spaced frames, or frames at given timestamps with `--at 00:01:12,00:02:40`, as high-quality JPEGs into the discipline folder. It uses `ffmpeg` (installed) and `yt-dlp` (to install with `brew install yt-dlp`). It's a local tool, never part of the build. Original video files give better frames than YouTube, so the script accepts both.

### Starting content

The existing photos, portrait and hero image are moved into the folders. The four films (Audience and the three Ugegraff interviews) become Documentary frames with credits and film links. The owner adds more images over time; nothing in the design depends on a minimum count.

## 6. i18n and SEO

- All new strings go in `src/i18n/translations.ts` for en, fr and de. French and German copy is drafted, and should be checked by a native speaker before launch.
- `seo.ts` already provides canonical and hreflang. New routes are added to the sitemap automatically by `@astrojs/sitemap`.
- Each gallery gets a title, description and OG image (its cover). Single view keeps the gallery canonical (`?frame` is excluded from the canonical).
- **Privacy text updates in all three languages:**
  - Remove the Google Fonts paragraph.
  - Remove the theme-preference storage line, so the site stores nothing in the browser.
  - Bump "Last updated".

## 7. What happens to existing code

| Keep as is | Keep, extend | Rewrite | Delete |
| --- | --- | --- | --- |
| `motion/engine.ts`, `primitives.ts`, `index.ts`; `webgl/renderer.ts`, `surface.ts`, `geometry.ts`; `lib/seo.ts`, `lib/click.ts` | `motion/tokens.ts` (new tokens); `i18n/translations.ts`; `Layout.astro` | `global.css`, `Header.astro`, page files, `Footer.astro` (becomes the About and Privacy bottom line) | `Hero`, `FeaturedReel`, `SelectedWork`, `PhotoCarousel`, `Services`, `Testimonials`, `Partners`, `DisciplinesStrip`, `About`, `Contact`; `webgl/shaders/hero.ts`, `work.ts`; `lib/hero-image.ts`, `lib/photos.ts` |

New shaders: `webgl/shaders/tint.ts` (duotone and ripple) and `webgl/shaders/bend.ts` (velocity bend).

`_old-july-site/` is untouched.

## 8. Testing and quality gates

### Unit (Vitest)

- `scatter`: no overlaps, gap minimum, determinism, aspect fidelity, 1 frame, 60 frames.
- `wrap` math.
- `frame-param` parsing.
- The gallery loader: ordering, missing YAML, partial entries, unknown role key error, `cover`.
- `disciplines` contrast: every pair is at least 7:1, computed in the test, so a future palette edit can't silently break it.
- New shader specs, following the pattern of the existing shader tests.
- The existing `tokens`, `primitives`, `seo`, `geometry`, `og-image` and `origin-consistency` tests are kept.

### Build (Vitest on `dist/`)

- Every route exists in all three locales.
- An empty discipline produces no route and no strip.
- No request to `fonts.googleapis.com` or `fonts.gstatic.com` remains.

### E2E (Playwright)

- Home to gallery navigation, with world colors applied.
- Grid to single, with `?frame` deep link, keyboard (Tab, Enter, arrows, Escape), and focus return.
- Reduced-motion run.
- No-WebGL run (context blocked).
- Touch-device run at 375px.
- The contact form with the Formspree request mocked: success and error states.
- The leak test across 10 navigations: ScrollTriggers, Draggables and Observers back to baseline.
- Locale switch keeps the current page.

### Retired e2e

`lightbox.spec`, `theme.spec` and `header-contrast.spec` test removed features. `anchor-scroll`, `modifier-click`, `lifecycle`, `mobile` and `webgl` are rewritten for the new pages.

### Before merge (per CLAUDE.md roles)

1. Screenshots at 375, 768 and 1440px of every page type.
2. `/impeccable critique` and `audit`.
3. `break-ui` with worst-case content: one frame, 60 frames, a 40-character German title, a missing credit.
4. AccessLint WCAG 2.2.
5. Chrome DevTools traces on home and a gallery.
6. A `web-design-guidelines` final pass.

### Performance budgets

On a mid-range mobile profile:

- LCP under 2.5s, CLS under 0.05, INP under 200ms.
- Client JS, gzip, measured on the built `dist/`:
  - **Home, About, Privacy:** at most 90 kB. The current site ships about 88 kB, so this is no regression.
  - **Gallery:** at most 125 kB. Draggable, InertiaPlugin, Flip and Observer add about 31 kB and are imported only by the gallery modules, never by `Layout.astro`.
- No frame request above 2400w.

## 9. Build order (milestones)

Each milestone leaves `main`-ready, passing tests:

1. **Foundation:** tokens, self-hosted fonts, Layout and Header rewrite, the world mechanism, the content folders and loader, starting content moved in, old sections deleted. Pages render unstyled but correct in all locales.
2. **Home:** strips, CSS tint, reveal, stacked mobile layout.
3. **Gallery grid:** scatter, drag, wheel, keys, wrap, touch two-column layout.
4. **Single view:** Flip, rail, `?frame`, keyboard, credits, Play film.
5. **About and Contact:** intro, details, form, privacy updates.
6. **WebGL and transitions:** tint and bend shaders, strip-to-gallery shared-element transition, world cross-fade.
7. **Quality pass:** the full gate list in section 8, and the frame-grab script.

## 10. Open items for the owner

These are content to supply or confirm. They don't block design or build, because placeholders are clearly marked in the YAML and translations.

1. **"Worked with" list:** Ugegraff and Momentum were inferred from the current site. Confirm, or give the real list.
2. **"Available across Europe"** on About: confirm or reword.
3. **Year ranges** per discipline (currently placeholders: 2019–2026, 2023–2026, 2021–2026, 2018–2026).
4. **Which testimonial** is the one quote (default: "Professional, patient, and truly understands how to capture the essence of a moment.").
5. **More images** per discipline, added over time into the folders. Original video files for frame grabs, if available.
6. **A native check** of the French and German copy before launch.
