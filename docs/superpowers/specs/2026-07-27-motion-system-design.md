# Motion System — Design

**Date:** 2026-07-27
**Status:** Design approved in conversation; this document pending review
**Repo:** `nickygrey/Artistic-portfolio` (the `astro-portfolio` tree)
**Branch:** `feat/motion-system`

## Problem

The site's motion is a collection of unrelated effects: CSS keyframe reveals,
a hand-rolled scroll listener in `Hero.astro`, a CSS marquee in
`PhotoCarousel.astro`, and IntersectionObserver reveals in `Layout.astro`. Each
was added independently, so durations, easings and travel distances do not
agree.

That inconsistency is what makes a site read as generic. No single effect is
wrong; they simply do not feel authored by one hand. Motion that shares a
timing vocabulary reads as deliberate, and deliberate is the whole difference.

## Goal

One motion system, driven by shared tokens, applied across all ten sections,
with the feel of the reference site (ayocin.com): weighted smooth scroll,
scrub-linked parallax, and staged text reveals.

## Non-goals

- Bespoke WebGL/product-demo set pieces. The reference's `star-mask`,
  `3d-showcase` and `chained-lamp` effects exist to sell a lamp; they do not
  transfer to a portfolio.
- Restructuring section layout or content. This is additive motion on the
  existing design.
- Redesigning typography, colour or spacing.

## Reference analysis

ayocin.com runs GSAP + ScrollTrigger + Lenis, with Flip and Observer present.
No Three.js. Animations are declared in markup via `data-animation`, and the
vocabulary is small — six primitives cover 124 of 133 usages:

| primitive | usages |
| --------- | -----: |
| `moveUp`  |     52 |
| `split`   |     32 |
| `parallax`|     16 |
| `fade`    |     13 |
| `scale`   |      7 |
| `marquee` |      4 |

Scroll parameters ride alongside: `data-start`, `data-end`, `data-scrub`,
`data-speed`, `data-stagger`, `data-delay`, `data-from`, `data-to`, `data-ease`.

Three mechanics beyond the primitives are worth adopting: `--cursor-x` /
`--cursor-y` CSS variables on `<html>`, `data-header-theme` for scroll-driven
header inversion, and scrub-pinned sections via `data-end="+=100%"`.

## Decisions

**Smooth scroll: yes.** It is the defining characteristic of the reference
feel. Consequence: Lenis owns scroll position, so the existing
IntersectionObserver reveals and hand-rolled scroll listeners cannot remain —
they would compete for the same signal. Full migration is forced, not chosen.

**Lenis over ScrollSmoother.** Both are free. ScrollSmoother requires a
`#smooth-wrapper > #smooth-content` DOM structure that must survive View
Transition swaps, which complicates `ClientRouter`. Lenis needs no DOM
restructuring, is ~5kb, and is what the reference actually ships.

**Architecture: hybrid.** A declarative attribute engine for the six
primitives, sharing one token scale, plus a registration API for bespoke
per-section timelines against the same GSAP/Lenis instance. Same upfront cost
as a pure declarative engine, no ceiling later.

**GSAP SplitText is used, not hand-rolled.** GSAP became free including all
plugins in April 2025, and SplitText was rewritten with built-in resize
re-splitting and accessibility handling. This removes the riskiest piece of
the build.

## Cost

`gsap` (core + ScrollTrigger + SplitText) and `lenis`: **≈33kb gzip**.

Measured baseline: the site currently ships **5.06kb gzip** of JS (Astro's
ClientRouter alone). This is roughly a 7× increase in JS payload. Accepted, but
it is the real price of the feature and must be re-measured after build.

## Architecture

```
src/motion/
  tokens.ts      — easing, duration, distance scale (no dependencies)
  primitives.ts  — the six primitives
  engine.ts      — Lenis + ScrollTrigger wiring, DOM scan, lifecycle
  index.ts       — public API: initMotion(), registerMotion()
```

`tokens.ts` is the consistency guarantee. Every primitive draws its timing from
it, so sections cannot drift apart. A change there is a change everywhere.

### Lifecycle

The highest-risk area, because `ClientRouter` swaps the DOM under the system.

- Lenis is constructed **once** and persists across navigations.
- `lenis.on('scroll', ScrollTrigger.update)`; RAF is driven by `gsap.ticker`,
  not a second loop.
- On `astro:before-swap`: kill all ScrollTriggers, revert SplitText instances.
- On `astro:page-load`: rescan the DOM, rebuild triggers, reset scroll position.

Leaked ScrollTriggers across navigation are the classic failure mode. Explicit
teardown is the mitigation, and the thing to test hardest.

### Primitives

| attribute | parameters | behaviour |
| --------- | ---------- | --------- |
| `moveUp`  | `data-delay`, `data-stagger` | y 40→0 with fade, on enter |
| `split`   | `data-stagger`, `data-delay` | SplitText lines, y 100%→0, clipped |
| `parallax`| `data-speed` | scrub-linked drift |
| `fade`    | `data-delay` | opacity |
| `scale`   | `data-from`, `data-to` | scale settle |
| `marquee` | `data-speed`, `data-marquee="0\|1"` | infinite loop, velocity-reactive |

Any element additionally accepts `data-start`, `data-end`, `data-scrub`,
`data-ease`.

## Section treatment

**Hero** (priority). Background parallax and the existing load-zoom composed
into a single timeline. This structurally fixes a current bug: the scroll
handler at `Hero.astro:318` writes `transform: translateY(...)`, overwriting
the `scale(1.02) → scale(1)` zoom from lines 69–75, so the zoom dies on first
scroll. Headline uses `split` on load; tagline, description and CTAs stagger
via `moveUp`; the scroll indicator fades out on scroll. `data-header-theme="dark"`
applies while the hero is in view.

**PhotoCarousel** (priority). The CSS `seamlessScroll` keyframe is replaced by
a GSAP marquee that reads scroll velocity — scrolling fast accelerates the
strip and skews it slightly. This is the single most expensive-feeling touch on
the reference and needs tuning against real photographs; it is easy to overdo.
Existing drag and lightbox behaviour is preserved.

**SelectedWork** (priority). Cards reveal with staggered `moveUp`. Images
`scale` 1.15→1 on scrub, settling slowly as they pass.

**Remaining seven sections**, explicitly:

| section | treatment |
| ------- | --------- |
| `DisciplinesStrip` | `split` on the line, word stagger |
| `FeaturedReel` | `split` heading; `parallax` on the reel poster, speed 0.6 |
| `About` | `split` heading; `moveUp` stagger on paragraphs; `scale` 1.08→1 on the portrait |
| `Services` | `split` heading; `moveUp` stagger across service cards |
| `Testimonials` | `split` heading; `fade` stagger on quotes |
| `Contact` | `split` heading; `moveUp` stagger on form fields |
| `Partners` | `fade` stagger on logos |

## Removals

- `Layout.astro`: `initScrollAnimations()` and `initParallax()`
- `Hero.astro`: the scroll listener (lines 302–326)
- `global.css`: `.reveal`, `.reveal-scale`, `.reveal-blur`, `.section-reveal`,
  `.hero-animate` and their keyframes
- `global.css`: `@keyframes seamlessScroll`
- `global.css`: `html { scroll-behavior: smooth }` — actively conflicts with Lenis

## Accessibility and mobile

All motion is declared inside `gsap.matchMedia()` gated on
`(prefers-reduced-motion: no-preference)`. Under reduced motion, elements are
rendered in their final state and Lenis never initialises.

Lenis is disabled on touch devices, where it degrades native scrolling.
Reveals remain; parallax speeds are halved.

## Verification

- `npm run build` passes.
- Reduced motion on and off: content is fully visible and readable in both.
- Mobile viewport at 390px.
- View Transition navigation across all **six** built pages — index and privacy
  in en/fr/de — checking for leaked ScrollTriggers on repeated back-and-forth.
- Lighthouse before and after, to quantify the JS increase against the 5.06kb
  baseline.

## Risks

1. **ScrollTrigger leakage across View Transitions.** Mitigated by explicit
   teardown; still where bugs are most likely to appear.
2. **Bundle size.** 7× the current JS. Measured, accepted, re-checked at the end.
3. **Marquee velocity tuning.** Subjective and easy to overdo; requires
   iteration against real content.

## Out of scope, noted

Found while surveying, not part of this work:

- `Layout.astro:61` preloads a Cormorant Garamond `v16` gstatic URL that 404s.
  The font still loads via the stylesheet on line 63, so the effect is a wasted
  request and a console error.
- `public/images/hero.jpg` is 1.7MB and marked `fetchpriority="high"`.
- The outer `design_handoff_portfolio/src/` tree is a stale duplicate of this
  repo, registered as a gitlink with no `.gitmodules`.
