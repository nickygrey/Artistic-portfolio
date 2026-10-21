# Aperture Redesign — Milestone 6: WebGL and Transitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the WebGL layer the spec promises, on top of the CSS versions that already work:
1. **A tint-and-ripple shader on the home strips:** grayscale to an accent duotone, with a liquid ripple while the tint changes.
2. **A velocity bend on the gallery canvas frames,** which settles flat at rest.
3. **A strip-to-gallery shared-element View Transition:** the strip morphs into the gallery's cover frame while the color world cross-fades.

**Architecture:**
- Everything plugs into the existing `src/webgl` surface layer (`registerSurface`, `WEBGL_READY_EVENT`, the fps guard and teardown). DOM images are never hidden, so a failed or refused WebGL context changes nothing visible.
- Shader modules export pure helpers that are unit-tested (`hexToVec3`, `normaliseDrag`).
- Layering: the WebGL canvas (fixed, z 0, appended last) must paint above photographs and below all chrome. For that:
  - the gallery canvas mode stops using `position: fixed` on `<main>`, which created a stacking context that put the title and controls under the canvas;
  - the strip labels get `z-index: 1`.
- The canvas mounts on `astro:after-swap` as well as `astro:page-load`, so the View Transition's new snapshot already shows the canvas layout.
- The canvas opens centred on the gallery's cover frame, which is the image the home strip shows, so the morph lands on the same photograph.
- Clones drop the transition scope, so each `view-transition-name` stays unique.

**Spec:** §4 (Home tint, Gallery bend, strip-to-gallery transition, world cross-fade), §8 (restored WebGL regressions).

## Global Constraints

- No new dependencies. Durations and easings come from `tokens.ts` (CSS reads `--dur-*` and `--ease-*`).
- **Reduced motion:** no WebGL context (the existing `supported()` gate) and no View Transition animation (`::view-transition-*` animations set to `none`).
- **Touch:** no bend surfaces (the canvas never mounts). Home tint surfaces are allowed but receive no hover.
- The fps guard and context-loss teardown must still leave every photograph visible.
- All suites stay green after each task. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Shader modules

- `src/webgl/shaders/tint.ts`:
  - `hexToVec3('#9fc3d6') → [0.6235…, 0.7647…, 0.8392…]`
  - `createTintShader(hex)` returns `{ spec: ShaderSpec; uniforms: { uTint, uHover, uCoverScale, uCoverOffset } }`.
  - The fragment converts to grayscale, multiplies by the tint by `uHover` (matching the CSS multiply layer), and adds a ripple displacement scaled by `uHover * (1 - uHover) * 4`, which peaks mid-transition and is 0 at rest.
- `src/webgl/shaders/bend.ts`:
  - `bendUniforms.uVelocity: { value: [0, 0] }` is shared by all frames.
  - `normaliseDrag(pxPerFrame)` clamps to [-1, 1], with `BEND.pixels = 40` px per frame giving 1.
  - The fragment bends `uv` across the frame by velocity, at most 6% of the frame (`BEND.max`).
- `tokens.ts` gets `BEND = { pixels: 40, max: 0.06 }`.
- Unit tests go in `tests/unit/webgl-shaders.test.ts`: hex parsing (including uppercase), `normaliseDrag` clamping and NaN → 0, and both fragments containing `precision`, `tMap` and their uniforms.

### Task 2: Gallery bend surfaces and stacking

- Canvas mode: `<main>` becomes `position: relative; height: 100svh; overflow: hidden` (no stacking context), and `html` gets `overflow: hidden` while the canvas is mounted.
- The canvas centres on `[data-cover]`, falling back to frame 1. `GalleryView` marks the cover `li` with `data-cover`.
- `canvas.ts` writes `normaliseDrag(current − previous)` per tick into the shared uniform through a quickTo-style smoothing, so it settles to `[0, 0]`.
- On `WEBGL_READY_EVENT` (and at mount, if WebGL is already up), it registers a bend surface for every frame image, clones included. The surfaces are torn down by `teardownWebGL`.
- Single view hides frames with `display: none`, so their meshes are not drawn.
- `canvasOffset` and `window.__webgl` are used by the tests.

### Task 3: Home tint surfaces

- After the strip reveal completes (or immediately, if there is no reveal) and WebGL is ready, each strip `img` gets a tint surface with its cover UV from `computeCoverUv`.
- Hover and focus feed `uHover` with `gsap.quickTo` (`DURATION.fast`, `EASE.out`).
- Strip labels get `z-index: 1`.

### Task 4: Strip-to-gallery View Transition

- Home `.strip__media` and the gallery's cover `a.gallery__frame` share `transition:name={`frame-${slug}`}`.
- `canvas.ts` removes `data-astro-transition-scope` from clones.
- A global style sets the `::view-transition-group/old/new(*)` duration to `var(--dur-base)` and timing to `var(--ease-out)`, with `animation: none` under reduced motion.
- The canvas mounts in `astro:after-swap` too, with a guard so it doesn't mount twice.

### Task 5: Restore the generic WebGL regressions

`tests/e2e/webgl.spec.ts`, ported from `git show 2dc2d51:tests/e2e/webgl.spec.ts` with the new pages:
- reduced motion creates no context;
- the probe doesn't leak, and is cached;
- the context is released across navigation;
- with WebGL refused, every home strip and gallery frame is visible and positioned.

New checks:
- home: 2 surfaces after the reveal; hovering Portraits drives its `uHover` to 1 and nothing else's;
- gallery: one surface per frame (clones included); a drag raises `|uVelocity|` and it returns to 0 at rest; single view leaves no frame mesh visible;
- the canvas element sits above the frame images and below `.gallery__title` (checked with `elementFromPoint`).

Transition tests in `tests/e2e/transitions.spec.ts`:
- exactly one element named `frame-portrait` on each of home and gallery;
- no clone carries a transition scope;
- navigating from a strip lands on the gallery with the cover centred.

Then do one round of screenshots, and a quick fps check that the gallery holds 50fps or more while dragging (the fps guard must not trip on this machine).
