import type { ShaderSpec } from '../surface';

/**
 * Live uniform objects for the hero surface.
 *
 * `registerSurface()` spreads `shader.uniforms` into the OGL `Program`, which
 * then reads `.value` off each of these objects on every draw — so mutating
 * them here is how the page drives the effect, and there is no per-surface
 * handle to thread around. Module-level (not per-registration) is correct:
 * exactly one hero surface exists at a time, and it is destroyed and
 * re-registered on every View Transition, so a value that outlives a single
 * registration is a feature — it means the smear does not snap back to zero
 * and re-ramp on navigation.
 *
 * The cover uniforms default to the identity window, so if nothing ever
 * syncs them the shader samples the whole texture — the plain, uncorrected
 * mapping — rather than a broken one.
 */
export const heroUniforms = {
  uVelocity: { value: 0 },
  uCoverScale: { value: [1, 1] as [number, number] },
  uCoverOffset: { value: [0, 0] as [number, number] },
};

/**
 * Scroll speed, in px/sec, that saturates the smear. Matches the divisor
 * PhotoCarousel.astro's marquee already uses for its own scroll-velocity
 * boost (`Math.abs(self.getVelocity()) / 1200`) — the two effects respond to
 * the same gesture on the same page, and giving them different reference
 * speeds would make one visibly lead the other for no reason.
 */
export const HERO_VELOCITY_SCALE = 1200;

/**
 * Raw ScrollTrigger velocity (px/sec, signed) to the `[0, 1]` the shader
 * expects. Direction is discarded deliberately: the smear is a symmetric
 * horizontal wave, so scrolling up should read exactly as fast as scrolling
 * down rather than inverting. Non-finite input (a velocity sampled across a
 * zero-length time slice divides by zero) reads as "not moving" rather than
 * poisoning the uniform with NaN, which in GLSL would blow out the whole
 * frame instead of failing quietly.
 *
 * This only normalises. Smoothing is the caller's job (Hero.astro drives it
 * through `gsap.quickTo`, so it draws its duration and easing from
 * src/motion/tokens.ts like every other continuous response on this site).
 */
export function normaliseScrollVelocity(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.abs(raw) / HERO_VELOCITY_SCALE, 1);
}

/**
 * Displacement rises with scroll velocity; grain is constant and fine. Both
 * are deliberately subtle — this sits under a headline that must stay
 * readable.
 *
 * GLSL comments are kept ASCII-only: WebGL restricts shader source to the
 * GLSL ES character set, and a stray em dash risks an INVALID_VALUE from
 * `shaderSource` on some drivers, which would fail silently as an unlit mesh.
 */
export const heroShader: ShaderSpec = {
  fragment: `
precision highp float;
uniform sampler2D tMap;
uniform float uTime;
uniform float uVelocity;
uniform vec2 uCoverScale;
uniform vec2 uCoverOffset;
varying vec2 vUv;

// Cheap hash noise - no texture lookup, no dependency.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  // Horizontal smear that grows with scroll speed, strongest mid-frame.
  float wave = sin(uv.y * 8.0 + uTime * 0.4) * 0.5 + 0.5;
  uv.x += wave * uVelocity * 0.012;

  // Sample through the object-fit: cover window (see computeCoverUv) so the
  // mesh shows the same crop of the photograph the DOM <img> underneath it
  // does. The smear above is applied BEFORE this mapping, so its amplitude
  // stays a fraction of the visible frame rather than of the uncropped
  // source, and CLAMP_TO_EDGE handles the sliver it can push past an edge.
  vec3 col = texture2D(tMap, uv * uCoverScale + uCoverOffset).rgb;

  // Fine grain, animated so it reads as film rather than as a static overlay.
  // Hashed in frame space, not texture space, so grain size is independent of
  // how much of the source the cover window happens to be showing.
  float g = hash(uv * 900.0 + fract(uTime) * 100.0);
  col += (g - 0.5) * 0.045;

  gl_FragColor = vec4(col, 1.0);
}`,
  uniforms: heroUniforms,
};
