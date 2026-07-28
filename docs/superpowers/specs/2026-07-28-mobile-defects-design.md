# Mobile Defect Fixes — Design

**Date:** 2026-07-28
**Status:** Design approved in conversation; this document pending review
**Repo:** `nickygrey/Artistic-portfolio` (the `astro-portfolio` tree)
**Branch:** `fix/mobile-defects`

## Problem

The site is responsive and the motion and SEO work already apply at every
width, but an audit of the live site at 390×844 found three defects specific to
mobile. All three were measured, not inferred.

Each is invisible to the current test suite, which runs almost entirely at
desktop width. The motion work's final review named this exact gap: *"every
blocker is a viewport or interaction the e2e suite never visits."* These are
that prediction coming true.

### 1. The page scrolls sideways

`document.scrollWidth` is 414px against a `clientWidth` of 390px.

Traced to `.photo-carousel`, which uses
`margin: 0 calc(-1 * clamp(24px,5vw,72px))` to bleed edge-to-edge. That is a
negative margin on both sides, making the element **438px wide inside a 390px
viewport**.

A visible symptom: the hamburger menu button is clipped at the right screen
edge. `.nav-toggle` measures 8px past the viewport, and `nav.header` reports a
width of 414px — both consequences of the document being wider than the screen.

### 2. Most photographs are unreachable

`#photo-carousel` has `scrollWidth: 1559` against `clientWidth: 438`, with
`overflow-x: hidden`. Roughly **72% of the strip cannot be reached** except via
the JavaScript drag handler.

Under `prefers-reduced-motion` the marquee does not run at all, so those
photographs are not merely hard to reach — they are unreachable by any means.

### 3. Seven tap targets are below the minimum

Apple's Human Interface Guidelines and Google's Material guidance both specify
44×44px as the minimum touch target.

| element | text | measured |
| ------- | ---- | -------- |
| `a.logo` | `p.v.` | 41×34 |
| `button.nav-toggle` | — | 40×40 |
| `a.youtube-link` | `Watch on YouTube ↗` | 140×22 |
| `a.archive-link` | `Full archive ↗` | 86×20 |
| footer `a` | `Privacy` | 44×17 |
| footer `a` | `@nickygreys` | 75×17 |
| footer `a` | `pv@nickygrey.com` | 112×17 |

## What already works

Worth recording so it is not disturbed: motion reveals fire correctly at mobile
width, no element is stuck at `opacity: 0`, there are no JavaScript errors,
Lenis is correctly not constructed on touch, and the header theme inversion
built for the hero renders correctly.

## Non-goals

- Mobile-specific motion tuning — reveal distances, durations, parallax
  intensity calibrated for small screens. Subjective, and needs the owner's eyes
  on a real device.
- Layout or section-ordering changes. Mobile stays a responsive adaptation, not
  a separate design.
- The English meta descriptions still served on the French and German pages.
  Real, but a separate piece of work needing translated copy.

## Design

### 1. Full-bleed without overflow

Replace the negative-margin bleed with the technique that cannot exceed the
viewport:

```css
.photo-carousel {
  width: 100%;
  margin-inline: calc(50% - 50vw);
  max-width: 100vw;
}
```

This reaches both screen edges at every width while the element's box stays
within the viewport. The clipped hamburger resolves itself, being a symptom of
the same 24px.

**One caveat to verify rather than assume:** on desktop `100vw` includes the
scrollbar width, so this can reintroduce a small overflow on platforms with
classic scrollbars. The implementation must confirm no horizontal scroll appears
at desktop widths as well as mobile.

### 2. Infinite native swipe on touch

On touch devices the carousel becomes natively scrollable, keeps auto-advancing,
and never reaches an end.

```css
overflow-x: auto;
-webkit-overflow-scrolling: touch;
```

**The auto-advance drives `scrollLeft`, not `transform`.** This is the decision
that makes everything else work. The original conflict was two independent
mechanisms driving one visual axis — the marquee translating `.carousel-track`
while scrolling moved the container. `PhotoCarousel.astro` documents it at the
drag handler: *"otherwise the GSAP xPercent tween keeps advancing underneath the
user's scrollLeft drag and the strip visibly slides under their [finger]"*.

Driving the mobile auto-advance through `scrollLeft` collapses the two
mechanisms into one. The user's finger and the automatic motion move the same
property, so they cannot fight, and the strip can auto-scroll *and* be swipeable
at the same time.

**The loop is seamless because the track is already duplicated.**
`PhotoCarousel.astro` renders `photos.map(...)` twice (lines 10 and 22) — two
identical copies of the seven photographs, which is why the desktop marquee
travels `xPercent: 50`. When `scrollLeft` passes half of `scrollWidth`, subtract
half: the content at that position is pixel-identical, so the reset is invisible
and the strip never ends. The same wrap runs in both directions, so a user
swiping backwards past zero also continues seamlessly.

**No scroll-snap.** Snapping fights a continuously running auto-advance, and
this is a photo strip rather than a paged carousel. Momentum alone is the right
feel.

**The JavaScript drag handler is disabled on touch.** It sets
`carousel.scrollLeft` manually; with native scrolling also active both would
move the strip and it would travel roughly double the intended distance. Native
scroll replaces it. Desktop is untouched — it keeps the `transform` marquee and
the drag handler exactly as they are.

**Auto-advance pauses while the finger is down** and resumes shortly after
release, reusing the pause/resume mechanism the marquee handler already exposes.

Under `prefers-reduced-motion` the auto-advance does not run at all, but the
strip remains natively swipeable — so every photograph stays reachable, which is
the case that is currently broken.

### 3. Hit areas, not visual sizes

Every undersized target is fixed by expanding its touchable region with padding
and absorbing that padding with an equal negative margin, so nothing moves
visually:

```css
@media (hover: none) and (pointer: coarse) {
  .logo { padding: 5px; margin: -5px; }
}
```

The design renders identically; only the region that responds to a finger grows.
Where a negative margin would disturb a flex or grid layout, the implementation
should verify position rather than assume, and prefer adjusting the element's
own box.

The `(hover: none) and (pointer: coarse)` query is the same one the motion
engine uses for `isTouch()`, keeping one definition of "touch device" across the
codebase.

## Testing

A new Playwright spec at 390×844 with `isMobile` and `hasTouch`, asserting:

- `document.documentElement.scrollWidth <= clientWidth` — no sideways scroll
- every carousel slide is reachable by scrolling `#photo-carousel`
- the loop wraps: scrolling past half of `scrollWidth` returns `scrollLeft` to
  the first half without the visible content changing, and scrolling backwards
  past zero wraps the other way — asserted by comparing the rendered position of
  a known slide before and after a wrap, not merely by checking that
  `scrollLeft` changed
- the seven named targets each measure at least 44px in both dimensions

**On the scope of the tap-target assertion.** It covers standalone controls —
links, buttons and form fields that stand on their own line or in their own
region. It deliberately does **not** assert a blanket rule over every anchor on
the page: a link inside a paragraph of body copy inherits the line height of the
prose around it, and forcing it to 44px would break the text flow it lives in.
All seven current failures are standalone controls, so the distinction changes
nothing today, but writing the assertion as a blanket rule would make it fail
the first time someone links a word inside a sentence — a false failure that
would train people to weaken the test.

**Each assertion must be verified to fail when its fix is reverted.** A test that
passes both before and after a deliberate break proves nothing — that is exactly
how the white-on-white mobile navigation shipped during the motion work.

The existing suites must stay green: 56 unit, 42 build-output, 6 Playwright.

## Risks

1. **`100vw` and desktop scrollbars.** The full-bleed fix could introduce at
   desktop what it removes at mobile. Verified at both widths, not just mobile.
2. **Native scroll and the drag handler double-moving.** Mitigated by disabling
   the handler on touch, which must be verified on a real touch emulation rather
   than reasoned about.
3. **iOS momentum and the seam.** On iOS, setting `scrollLeft` programmatically
   during momentum scrolling can cancel the momentum. A fast flick that crosses
   the halfway wrap point could therefore stop dead at the seam instead of
   gliding through it. This is the one risk that cannot be reasoned away and
   must be tested on a real device or a faithful touch emulation. If it does
   interrupt, the fallback is to defer the wrap until scrolling settles —
   accepting that the strip can briefly reach its true end during a very fast
   flick, rather than visibly stuttering on every one.

## Expected outcome

No horizontal scroll at any width. Every photograph reachable on a phone,
including under reduced motion. Every control comfortably tappable. And a test
suite that visits mobile, so these cannot silently return.
