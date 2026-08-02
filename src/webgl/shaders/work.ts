import type { ShaderSpec } from '../surface';

/**
 * Live uniform objects for ONE work card's surface.
 *
 * Deliberately produced by a factory rather than exported as a module-level
 * object the way `hero.ts` does it. That difference is load-bearing, not
 * stylistic: `registerSurface()` spreads `shader.uniforms` into the OGL
 * `Program`, which then reads `.value` off those very objects on every draw,
 * so two surfaces sharing one object share one value. Exactly one hero exists
 * at a time, so module scope is fine there; Selected Work has four cards and
 * one cursor, and a shared `uHover`/`uMouse` would make all four ripple
 * together from whichever card the pointer happened to be over.
 *
 * The cover uniforms default to the identity window, so a card whose sync has
 * not run yet samples the whole texture — the plain, uncorrected mapping —
 * rather than a broken one. `uAspect` defaults to the 16:9 the
 * `.project-thumbnail` box is authored at.
 */
export interface WorkUniforms {
  uHover: { value: number };
  uDissolve: { value: number };
  uMouse: { value: [number, number] };
  uAspect: { value: [number, number] };
  uCoverScale: { value: [number, number] };
  uCoverOffset: { value: [number, number] };
}

export function createWorkUniforms(): WorkUniforms {
  return {
    uHover: { value: 0 },
    uDissolve: { value: 0 },
    uMouse: { value: [0.5, 0.5] },
    uAspect: { value: [16 / 9, 1] },
    uCoverScale: { value: [1, 1] },
    uCoverOffset: { value: [0, 0] },
  };
}

/**
 * Cursor position within an element, as the UV the shader expects.
 *
 * Two conversions, both easy to get silently wrong and neither visible in a
 * screenshot at rest, which is why this is pure and unit-tested rather than
 * inlined in the component:
 *
 * 1. **The y axis flips.** `clientY` grows downwards from the top of the
 *    viewport; the UV space a `Plane` hands the fragment shader has v = 1 at
 *    the TOP. (Derived from ogl/src/extras/Plane.js: it builds
 *    `y = iy * segH - height / 2` and writes `position[v] = y * vDir` with
 *    `vDir = -1`, alongside `uv[i * 2 + 1] = 1 - iy / hSegs` — so the vertex
 *    at v = 1 is the one at world +y. The texture's `flipY` puts the top of
 *    the photograph there too, which is why the picture is upright.)
 * 2. **The result is clamped.** A `pointermove` can be dispatched for a
 *    coordinate fractionally outside the element (sub-pixel rounding at the
 *    boundary, or a pointer capture), and an unclamped `uMouse` puts the
 *    ripple's origin outside the frame where its falloff behaves oddly.
 *
 * A zero-sized rect (an element in a `display: none` ancestor, or measured
 * before layout) returns the centre rather than dividing by zero — NaN in a
 * uniform does not fail loudly in GLSL, it blows out the whole frame.
 */
export function elementUv(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): [number, number] {
  if (!(rect.width > 0) || !(rect.height > 0)) return [0.5, 0.5];
  const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
  return [
    clamp01((clientX - rect.left) / rect.width),
    clamp01(1 - (clientY - rect.top) / rect.height),
  ];
}

/**
 * Whether a click is the plain, primary one the dissolve is allowed to react
 * to.
 *
 * The dissolve must not run on a modifier- or middle-click. Those open the
 * video in a *background* tab, leaving the user looking at the card they just
 * clicked — and a dissolve is a visual that ends on black, so running it there
 * would black out a card on a page the user never left. The same predicate
 * also keeps this in step with `preventNativeAnchorJump()` in
 * `src/motion/engine.ts`, which already excludes exactly this set of clicks
 * for a related reason (see tests/e2e/modifier-click.spec.ts for the
 * regression that produced it).
 *
 * This deliberately does not call `preventDefault()` anywhere, on any branch:
 * the link's own navigation is the point, and the dissolve is an
 * accompaniment to it.
 */
export function isPlainPrimaryClick(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
}): boolean {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  // `button` is absent on a keyboard-activated click in some engines and 0 in
  // Chromium; both mean "the primary action", so absent counts as primary.
  return event.button == null || event.button === 0;
}

/**
 * Hover ripple + click dissolve over a work card's photograph.
 *
 * GLSL comments are ASCII-only for the reason `hero.ts` documents: WebGL
 * restricts shader source to the GLSL ES character set and a stray em dash
 * risks an INVALID_VALUE from `shaderSource` on some drivers, which fails
 * silently as an unlit mesh.
 *
 * Three things this does that the surrounding CSS forces:
 *
 * - **Aspect correction (`uAspect`).** `vUv` is the plane's own 0..1 space, so
 *   a distance measured in it is anisotropic on a 16:9 card: circles come out
 *   as ellipses stretched 1.78x horizontally. Every radial term below measures
 *   distance in `uv * uAspect`, i.e. in units of frame height, and converts
 *   displacement back by dividing by the same vector.
 * - **The cover window (`uCoverScale`/`uCoverOffset`).** `.project-scale img`
 *   is `object-fit: cover` into an `aspect-ratio: 16/9` box. Sampling raw
 *   `uv` would show a differently-framed, differently-proportioned photograph
 *   than the DOM <img> the mesh is supposed to be replacing frame for frame
 *   — measured at 13.4% of horizontal crop on `work-audience.png`
 *   (3024x1964, aspect 1.5397, against 1.7778). See computeCoverUv.
 * - **Opaque output.** The canvas is `alpha: true` and the DOM photograph is
 *   still underneath, so writing a low alpha would reveal an *identical*
 *   picture rather than dissolving anything. The dissolve therefore resolves
 *   to black in the shader, and alpha stays 1 throughout.
 */
export function workShader(uniforms: WorkUniforms): ShaderSpec {
  return { fragment: WORK_FRAGMENT, uniforms };
}

export const WORK_FRAGMENT = `
precision highp float;
uniform sampler2D tMap;
uniform float uTime;
uniform float uHover;      // 0 at rest, 1 fully hovered
uniform float uDissolve;   // 0 intact, 1 fully burned through
uniform vec2  uMouse;      // cursor in element UV space, v up
uniform vec2  uAspect;     // (width/height, 1) - makes radial terms isotropic
uniform vec2  uCoverScale;
uniform vec2  uCoverOffset;
varying vec2 vUv;

// Cheap hash, same one hero.ts uses - no texture lookup, no dependency.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Smoothed value noise. White noise alone dissolves into television static,
// which reads as a broken image rather than as film; interpolating between
// lattice points gives clumps with a size, so the frame comes apart in
// grains instead of pixels.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = vUv;

  // --- Hover ripple ------------------------------------------------------
  // Rings radiating from the cursor. The envelope is zero AT the cursor and
  // peaks a fifth of a frame-height out, because a wave whose crest sits on
  // the pointer makes the one spot the eye is actually looking at wobble,
  // which reads as a rendering fault rather than as a ripple.
  // The envelope peaks an eighth of a frame-height out and is spent by half
  // a frame-height; the frequency is set so roughly three rings fit inside
  // that reach. Tuned by looking: at the first tuning (peak at 0.2, 22
  // rings/unit) the lit region ran to the corners of the frame and one and a
  // half rings fitted inside it, which reads as a torch being shone at the
  // photograph rather than as a surface responding to a touch.
  // The 44/6 pair preserves the original 22/3 phase velocity exactly, so the
  // wave still travels outwards at the speed it was first judged at.
  vec2 toCursor = (uv - uMouse) * uAspect;
  float d = length(toCursor);
  vec2 dir = toCursor / max(d, 1e-4);
  float envelope = 8.0 * d * exp(1.0 - 8.0 * d);
  float ripple = sin(d * 44.0 - uTime * 6.0) * envelope * uHover * 0.010;
  uv += (dir / uAspect) * ripple;

  // --- Dissolve push -----------------------------------------------------
  // A slight push in as the frame gives way, so the shot advances into the
  // cut rather than simply switching off.
  uv = mix(uv, (uv - 0.5) * 0.96 + 0.5, uDissolve);

  // Sample through the object-fit: cover window so the mesh shows the same
  // crop of the photograph the DOM <img> underneath it does. Both
  // displacements above are applied BEFORE this mapping, so their amplitudes
  // stay fractions of the VISIBLE frame rather than of the uncropped source.
  vec3 col = texture2D(tMap, uv * uCoverScale + uCoverOffset).rgb;

  // --- Hover lift --------------------------------------------------------
  // A local exposure lift travelling with the cursor, sharing the ripple's
  // envelope so the two read as one gesture rather than two effects.
  //
  // Mostly proportional, with a small additive term. Refraction alone can
  // only be seen where the photograph has detail to refract, and one of the
  // four frames here is a near-black title card (work-audience.png, mean
  // luma 7.1/255) where a purely proportional lift is also nothing. The
  // additive part is what keeps hover legible as a state on every card
  // rather than on the bright ones only.
  float lift = envelope * uHover;
  col = col * (1.0 + lift * 0.12) + lift * 0.022;

  // --- Dissolve ----------------------------------------------------------
  // The burn front advances radially from the point that was clicked,
  // perturbed by two octaves of noise so the edge is ragged like a film
  // gate burning rather than a clean expanding circle. "field" is the order
  // in which the frame gives way; "front" is how far the burn has got.
  // (No backticks anywhere below - this whole shader is a JS template
  // literal, and one would end it mid-comment.)
  // The radial term dominates and the noise only roughens it. That balance
  // is the whole difference between a front and a texture: weighted the
  // other way round (noise 0.80 against radius 0.62, as this was first
  // written) the frame came apart everywhere at once in warm blobs, which
  // reads as marble or lava, not as a shot ending. Judged by eye against
  // all four photographs at uDissolve = 0.2, 0.4, 0.6.
  //
  // It burns INWARDS - note the "1.0 - radial" - so the frame gives way at its edges
  // first and what was clicked is the last thing left. Outwards was tried
  // first, since it seems the obvious reading of "radiating from the
  // click", and it is wrong: people click the subject, so the frame opens a
  // spreading black hole exactly over the face and holds it there for half
  // a second. Inwards is both kinder to the photograph and the older piece
  // of film grammar - it is an iris out.
  float radial = clamp(length((vUv - uMouse) * uAspect) / 1.35, 0.0, 1.0);
  // Weighted towards the FINER octaves. An equal-ish split led by the
  // coarse one (0.26 at scale 7 against 0.10 at 19) deformed the surviving
  // shape itself rather than its edge: the iris closed as a lumpy blob
  // instead of a disc with a torn rim. Three octaves led by the middle one
  // keep the shape a disc and put the irregularity where it belongs.
  float field =
    (1.0 - radial) +
    vnoise(vUv * uAspect * 7.0) * 0.12 +
    vnoise(vUv * uAspect * 19.0) * 0.13 +
    vnoise(vUv * uAspect * 47.0) * 0.06;
  // Ends past the maximum "field" plus the band width below, so uDissolve = 1
  // leaves nothing of the photograph anywhere, and starts below zero, so
  // uDissolve = 0 leaves all of it.
  float front = uDissolve * 1.53 - 0.11;
  // 1 where the frame is still intact, 0 where it has gone.
  float intact = smoothstep(front - 0.10, front + 0.01, field);
  // Peaks inside the transition band and is zero on both sides of it.
  float rim = intact * (1.0 - intact) * 4.0;

  col = mix(vec3(0.0), col, intact);
  // A warm, restrained hot edge. Deliberately not a white flash: a
  // full-frame blowout on a 0.7s timeline is a photosensitivity hazard, and
  // a saturated orange one reads as a cheap fire filter rather than as
  // celluloid. It is a FIXED addition rather than one scaled by the
  // photograph's own luminance, because one of these four frames is a
  // near-black title card and a luminance-scaled edge would dissolve black
  // into black there, i.e. show nothing at all.
  col += rim * vec3(1.0, 0.74, 0.46) * 0.30;

  // --- Grain -------------------------------------------------------------
  // Fine and constant at rest, so a card matches the hero's treatment.
  // Hashed in frame space, not texture space, so grain size is independent
  // of how much of the source the cover window happens to be showing.
  //
  // MULTIPLICATIVE, unlike hero.ts's additive version, because one of these
  // four frames is a near-black title card and additive noise on black can
  // only ever add: the negative half of the swing clips at zero. Measured
  // with additive grain at the same nominal amplitude, on that card, against
  // the DOM <img> the mesh is supposed to be reproducing: mean luma 7.1 ->
  // 7.9 and high-frequency energy 2.88 -> 7.69, i.e. a clean black frame
  // visibly turned into a dithered one. Scaling by the pixel's own value
  // leaves black black and puts the density variation where a photograph
  // actually has density, which is also how film behaves.
  float g = hash(vUv * 900.0 + fract(uTime) * 100.0);
  col *= 1.0 + (g - 0.5) * 0.075;

  // The burn front gets its own, heavier agitation. Confined to the rim
  // rather than applied across the whole frame for the same reason: past
  // the front the frame is black, and grain there would be the dithered
  // black above all over again, at twice the amplitude.
  float g2 = hash(vUv * 420.0 - fract(uTime) * 61.0);
  col += (g2 - 0.5) * rim * 0.09;

  gl_FragColor = vec4(col, 1.0);
}`;
