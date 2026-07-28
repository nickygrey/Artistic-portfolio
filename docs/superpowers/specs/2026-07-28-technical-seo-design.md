# Technical SEO Foundation — Design

**Date:** 2026-07-28
**Status:** Design approved in conversation; this document pending review
**Repo:** `nickygrey/Artistic-portfolio` (the `astro-portfolio` tree)

## Problem

The site is live at nickygrey.com with no technical SEO. A backlink audit
returned Domain Strength 0 and Page Strength 0, which prompted this work.

Backlinks cannot be manufactured — they are earned or bought, and buying them
is penalised. This spec covers only what the repo controls: the on-page and
technical foundation that makes earned links count and stops the site
suppressing its own discovery.

Audit of the current state found every fundamental missing:

| item | state |
| ---- | ----- |
| `sitemap.xml` | absent |
| `robots.txt` | absent |
| canonical URLs | absent |
| `hreflang` | absent, across three locales |
| structured data | absent |
| `og:image` | 7.04 MB — over X/Twitter and LinkedIn limits |
| title tag | 37 characters, built on unsearchable initials |

Two of these are actively harmful rather than merely missing:

**The og:image is 7.04 MB.** X/Twitter caps at 5 MB and LinkedIn at roughly
the same, so shares of the site render with no preview image — a bare link.
Bare links get fewer clicks, and fewer clicks means fewer people arriving to
link onward. It is a link-acquisition problem wearing an image problem's
clothes.

**Missing hreflang across three locales.** Every page exists in `en`, `fr` and
`de` with nothing declaring them translations of one another. Search engines
may treat them as duplicate content, pick one, and suppress the rest — so the
French and German pages compete with the English rather than reinforcing it.

## Goal

Ship the technical SEO foundation: crawlability, correct multilingual
signalling, structured data, working social previews, and title tags that
target what people actually search.

## Non-goals

- Acquiring backlinks. Not possible from the repo, and paid links are harmful.
- Content or copy rewriting beyond title tags.
- Redesign of any kind.

## Identity decision

The site currently presents four names: `P.V.` (14 uses), `nickygrey` (10),
`Vyacheslav Plotnikov` (8), `nickygreys` (7). Search engines resolve entities
partly by consistency, so four competing names work against recognition.

**Decision: `Vyacheslav Plotnikov` is the canonical name.** It is distinctive
enough to rank first for itself, already appears in the copyright and `author`
meta, and matches the film credits and directory listings that future backlinks
will come from. It replaces `P.V.` in the title tag, `og:title`, `author` meta
and JSON-LD `name`.

`P.V.` remains as visual branding in the header logo and page loader. This is
deliberate: the visual identity is unchanged, only the machine-readable
identity is unified.

## Title tags

Homepage titles target the 50–60 character window and include the location
term, which is the highest-intent keyword for a local service business.
French and German use the role terminology already present in
`src/i18n/translations.ts`, and the German spelling `Luxemburg`.

| page | title | chars |
| ---- | ----- | ----: |
| `/` | `Vyacheslav Plotnikov — Cinematographer in Luxembourg` | 52 |
| `/fr/` | `Vyacheslav Plotnikov — Cinéaste & Photographe, Luxembourg` | 57 |
| `/de/` | `Vyacheslav Plotnikov — Kameramann & Fotograf, Luxemburg` | 55 |
| `/privacy` | `Privacy Policy — Vyacheslav Plotnikov` | 37 |
| `/fr/privacy` | `Politique de confidentialité — Vyacheslav Plotnikov` | 51 |
| `/de/privacy` | `Datenschutzerklärung — Vyacheslav Plotnikov` | 43 |

Privacy pages are not ranking targets and are exempt from the window.

## Architecture

Following the pure/effectful split that `AGENTS.md` codifies, so the logic is
unit-testable without Astro or a browser:

```
src/lib/seo.ts           — pure builders: canonical URL, hreflang alternates,
                           JSON-LD object. No Astro APIs, no I/O.
src/layouts/Layout.astro — renders what seo.ts returns into <head>
astro.config.mjs         — @astrojs/sitemap with i18n configuration
public/robots.txt        — static
public/images/og.jpg     — generated 1200×630, replaces the 7 MB file
```

`src/lib/seo.ts` exists because hreflang construction is where this silently
goes wrong. The default locale `en` is unprefixed while `fr` and `de` are
prefixed, so every URL is an off-by-one-slash risk. A wrong hreflang is worse
than none — it actively tells search engines the wrong thing.

### Dependency decision

`@astrojs/sitemap` is added as a **build-time** dependency. It emits no runtime
JavaScript and does not affect the 60.66 kB bundle. `AGENTS.md` requires
dependency additions to be deliberate; this one is justified because the
integration handles i18n sitemap entries across three locales correctly, and
hand-rolling that means owning its correctness permanently for no benefit.

## Head output

Per page:

- one `<link rel="canonical">` — absolute, matching the page's own locale
- `<link rel="alternate" hreflang>` for `en`, `fr`, `de`, **and `x-default`**

`x-default` tells search engines which version to serve a visitor whose
language is not covered. Omitting it is a common oversight and leaves that
choice to a guess.

## Structured data

A `Person` for Vyacheslav Plotnikov — `jobTitle`, `email`, and `sameAs`
pointing at the Instagram profile — associated with a `ProfessionalService`
carrying the three services from `translations.ts` (Cinematography,
Photography, Editing & Colour) and `areaServed: Luxembourg`.

**No postal address and no business registration claims.** The entity is an
individual professional without a public studio address. JSON-LD is a set of
factual assertions to search engines; inventing an address would be fabricating
data they treat as true.

Emitted **once per locale homepage only**, not on every page. Repeating entity
markup across every page of a site is a recognised anti-pattern.

## The og:image

Generate a 1200×630 JPEG at roughly 150–250 kB, committed as
`public/images/og.jpg`, sourced from `public/images/slava new-6 (1).jpg` —
the photograph the current `og:image` already points at, so the social preview
keeps showing the same picture and only its size and filename change.

1200×630 is the aspect ratio X, LinkedIn and Facebook all crop to. The clean
filename matters too: the current file is `slava new-6 (1).jpg`, whose spaces
and parentheses require URL-encoding that some scrapers handle poorly. The old
file stays in place so nothing referencing it breaks.

## Verification

- `npm run build` emits `sitemap-index.xml` and `sitemap-0.xml` containing all
  six pages.
- Unit tests on `src/lib/seo.ts` covering canonical and hreflang correctness for
  every locale/page combination, including the unprefixed-default case.
- Parse each built page's JSON-LD: valid JSON, required fields present, no
  address field.
- Assert `og.jpg` is 1200×630 and under 1 MB.
- Assert every homepage title is 50–60 characters.
- After deploy, `curl` the live URLs and confirm they resolve.

## Risks

1. **Wrong hreflang is worse than none.** Mitigated by unit-testing the URL
   construction rather than eyeballing the rendered output.
2. **Invalid JSON-LD is silently ignored** by search engines — no error, no
   warning, just no rich results. Mitigated by parsing the built output.
3. **Title changes affect existing rankings.** The site is days old with
   essentially no ranking history, so the risk is negligible now and would not
   be later. This is the right moment to make the change.

## Expected outcome, stated honestly

This will not move Domain Strength from 0. Only earned links do that.

What it does: stops the three language versions competing with each other,
makes the site eligible for rich results, gives crawlers a proper map, targets
the location keyword that carries client intent, and fixes the broken social
previews currently suppressing shares. It is the foundation that makes each
earned link count for more.

## Follow-up, out of scope

- `public/images/hero.jpg` is 1.6 MB and `slava new-6 (1).jpg` is 6.7 MB. Page
  speed is a ranking factor and these dominate the site's weight — far more
  than the 60.66 kB JavaScript bundle.
- Backlink acquisition is off-site work: IMDb credits, client and production
  company sites, Vimeo and YouTube profiles, film festival listings, Luxembourg
  creative directories, Behance, LinkedIn, and collaborators crediting back.
