# Handoff: Vyacheslav Plotnikov — Portfolio (single-page)

## Overview
A single-page personal portfolio for a Luxembourg-based cinematographer / photographer / editor. Editorial, book-like aesthetic ("Classical" design system). One long scrolling page: sticky nav → hero → disciplines strip → featured showreel → selected-work grid → about → services → contact (with form) → footer.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look and behavior, **not production code to ship directly**. The task is to **recreate this design in the target codebase's environment** (React/Next, Vue, Astro, plain HTML, etc.) using its established patterns, then wire the real backend for the contact form. If no environment exists yet, pick the most appropriate framework and implement there.

Note: the prototype is authored as a "Design Component" (`.dc.html`) that runs on a small internal runtime — do not attempt to reuse that runtime. Read `Portfolio 1A.dc.html` for exact markup/styles; the `class Component` block at the bottom holds the data (projects, services, socials) and the contact-form submit handler.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, layout and interactions. Recreate pixel-accurately using the codebase's libraries. All visual values derive from the Classical design system stylesheet — `_ds/classical-.../styles.css` (copied into this bundle as `styles.css`). Prefer wiring the target app's own tokens to match these values rather than hard-coding hexes.

## Screens / Views
Single view, top to bottom:

1. **Sticky nav** — full-width, `position: sticky; top: 0`, translucent bg (`color-mix(bg 88%, transparent)`) + `backdrop-filter: blur(8px)`, 1px bottom divider. Left: name wordmark (Cormorant, 22px). Right: anchor links Reel / Work / About / Services + `@nickygreys` (accent). Links hidden below 900px.
2. **Hero** — kicker ("Cinematographer · Photographer · Editor — Luxembourg", 13px uppercase, accent-700, letter-spacing .09em). Display headline "Images made / with patience." in Cormorant 400, `clamp(56px,9vw,116px)`, line-height 1.0, `margin-left:-.04em`. Sub-paragraph (Lora, max 56ch). Two buttons: primary "View the reel" (anchor `#reel`), ghost "Instagram".
3. **Disciplines strip** — 4-col grid separated by 1px right borders: Cinematography/Motion, Photography/Stills, Editing/The cut, Colour/Grade. Collapses to 2-col < 900px. Bounded top and bottom by hairline rules.
4. **Featured showreel** (`#reel`) — kicker "Featured" + "The showreel" title + "Watch on YouTube ↗" link. One wide `.plate` image, `aspect-ratio: 21/9`, dark gradient overlay, centered circular play button (64px, ▶) that fills accent on hover. Links to the featured video.
5. **Selected work** (`#work`) — kicker "Selected work" + "Full archive ↗" (Google Drive). 2-col grid (1-col < 900px) of project cards: `.plate` 16:9 thumbnail + category kicker + Cormorant title + "Watch ↗". Whole card links to the YouTube video (new tab). Two outline tags below.
6. **About** (`#about`) — 5fr/7fr grid (stacks < 900px). Left: portrait image (`.plate`, aspect 4/5) — a fillable slot prefilled with `slava new-6 (1).jpg`. Right: kicker + Cormorant headline + two justified Lora paragraphs.
7. **Services** (`#services`) — tinted band (`--color-neutral-100`) bounded by hairlines. 3-col grid (1-col < 900px): numbered (01/02/03, accent) with hairline, Cormorant title, justified body. Cinematography / Photography / Editing & Colour.
8. **Contact** (`#contact`) — 5fr/7fr grid. Left: kicker + "Let's make something." + copy + ghost social buttons (Instagram, YouTube, Full archive, Email). Right: contact form — 2-col field grid: Name, Email, Project type (full width), Message textarea (full width), primary "Send enquiry" button. Uses design-system `.field` / `.input` classes.
9. **Footer** — 1px top divider, copyright left, `@nickygreys` + email right.

## Interactions & Behavior
- **Nav / hero buttons**: in-page smooth-scroll anchors (`html { scroll-behavior: smooth }`, respects `prefers-reduced-motion`).
- **Project cards & featured**: `<a target="_blank" rel="noopener">` to YouTube watch URLs (with `&t=` deep-links preserved). On hover the `.plate` gains `--shadow-md` (transition .25s). Featured play button scales 1.06 and fills accent on hover.
- **Contact form**: `onSubmit` prevents default, builds a `mailto:` URL with subject `Project enquiry — <name>` and a body containing name/email/project type/message, then sets `window.location.href`. **Replace with a real form backend** (POST to an endpoint / form service) in production. Email target is currently `hello@example.com` — swap for the real address.
- **Thumbnails**: sourced from YouTube (`https://img.youtube.com/vi/<id>/maxresdefault.jpg`) with a JS `onerror` fallback chain maxresdefault → sddefault → hqdefault. In production, prefer self-hosted still frames for reliability and quality.
- **Responsive**: single breakpoint at 900px (grids collapse to 1–2 col, nav links hide, hero shrinks). Layout otherwise fluid via `clamp()`.

## State Management
Minimal. Static content arrays (projects, disciplines, services, socials) — move to CMS/props/data file. Only dynamic behavior is the contact-form submit handler. No data fetching in the prototype.

## Design Tokens
From the Classical system (`styles.css`, `:root`):
- **Colors**: bg `#f3f2f2`; text `#201f1d`; accent `#b68235` (mono scheme). Tonal ramps `--color-neutral-100…900` and `--color-accent-100…900` (use accent-700 for accent-colored small text/body — accent base is only ≥3:1, fine for large text/chrome). Dividers: `--color-divider`. Tinted band: `--color-neutral-100`.
- **Typography**: headings `--font-heading` = "Cormorant Garamond" (weight 400 at display sizes — bold avoided); body `--font-body` = "Lora". Kickers 13px, uppercase, letter-spacing .09em, tabular figures. Body justified with `hyphens: auto` at comfortable measure.
- **Spacing**: `--space-*` scale (density 1.15×). Section padding uses `clamp()` (e.g. `clamp(56px,7vw,96px)`).
- **Radius**: `--radius-*` (base 4px).
- **Shadows**: `--shadow-sm/md/lg` (subtle — elevation is "a whisper"). Used on card hover only.
- **Rules**: 1px `--color-divider` hairlines carry structure; color applied as stroke/borders, never large fills. Images wrapped in `.plate` (warm archival mat).

## Assets
- **Portrait**: `uploads/slava new-6 (1).jpg` (bundled). Portrait orientation, used at aspect 4/5.
- **Video thumbnails**: pulled live from YouTube by video ID (see project list). IDs: `0Wb-eaG1Vio` (Audience — Documentary), `uqHGwlVwo8c` (Nadine Robert interview), `ozb0hqq4Udg` (Tetiana Popyk interview), `xN6xxZU8gqY` (Sarah Mandres interview). Recommend replacing with self-hosted stills.
- **Fonts**: Cormorant Garamond + Lora via Google Fonts.
- **Icons**: design system specifies Lucide (https://lucide.dev). Prototype uses a ▶ glyph and ↗ arrows inline.
- **Social / links**: Instagram `@nickygreys` (https://instagram.com/nickygreys); Google Drive archive folder (link in file).

## Files
- `Portfolio 1A.dc.html` — the full design (markup + inline styles at top, data + form handler in the `class Component` block at the bottom).
- `styles.css` — the Classical design-system tokens + component classes (`.btn`, `.plate`, `.tag`, `.field`, `.input`, `.card`, etc.). Source of every color/font/spacing value.
- `image-slot.js` — the fillable-image web component used for the portrait (design-tool only; in production just use a normal `<img>`).
- `slava new-6 (1).jpg` — the portrait asset.
