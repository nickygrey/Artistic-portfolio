# Image-Led Cinematic Direction — Design

**Date:** 2026-07-29
**Status:** Design approved in conversation; this document pending review
**Repo:** `nickygrey/Artistic-portfolio` (the `astro-portfolio` tree)
**Branch:** `feat/webgl-cinematic`
**Supersedes:** `2026-07-29-webgl-cinematic-design.md`, whose content is absorbed here
**Reference:** hashgraphvc.com (materials, not structure)

## Goal

Make a single-page portfolio that sells the work, by putting far more of the
photography on the page at a scale that respects it, on a dark ground, with
WebGL applied where it makes an image more arresting.

## The constraint that shapes everything

**One page. No per-project pages, no CMS, no new routes.** This is the owner's
decision and it is a reasonable one — plenty of excellent photographer
portfolios are a single page.

It does mean the page itself has to carry more. The site currently shows one
hero, seven photographs in a 340px-tall strip, and four video thumbnails —
three of which are YouTube's automatically generated `maxresdefault.jpg` frame
grabs, and one of which is a file still named
`Screenshot 2026-07-19 at 12.25.53.png`.

For a photographer, that is very little photography, presented small. The fix
is not more pages. It is more of his imagery, larger.

## Architecture

```
hero                 full-bleed · WebGL displacement
─ disciplines ─
BAND 1               full-bleed · 100vh · pure image
─ selected work ─    chosen frames · WebGL hover + dissolve
BAND 2               full-bleed · 100vh
─ about ─
photo strip          retained, enlarged
BAND 3               full-bleed · 100vh
─ services · testimonials · contact · partners ─
```

**Bands** are the new element: one photograph filling the entire viewport, with
nothing on it, three to five times down the page. On near-black at full width
this is what stops a visitor scrolling. It is a more photographic move than any
shader.

Bands are pure image. If a frame needs a caption to land, it belongs in the
strip instead.

### A revision to the proposal as first presented

The design was originally described as replacing the 340px photo strip with a
multi-row gallery. **That is revised: the strip is kept and enlarged.**

Two reasons. First, three distinct photo-presentation modes on one page —
monumental bands, a grid, and a strip — is one mode too many; the page would
read as a catalogue of layouts. Keeping bands (monumental) and the strip
(kinetic) gives two clear registers.

Second, the strip is not cheap code. It is an endless `scrollLeft`-driven
marquee that auto-advances, is swipeable on touch, wraps seamlessly by a
DOM-measured period, and clones copies at runtime so the loop holds in
landscape. Discarding that to build a grid would throw away working, hard-won
behaviour to solve a problem the bands already solve.

## The image pipeline — required, not optional

Images currently live in `public/images/`, which means Astro does nothing to
them. That is why `hero.jpg` ships at 1.6 MB and `slava new-6 (1).jpg` at
6.7 MB.

Twenty-plus full-bleed photographs at that weight would be tens of megabytes,
on a page whose JavaScript budget has been argued over at 100 kB.

**Images move to `src/assets/` and render through Astro's `<Image>` component.**
Astro then generates AVIF and WebP at multiple widths and serves each device
what it needs. Sharp is already a project dependency. The 1.6 MB hero should
land around 150–250 kB, and every new photograph gets the same treatment
automatically.

**This must be in place before any band is added.** Building the layout first
would produce a beautiful page that takes twenty seconds to load, and would
make the pipeline work harder afterwards.

## Image brief

Supplied by the owner. Originals only — full quality straight from export, not
pre-compressed; starting from a compressed file only loses quality the pipeline
would otherwise preserve.

| slot | count | orientation | minimum | notes |
| --- | ---: | --- | --- | --- |
| Bands | 3–5 | landscape | 3000px wide | strongest frames; each carries a full screen alone |
| Strip | 12–20 | any | 2000px long edge | mixed orientation is good — it gives the strip rhythm |
| Film frames | 4 | 16:9 | 1920×1080 | one per project, chosen by the owner |

The four film frames replace the three YouTube auto-grabs and the screenshot in
Selected Work. This is the highest-impact single change on the list and needs no
new architecture.

## Sequencing around unsupplied assets

The build must not block on the owner selecting images.

Work proceeds in this order: the pipeline first, converting the images already
in the repository; then the band component and layout, using existing
photographs as stand-ins; then the dark ground; then WebGL. Real imagery is
dropped in as it arrives, replacing stand-ins one file at a time.

Every stage is therefore shippable on its own, and no stage waits on a
selection decision.

## Ground

Dark becomes the default; the existing toggle stays. The current dark palette
(`--color-bg: #141210`) deepens toward a warm near-black, starting from
`#0b0a09`.

The ground stays warm deliberately. Hashgraph's `#000209` is a cool blue-black,
and this site's identity is warm with a gold accent that a cool ground would
fight.

The exact value must satisfy two measurable criteria: body text at
`--color-text` clears **7:1** contrast against it, and the gold accent clears
**4.5:1**. Any warm near-black meeting both is acceptable; the choice within
that range is judged against the real photographs.

`Layout.astro:56-57` currently resolves the theme as
`stored || (prefersDark ? 'dark' : 'light')`. Making dark the default means a
visitor whose system prefers light, and who has never touched the toggle, now
lands on dark. That is intended, and is a deliberate override of a system
preference.

**The sepia filter is removed.** `.plate` applies
`filter: sepia(0.22) saturate(0.82) contrast(1.05)` to every image. The premise
of this direction is that photography glows against near-black; a desaturating,
contrast-flattening filter directly opposes it, and it contradicts the site's
own claim that the work is "finished, colour and cut, in-house".

## WebGL

**OGL**, 33 kB gzip, last published January 2025. Measured alternatives: `three`
is 178 kB gzip for a use case needing no scene graph, lighting or 3D camera;
`curtainsjs` is purpose-built for this but was last published May 2024, and a
stale dependency in the render loop is a worse trade than writing roughly a
hundred lines of DOM synchronisation.

Two effects only:

- **Hero** — displacement driven by scroll velocity, with fine film grain.
  Subtle at rest, pronounced while scrolling; the image should read as being
  filmed rather than displayed.
- **Selected Work** — on hover the card image ripples and displaces toward the
  cursor; on click it dissolves through a shader transition into full view
  rather than cutting.

**Bands get no shaders.** A photograph filling the screen does not need help,
and restraint is what keeps the two effects feeling deliberate.

## Integration: the hard part

Both WebGL targets sit underneath elements GSAP already transforms.

- `SelectedWork.astro:54` — `.project-scale` carries
  `data-animation="scale" data-from="1.15" data-to="1" data-scrub`, so it is
  continuously transformed while scrolling.
- `Hero.astro:14` — `.hero-bg` runs the custom `hero` handler, which composes
  zoom and parallax onto `.hero-img` in one timeline.

A canvas positioned from static layout geometry will drift out of registration
mid-scroll. The canvas must track each element's **live transformed rect**,
re-read per frame from the same `gsap.ticker` that already drives Lenis — not
from a cached `getBoundingClientRect`, and never from its own RAF loop.

This is the same class of problem as the transform-ownership bug already
documented in this codebase, where GSAP's inline writes silently defeated CSS
hover rules. The rule that came out of it applies here: one system owns a given
visual property at a time, and where two must cooperate the coupling is
explicit and measured rather than assumed.

## Degradation

`AGENTS.md` states the governing rule: an element's resting DOM state must be
its fully-revealed state.

The `<img>` elements stay in the DOM, in normal layout, fully visible. WebGL
renders over them and never replaces them. Nothing initialises when WebGL
context creation fails, when `prefers-reduced-motion: reduce` is set, or when
measured frame rate falls below **50fps** over the first second of rendering.

Device class is not on its own a reason to disable — a recent phone holding
50fps keeps the effects. Teardown must release the context, its ticker callback
and every listener, leaving no leak behind a disabled feature.

A client on a locked-down corporate laptop must never see a blank rectangle
where the work should be.

## Cost

JavaScript: **60.66 kB → approximately 100 kB gzip** (OGL plus shader and
synchronisation code). That is roughly 20× the 5.06 kB this site shipped before
any of this project's work, and the third accepted increase.

Images will dominate total page weight. Twenty-plus photographs even at 200 kB
each is several megabytes across the full page. Lazy loading below the fold and
Astro's responsive sizing keep the *initial* load reasonable, but total weight
rises substantially. That is the correct trade for a photography portfolio, and
it is stated rather than buried.

## Verification

- Every image renders through `<Image>`; no photograph is served from
  `public/images/` in a page-visible position
- Largest single image transferred on initial load is under 400 kB
- WebGL context creates and paints a non-blank frame
- With WebGL forcibly disabled, every photograph is visible and correctly
  positioned
- Under `prefers-reduced-motion: reduce`, no WebGL context is created
- Canvas stays in registration with its image **mid-scroll**, asserted by
  comparing the canvas rect against the live transformed image rect while
  scrolling — not at rest
- Frame rate holds above 50fps on a mid-range mobile profile
- Body text clears 7:1 and the gold accent 4.5:1 against the final ground
- Existing suites stay green: 56 unit, 42 build-output, 21 Playwright

## Risks

1. **The dissolve is where this succeeds or fails.** A mediocre shader dissolve
   looks worse than a clean cut, and needs iteration against real photographs
   rather than a demo texture.
2. **Total page weight.** The pipeline mitigates but does not eliminate it; a
   page of full-bleed photography is heavy by nature.
3. **Canvas/image registration under GSAP transforms** is the likeliest place
   for a subtle bug — drift appearing only mid-scroll, which is precisely the
   state prior verification on this project repeatedly failed to sample.
4. **Mobile GPU cost is unknown until measured.** If frames drop, hero-only on
   mobile is the fallback.
5. **This is the least reversible change made to the site.** Motion and SEO were
   additive; this alters what the site fundamentally is.

## Non-goals

- Per-project pages, a CMS, or any new route.
- An audio gate, sound design, or a full-viewport abstract WebGL scene.
- Shaders on the bands, the photo strip, the Featured Reel or the About
  portrait.
- Replacing Cormorant Garamond, or removing the light theme.
- Replacing the photo strip with a grid — see the revision note above.

## Follow-ups, unchanged and still open

- The French and German pages serve English meta descriptions.
- Two carried mobile minors: a mid-gesture clone-trim jump, and a broken image
  permanently disabling the landscape clone check.
- The Google Drive "Full archive" link remains. It is out of scope here, but it
  reads as unfinished on a professional portfolio and is worth revisiting.
