import type { ShaderSpec } from '../surface';

export function hexToVec3(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The home strip: grayscale at rest, the discipline's accent multiplied in on
 * hover — the same result as the CSS multiply layer underneath — with a liquid
 * ripple that exists only while the tint is changing (uHover · (1 − uHover)).
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
uniform float uTime;
uniform vec3 uTint;
uniform float uHover;
uniform vec2 uCoverScale;
uniform vec2 uCoverOffset;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float ripple = uHover * (1.0 - uHover) * 4.0;
  uv.x += sin(uv.y * 14.0 + uTime * 3.0) * 0.012 * ripple;
  uv.y += cos(uv.x * 10.0 + uTime * 2.0) * 0.008 * ripple;

  vec3 col = texture2D(tMap, uv * uCoverScale + uCoverOffset).rgb;
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  g = clamp((g - 0.5) * 1.05 + 0.5, 0.0, 1.0);
  vec3 tinted = vec3(g) * mix(vec3(1.0), uTint, uHover);
  gl_FragColor = vec4(tinted, 1.0);
}`,
    uniforms,
  };
  return { spec, uniforms };
}
