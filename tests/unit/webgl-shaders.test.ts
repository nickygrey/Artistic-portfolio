import { describe, it, expect } from 'vitest';
import { hexToVec3, createTintShader } from '../../src/webgl/shaders/tint';
import { bendShader, bendUniforms, normaliseDrag } from '../../src/webgl/shaders/bend';
import { BEND } from '../../src/motion/tokens';

describe('hexToVec3', () => {
  it('turns a hex colour into 0–1 channels', () => {
    const [r, g, b] = hexToVec3('#9fc3d6');
    expect(r).toBeCloseTo(159 / 255, 5);
    expect(g).toBeCloseTo(195 / 255, 5);
    expect(b).toBeCloseTo(214 / 255, 5);
  });

  it('accepts uppercase', () => {
    expect(hexToVec3('#FFFFFF')).toEqual([1, 1, 1]);
  });
});

describe('createTintShader', () => {
  it('gives each strip its own tint and hover, starting at rest', () => {
    const a = createTintShader('#9fc3d6');
    const b = createTintShader('#e8a57a');
    expect(a.uniforms.uTint.value).toEqual(hexToVec3('#9fc3d6'));
    expect(a.uniforms.uHover.value).toBe(0);
    a.uniforms.uHover.value = 1;
    expect(b.uniforms.uHover.value).toBe(0);
  });

  it('declares every uniform it reads', () => {
    const { spec } = createTintShader('#000000');
    expect(spec.fragment).toContain('precision');
    for (const u of ['tMap', 'uTime', 'uTint', 'uHover', 'uCoverScale', 'uCoverOffset']) expect(spec.fragment).toContain(u);
  });
});

describe('normaliseDrag', () => {
  it('maps BEND.pixels per frame to full strength, keeping direction', () => {
    expect(normaliseDrag(BEND.pixels)).toBe(1);
    expect(normaliseDrag(-BEND.pixels / 2)).toBe(-0.5);
  });

  it('clamps and treats nonsense as rest', () => {
    expect(normaliseDrag(10_000)).toBe(1);
    expect(normaliseDrag(-10_000)).toBe(-1);
    expect(normaliseDrag(Number.NaN)).toBe(0);
  });
});

describe('bendShader', () => {
  it('shares one velocity across every frame and starts flat', () => {
    expect(bendShader.uniforms!.uVelocity).toBe(bendUniforms.uVelocity);
    expect(bendUniforms.uVelocity.value).toEqual([0, 0]);
    expect(bendShader.fragment).toContain('uniform vec2 uVelocity');
  });
});
