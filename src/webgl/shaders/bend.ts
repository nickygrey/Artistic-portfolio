import { BEND } from '../../motion/tokens';
import type { ShaderSpec } from '../surface';

/** One velocity for every frame: the whole canvas moves together, so it bends together. */
export const bendUniforms = {
  uVelocity: { value: [0, 0] as [number, number] },
};

/** Canvas travel this frame (px) as a bend strength in [-1, 1]. */
export function normaliseDrag(pxPerFrame: number): number {
  if (!Number.isFinite(pxPerFrame)) return 0;
  return Math.max(-1, Math.min(1, pxPerFrame / BEND.pixels));
}

export const bendShader: ShaderSpec = {
  fragment: `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uVelocity;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  // Bow each frame against its motion: strongest across the middle, nothing at the edges.
  float across = sin(uv.y * 3.14159265);
  float down = sin(uv.x * 3.14159265);
  uv.x -= uVelocity.x * ${BEND.max.toFixed(3)} * across;
  uv.y += uVelocity.y * ${BEND.max.toFixed(3)} * down;
  gl_FragColor = vec4(texture2D(tMap, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}`,
  uniforms: bendUniforms,
};
