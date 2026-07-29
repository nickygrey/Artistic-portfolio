# WebGL Cinematic Direction — Design

**Date:** 2026-07-29
**Status:** Design approved in conversation; this document pending review
**Repo:** `nickygrey/Artistic-portfolio` (the `astro-portfolio` tree)
**Branch:** `feat/webgl-cinematic`
**Reference:** hashgraphvc.com

## Goal

Make the site genuinely striking by putting WebGL shaders on the photography —
a dark cinematic ground where the work appears to emit light, hero displacement
driven by scroll, and a shader dissolve when a project opens.

## The reference, and what does not transfer

hashgraphvc.com is Nuxt + Lenis with a full-viewport WebGL2 canvas on a
near-black `rgb(0, 2, 9)` ground, three custom typefaces, a dominant 10px UI
scale, and an audio gate on entry. The page does not scroll until that gate is
passed.

**Its architecture is a response to having nothing to show.** Hashgraph is a
venture firm with no photographs, films, or product; the WebGL geometry fills
the space where content would be, and the spectacle is the substance because
there is no other.

This portfolio has the opposite situation. The photography is the substance.
So the reference's *materials* transfer — near-black ground, WebGL, Lenis
(already installed), tight technical UI type — while its *structure* does not.
There is no entry gate and no full-viewport abstract scene. Every shader is
applied to a photograph.

## Decisions taken

| decision | choice |
| --- | --- |
| Theme | Dark by default; the existing toggle stays |
| WebGL scope | Hero and Selected Work only |
| Library | OGL |

## Ground

Dark becomes the default. The current dark palette (`--color-bg: #141210`)
deepens toward near-black so photographs read as emitting light rather than
sitting on paper.

**The ground stays warm.** Hashgraph's `#000209` is a cool blue-black; this
site's identity is warm and its accent is gold. A cool ground would fight that
accent. The starting value is `#0b0a09`.

The exact value is an implementation decision, but not a free one — it must
satisfy two measurable criteria. Body text at `--color-text` must clear 7:1
contrast against it (AAA for body copy, since this is a reading surface as well
as a gallery), and the gold accent must clear 4.5:1. Any warm near-black
meeting both is acceptable; the choice within that range is judged against the
real photographs.

The light theme remains available and must stay legible, but it is no longer
the design target.

**One consequence to be explicit about.** `Layout.astro:56-57` currently
resolves the theme as `stored || (prefersDark ? 'dark' : 'light')`. Making dark
the default means a visitor whose system prefers light, and who has never
touched the toggle, now lands on dark. That is the intent of the decision, but
it is a deliberate override of a system preference and should be recorded as
such.

**The sepia filter is removed.** `.plate` currently applies
`filter: sepia(0.22) saturate(0.82) contrast(1.05)` to every image. The entire
premise of this direction is that the photography glows against near-black; a
desaturating, contrast-flattening filter directly opposes that. It also
contradicts the site's own claim that the work is "finished, colour and cut,
in-house".

The 6px `--color-surface` border stays for now. In dark theme that token is
`#1e1c19`, so the border reads as dark-on-dark rather than as a bright frame.
Whether it earns its place is a judgement to make once the ground is in.

## Library

**OGL**, 33 kB gzip, last published January 2025.

Measured alternatives: `three` is 178 kB gzip, which would take the bundle from
60.66 kB to roughly 239 kB for a use case that needs no scene graph, no
lighting, and no 3D camera. `curtainsjs` is purpose-built for syncing shaders
to DOM images and would save writing that layer, but was last published in May
2024; a stale dependency sitting in the render loop is a worse trade than
writing roughly a hundred lines of DOM synchronisation.

## The two effects

**Hero.** A displacement shader over `.hero-img`, driven by scroll velocity,
with fine film grain. Subtle at rest, pronounced while scrolling. The intent is
that the image reads as being *filmed* rather than displayed.

**Selected Work.** On hover, the card image ripples and displaces toward the
cursor. On click, it dissolves through a shader transition into full view
rather than cutting.

The photo carousel, Featured Reel and About portrait are deliberately
untouched. They already work, and restraint is what keeps two effects feeling
deliberate rather than decorative.

## Integration: the hard part

Both WebGL targets sit underneath elements that GSAP is already transforming.

- `SelectedWork.astro:54` — `.project-scale` carries
  `data-animation="scale" data-from="1.15" data-to="1" data-scrub`, so it is
  continuously transformed as the page scrolls.
- `Hero.astro:14` — `.hero-bg` runs the custom `hero` handler, which composes
  zoom and parallax onto `.hero-img` in a single timeline.

A WebGL canvas positioned from static layout geometry will therefore drift out
of registration with the image it is supposed to be replacing. The canvas must
track the element's **live transformed rect**, re-read per frame from the same
`gsap.ticker` that already drives Lenis — not from a cached `getBoundingClientRect`
and not from its own RAF loop.

This is the same class of problem as the transform-ownership bug already
documented in this codebase, where GSAP's inline writes silently defeated CSS
hover rules. The lesson recorded there applies here: **one system owns a given
visual property at a time**, and where two must cooperate, the coupling has to
be explicit and measured rather than assumed.

## Degradation

`AGENTS.md` states the governing rule: an element's resting DOM state must be
its fully-revealed state. That applies with more force here than anywhere else
in the project.

The `<img>` elements stay in the DOM, in normal layout, fully visible and
unmodified. WebGL renders over them. Nothing initialises when:

- WebGL context creation fails, or the GPU is blacklisted
- `prefers-reduced-motion: reduce` is set
- the device is judged low-powered (see below)

In every one of those cases the visitor sees the photographs exactly as they
render today. A client on a locked-down corporate laptop must never be shown a
blank rectangle where the work should be.

**Low-power detection** is by measurement, not by assumption. Over the first
second of rendering, frame times are sampled; if the effective rate falls below
**50fps** — the same threshold the verification section asserts — the effects
tear themselves down and the DOM images remain. The touch query the motion
engine already uses for `isTouch()`, `(hover: none) and (pointer: coarse)`, is
available as a signal but is not on its own a reason to disable: a recent phone
that holds 50fps should keep the effects.

Teardown must be complete, following the rule this codebase already enforces
for the motion engine — the WebGL context, its ticker callback, and every
listener the effect registered are released, leaving no leak behind a
disabled feature.

## Cost

**60.66 kB → approximately 100 kB gzip**, comprising OGL at 33 kB plus shader
and synchronisation code.

That is roughly 20× the 5.06 kB this site shipped before any of this project's
work. This is the third accepted increase and the largest single one. Recorded
plainly rather than buried: the site's 1.6 MB `hero.jpg` still outweighs the
entire JavaScript payload by more than 16×, and remains the better performance
target.

## Verification

Shader output cannot be asserted through computed style, so verification is
behavioural:

- WebGL context creates successfully and the canvas paints a non-blank frame
- with WebGL forcibly disabled, every photograph is still visible and correctly
  positioned
- under `prefers-reduced-motion: reduce`, no WebGL context is created at all
- the canvas stays in registration with its image while scrolling, asserted by
  comparing the canvas rect against the live transformed image rect mid-scroll,
  not at rest
- frame rate holds above 50fps on a mid-range mobile profile
- existing suites stay green: 56 unit, 42 build-output, 21 Playwright

## Risks

1. **The dissolve is where this succeeds or fails.** A mediocre shader dissolve
   looks worse than a clean cut. It needs iteration against the real
   photographs, not a demo texture.
2. **Mobile GPU cost is unknown until measured.** Two shader surfaces on a
   mid-range Android is an open question. If frames drop, hero-only on mobile is
   the fallback.
3. **Canvas/image registration under GSAP transforms** is the most likely place
   for a subtle, hard-to-spot bug — drift that only appears mid-scroll, which is
   precisely the state prior verification on this project repeatedly failed to
   sample.
4. **This is the least reversible change made to the site.** Motion and SEO were
   additive. This alters what the site fundamentally is.

## Non-goals

- An audio gate, sound design, or a full-viewport abstract WebGL scene.
- Shaders on the photo carousel, Featured Reel or About portrait.
- Replacing Cormorant Garamond or the existing layout structure.
- Removing the light theme.

## Follow-ups, unchanged and still open

- The French and German pages serve English meta descriptions.
- `public/images/hero.jpg` is 1.6 MB and `slava new-6 (1).jpg` is 6.7 MB.
- Two carried mobile minors: a mid-gesture clone-trim jump, and a broken image
  permanently disabling the landscape clone check.
