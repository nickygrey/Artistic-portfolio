import type { ShaderSpec } from '../surface';

export function hexToVec3(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The home strip: grayscale at rest, the discipline's accent multiplied in on
 * hover — the same result as the CSS multiply layer underneath. It only
 * recolours: an earlier ripple displaced the image and warped faces in the
 * portraits. The hover zoom is CSS on the <img>, which the mesh follows.
 */
export function createTintShader(hex: string) {
  const uniforms = {
    uTint: { value: hexToVec3(hex) },
    uHover: { value: 0 },
    uCoverScale: { value: [1, 1] as [number, number] },
    uCoverOffset: { value: [0, 0] as [number, number] },
  };
  const spec: ShaderSpec = {
    fragment: `
precision highp float;
uniform sampler2D tMap;
uniform vec3 uTint;
uniform float uHover;
uniform vec2 uCoverScale;
uniform vec2 uCoverOffset;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(tMap, vUv * uCoverScale + uCoverOffset).rgb;
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  g = clamp((g - 0.5) * 1.05 + 0.5, 0.0, 1.0);
  vec3 tinted = vec3(g) * mix(vec3(1.0), uTint, uHover);
  gl_FragColor = vec4(tinted, 1.0);
}`,
    uniforms,
  };
  return { spec, uniforms };
}
