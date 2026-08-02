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
 * `uMouse` and `uOrigin` are separate on purpose. `uMouse` is a live cursor
 * position and moves on every `pointermove`; `uOrigin` is captured once, when
 * a card's link is activated, and must then hold still until the re-form that
 * converges on it has finished. Sharing one uniform between them let a pointer
 * that happened to cross the card during a re-form drag the iris around with
 * it.
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
  uOrigin: { value: [number, number] };
  uAspect: { value: [number, number] };
  uCoverScale: { value: [number, number] };
  uCoverOffset: { value: [number, number] };
}

export function createWorkUniforms(): WorkUniforms {
  return {
    uHover: { value: 0 },
    uDissolve: { value: 0 },
    uMouse: { value: [0.5, 0.5] },
    uOrigin: { value: [0.5, 0.5] },
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
 *
 * Clamping is right for the LIVE ripple, which has to keep tracking a pointer
 * that has wandered onto the caption. It is wrong for the dissolve's origin —
 * see `dissolveOriginUv` below.
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
 * Where the iris converges: the point on the photograph that was activated.
 *
 * Not `elementUv`, because clamping is actively wrong here. `.card-link` wraps
 * the caption as well as the photograph, so two ordinary activations land
 * outside the <img> entirely and clamping puts the iris on an edge:
 *
 * - **A click on the title or category.** Measured on the live page: the
 *   coordinate clamps to the frame's BOTTOM edge, so on a portrait the
 *   sitter's head is the first thing to go and the last thing left is their
 *   torso — the exact opposite of the effect's stated design.
 * - **Keyboard activation.** `Enter` on a focused card dispatches a click with
 *   `clientX`/`clientY` of 0, which clamps to the top-left CORNER. There is no
 *   pointer position to honour at all: a keyboard user did not aim at a point.
 *
 * Both fall back to the centre of the frame, which is the honest answer to
 * "the visitor activated this card without indicating where". Only a genuine
 * hit inside the photograph produces an off-centre origin.
 *
 * `keyboard` is passed rather than inferred from the coordinates because
 * (0, 0) is a legitimate viewport position; `MouseEvent.detail === 0` is the
 * reliable signal and belongs at the call site, where the event is.
 */
export function dissolveOriginUv(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  keyboard: boolean
): [number, number] {
  if (keyboard) return [0.5, 0.5];
  if (!(rect.width > 0) || !(rect.height > 0)) return [0.5, 0.5];
  const u = (clientX - rect.left) / rect.width;
  const v = 1 - (clientY - rect.top) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return [0.5, 0.5];
  return [u, v];
}

// ---------------------------------------------------------------------------
// The re-form state machine
// ---------------------------------------------------------------------------

/**
 * How long after an activation a hide still counts as "that click sent the
 * visitor away", in milliseconds.
 *
 * A `target="_blank"` click that opens a foreground tab backgrounds this page
 * within roughly 100-200ms, so this is generous by more than an order of
 * magnitude. Its job is the other end: a click whose tab never opened (a popup
 * blocker, an extension that cancels the navigation) must not leave a card
 * armed indefinitely, so that an unrelated alt-tab minutes later reassembles a
 * card out of nowhere. Exceeding the window loses the effect and shows an
 * ordinary, fully-revealed card — the safe direction, which is the direction
 * every branch of this machine fails in.
 */
export const REFORM_ARM_MS = 5000;

export interface ReformState {
  /** The card whose link was activated, and when. Consumed by a hide. */
  clicked: { card: number; at: number } | null;
  /** The card to re-form the next time this page is looked at again. */
  pending: number | null;
}

export type ReformEvent =
  | { type: 'click'; card: number; at: number }
  | { type: 'hidden'; at: number }
  | { type: 'visible' };

export function initialReformState(): ReformState {
  return { clicked: null, pending: null };
}

/**
 * The whole trigger, as a pure function: given the state and one event, the
 * next state and which card (if any) should re-form now.
 *
 * **The single non-negotiable property this exists to make checkable: no
 * state in this machine describes a card that is dark.** A click draws
 * nothing at all — `uDissolve` stays 0 — and the only thing that ever raises
 * it is the start of a re-form, which is a tween straight back down to 0 in
 * the same breath. So a trigger that is missed, delayed, duplicated or
 * arrives out of order leaves a card that looks completely normal. That is
 * the inversion of the arrangement this replaces, where the same unreliability
 * left a permanently black rectangle.
 *
 * The rules, and the case each one is for:
 *
 * - **Only a HIDE promotes a click into a pending re-form.** So a `visible`
 *   that arrives when nobody has clicked anything — a first page load, an
 *   ordinary tab switch — finds nothing pending and does nothing. A visitor
 *   who has never clicked a card must never see cards animate in from black.
 * - **One pending slot, not one per card.** Clicking several cards and then
 *   returning re-forms the last one activated, which is the one the visitor
 *   just came back from. The others were never dark, so there is nothing to
 *   put right about them.
 * - **`visible` always clears everything.** Two `visible` events in a row
 *   re-form once, not twice; a re-form interrupted by another hide is
 *   abandoned rather than resumed part-way (the component sets `uDissolve`
 *   back to 0 on every transition regardless of what this returns).
 * - **A hide with nothing newly clicked leaves `pending` alone**, so a
 *   duplicated hide does not lose a re-form that was already promoted.
 */
export function nextReformState(
  state: ReformState,
  event: ReformEvent
): { state: ReformState; reform: number | null } {
  switch (event.type) {
    case 'click':
      return { state: { clicked: { card: event.card, at: event.at }, pending: null }, reform: null };
    case 'hidden': {
      const recent =
        state.clicked !== null && event.at - state.clicked.at <= REFORM_ARM_MS
          ? state.clicked.card
          : null;
      return {
        state: { clicked: null, pending: recent !== null ? recent : state.pending },
        reform: null,
      };
    }
    case 'visible':
      return { state: initialReformState(), reform: state.pending };
  }
}

/**
 * Hover ripple + a burn that plays in reverse, as the card re-forms.
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
 *   — `work-audience.png` is 3024x1964 (aspect 1.5397) against 1.7778, so it
 *   is taller in proportion than its box and `cover` crops 13.4% off the top
 *   and bottom. (Uncorrected, that reads as a horizontal stretch, which is
 *   what an earlier version of this comment called it. The crop is VERTICAL:
 *   computeCoverUv returns scale [1, 0.8659].)
 * - **Opaque output.** The canvas is `alpha: true` and the DOM photograph is
 *   still underneath, so writing a low alpha would reveal an *identical*
 *   picture rather than dissolving anything. The burn therefore resolves to
 *   black in the shader, and alpha stays 1 throughout.
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
uniform vec2  uMouse;      // live cursor in element UV space, v up
uniform vec2  uOrigin;     // where the iris converges; frozen at activation
uniform vec2  uAspect;     // (width/height, 1) - makes radial terms isotropic
uniform vec2  uCoverScale;
uniform vec2  uCoverOffset;
varying vec2 vUv;

// --- OWNER-TUNABLE -------------------------------------------------------
// The one constant here with no objective answer, and the one to re-judge
// when the owner's four chosen film frames replace the stand-ins (see Owner
// Actions in the task brief). It is a FIXED warm hue, so against a cool or
// desaturated grade it can read as an orange contamination rather than as
// celluloid. Change it HERE and nowhere else - both are used exactly once,
// at the "col += rim * RIM_TINT * RIM_GAIN" line near the bottom of main().
// RIM_GAIN of 0.0 removes the hot edge entirely and touches nothing else.
//
// Deliberately not scaled by the photograph's own luminance: one of these
// four frames is a near-black title card, and a luminance-scaled edge would
// dissolve black into black there, i.e. show nothing at all. Deliberately not
// a white flash either - a full-frame blowout on a 0.7s timeline is a
// photosensitivity hazard, and a saturated orange one reads as a cheap fire
// filter.
const vec3  RIM_TINT = vec3(1.0, 0.74, 0.46);
const float RIM_GAIN = 0.30;

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
  // peaks an eighth of a frame-height out, because a wave whose crest sits on
  // the pointer makes the one spot the eye is actually looking at wobble,
  // which reads as a rendering fault rather than as a ripple. It is spent by
  // half a frame-height; the frequency is set so roughly three rings fit
  // inside that reach. Tuned by looking: at the first tuning (peak at 0.2, 22
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

  // --- Burn push ---------------------------------------------------------
  // A slight push in while the frame is broken up, so the shot settles back
  // out as it re-forms rather than simply switching on.
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

  // --- The burn ----------------------------------------------------------
  // Read at uDissolve = 1 -> 0, which is the only direction this ever plays:
  // the visitor comes back to the portfolio and the card they left through
  // re-forms from the point they activated. "field" is the order in which the
  // frame gives way; "front" is how far the burn has got.
  // (No backticks anywhere below - this whole shader is a JS template
  // literal, and one would end it mid-comment.)
  //
  // The radial term dominates and the noise only roughens it. That balance
  // is the whole difference between a front and a texture: weighted the
  // other way round (noise 0.80 against radius 0.62, as this was first
  // written) the frame came apart everywhere at once in warm blobs, which
  // reads as marble or lava, not as a shot ending. Judged by eye against
  // all four photographs.
  //
  // It burns INWARDS - note the "1.0 - radial" - so the frame gives way at
  // its edges first and what was activated is the last thing left, which run
  // backwards means the surviving island opens outwards from that point.
  // Outwards was tried first, since it seems the obvious reading of
  // "radiating from the click", and it is wrong: people click the subject, so
  // the frame opens a spreading black hole exactly over the face. Inwards is
  // both kinder to the photograph and the older piece of film grammar - it is
  // an iris.
  //
  // *** The defect the next two lines exist to fix ***
  // The divisor used to be a fixed 1.35. From a centre origin the largest
  // attainable distance in this aspect-corrected space is
  // length(0.889, 0.5) = 1.020, so "radial" capped at 0.756, "field" bottomed
  // out near 0.244 and "front" did not reach it until a third of the tween
  // had already elapsed. Measured on the committed shader: 0.25 seconds of
  // visible effect inside a 0.7 second timeline, starting 0.29s in. Worse,
  // the cap was origin-dependent - only an origin within 0.33 of a corner
  // could reach the [0, 1] range the unit test derived its bounds from, which
  // is how a third of the tween being dead time shipped behind a green test.
  // Normalising by the distance to the farthest corner of THIS frame from
  // THIS origin makes radial reach exactly 1 wherever the visitor clicked.
  vec2 corner = max(uOrigin, 1.0 - uOrigin) * uAspect;
  float reach = max(length(corner), 1e-4);
  // Weighted towards the FINER octaves. An equal-ish split led by the
  // coarse one (0.26 at scale 7 against 0.10 at 19) deformed the surviving
  // shape itself rather than its edge: the iris closed as a lumpy blob
  // instead of a disc with a torn rim. Three octaves led by the middle one
  // keep the shape a disc and put the irregularity where it belongs.
  float n =
    vnoise(vUv * uAspect * 7.0) * 0.12 +
    vnoise(vUv * uAspect * 19.0) * 0.13 +
    vnoise(vUv * uAspect * 47.0) * 0.06;
  // The noise goes INSIDE the clamp, and zero-meaned (its three weights sum
  // to 0.31, so 0.155 is its midpoint). Displacing the front by d is
  // identical to displacing the threshold by -d, so the burn looks exactly as
  // it did - same octaves, same weights, same 0.31 peak-to-peak swing. What
  // changes is the BOUND: "field" now spans exactly [0, 1] and attains both
  // ends, instead of [0, 1.31] with a floor that no pixel actually reached.
  //
  // That gap was the second half of the dead lead-in. The first half was the
  // fixed 1.35 divisor above; with it gone, the frame still sat untouched
  // through the opening fifth of the tween, because the smallest "field" any
  // pixel produced was the noise's own value at the far corner (around 0.05,
  // never 0) and the front had to travel that far before anything at all
  // happened.
  float radial = clamp(length((vUv - uOrigin) * uAspect) / reach - (n - 0.155), 0.0, 1.0);
  float field = 1.0 - radial;
  // So the two ends of the tween are now the two ends of the effect, with
  // 0.01 of slack at each and no more: front + 0.01 < 0 at uDissolve = 0
  // (every pixel intact - the resting, fully-revealed state) and
  // front - 0.10 > 1 at uDissolve = 1 (nothing of the photograph anywhere).
  // Pinned by a rendered measurement rather than by this arithmetic, which is
  // what the last version of this shader got wrong - see "the burn is visible
  // across almost all of its tween" in tests/e2e/webgl.spec.ts.
  float front = uDissolve * 1.13 - 0.02;
  // 1 where the frame is still intact, 0 where it has gone.
  float intact = smoothstep(front - 0.10, front + 0.01, field);
  // Peaks inside the transition band and is zero on both sides of it.
  float rim = intact * (1.0 - intact) * 4.0;

  col = mix(vec3(0.0), col, intact);
  // A warm, restrained hot edge - see RIM_TINT / RIM_GAIN at the top.
  col += rim * RIM_TINT * RIM_GAIN;

  // --- Grain -------------------------------------------------------------
  // Fine and constant at rest, so a card matches the hero's treatment.
  // Hashed in frame space, not texture space, so grain size is independent
  // of how much of the source the cover window happens to be showing.
  //
  // MULTIPLICATIVE, unlike hero.ts's additive version, because one of these
  // four frames is a near-black title card and additive noise on black can
  // only ever add: the negative half of the swing clips at zero. Measured
  // with hero's additive grain at its real amplitude, on that card, against
  // the DOM <img> the mesh is supposed to be reproducing: mean luma 6.94 ->
  // 8.32 and high-frequency energy 4.48 -> 10.86, i.e. a clean black frame
  // visibly turned into a dithered one. Scaling by the pixel's own value
  // leaves black black and puts the density variation where a photograph
  // actually has density, which is also how film behaves - and it measures
  // MORE present than the additive form on a photographic card.
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
