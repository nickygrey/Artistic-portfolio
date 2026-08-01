import { describe, it, expect } from 'vitest';
import {
  heroShader,
  heroUniforms,
  normaliseScrollVelocity,
  HERO_VELOCITY_SCALE,
} from '../../src/webgl/shaders/hero';

describe('normaliseScrollVelocity', () => {
  it('is zero when the page is not moving', () => {
    expect(normaliseScrollVelocity(0)).toBe(0);
  });

  it('reaches exactly 1 at the reference speed and clamps above it', () => {
    expect(normaliseScrollVelocity(HERO_VELOCITY_SCALE)).toBe(1);
    // A flick can produce several thousand px/sec; without the clamp the
    // shader's `uv.x += wave * uVelocity * 0.012` would tear the frame apart.
    expect(normaliseScrollVelocity(HERO_VELOCITY_SCALE * 12)).toBe(1);
    expect(normaliseScrollVelocity(40000)).toBe(1);
  });

  it('reads scrolling up exactly as fast as scrolling down', () => {
    for (const v of [120, 600, HERO_VELOCITY_SCALE, 9000]) {
      expect(normaliseScrollVelocity(-v)).toBe(normaliseScrollVelocity(v));
    }
  });

  it('rises monotonically between rest and the clamp', () => {
    const samples = [0, 100, 300, 600, 900, HERO_VELOCITY_SCALE].map(normaliseScrollVelocity);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it('never leaves [0, 1] for any input, including the non-finite ones', () => {
    // ScrollTrigger.getVelocity() divides by elapsed time; a sample taken
    // twice within the same clock tick yields Infinity or NaN. NaN in a GLSL
    // uniform does not fail loudly — it silently blows out the whole frame —
    // so this has to be handled here, not hoped away.
    for (const raw of [NaN, Infinity, -Infinity, 0, -0, 1e9, -1e9, 0.001]) {
      const v = normaliseScrollVelocity(raw);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(normaliseScrollVelocity(NaN)).toBe(0);
    expect(normaliseScrollVelocity(Infinity)).toBe(0);
  });
});

describe('heroShader', () => {
  it('exposes the live uniform objects the page mutates, by reference', () => {
    // registerSurface() spreads these into the OGL Program, which then reads
    // `.value` off these exact objects every frame. If the spec ever handed
    // over copies instead, driving the effect from Hero.astro would silently
    // do nothing.
    expect(heroShader.uniforms?.uVelocity).toBe(heroUniforms.uVelocity);
    expect(heroShader.uniforms?.uCoverScale).toBe(heroUniforms.uCoverScale);
    expect(heroShader.uniforms?.uCoverOffset).toBe(heroUniforms.uCoverOffset);
  });

  it('defaults the cover window to the identity mapping', () => {
    // So a surface that is drawn before anything syncs the cover uniforms
    // samples the plain full texture, not a window built from garbage.
    expect(heroUniforms.uCoverScale.value).toEqual([1, 1]);
    expect(heroUniforms.uCoverOffset.value).toEqual([0, 0]);
  });

  it('declares every uniform it is handed, and only ASCII in its source', () => {
    for (const name of Object.keys(heroUniforms)) {
      expect(heroShader.fragment).toContain(`uniform `);
      expect(heroShader.fragment).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`));
    }
    // WebGL restricts shader source to the GLSL ES character set; a stray
    // typographic dash in a comment can be rejected by shaderSource() with
    // INVALID_VALUE, which surfaces only as an unlit mesh at runtime.
    // eslint-disable-next-line no-control-regex
    expect(heroShader.fragment).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });

  it('keeps the tuned constants the effect was calibrated with', () => {
    // These are the values the effect was judged by eye against (subtle
    // enough to sit under a headline). Pinned so a later edit to the shader
    // has to change this test deliberately rather than drift the intensity.
    expect(heroShader.fragment).toContain('uv.x += wave * uVelocity * 0.012;');
    expect(heroShader.fragment).toContain('col += (g - 0.5) * 0.045;');
    expect(heroShader.fragment).toContain('sin(uv.y * 8.0 + uTime * 0.4)');
    expect(heroShader.fragment).toContain('hash(uv * 900.0 + fract(uTime) * 100.0)');
  });

  it('applies the smear before the cover mapping, so its amplitude is a fraction of the visible frame', () => {
    const smear = heroShader.fragment.indexOf('uv.x += wave * uVelocity');
    const mapped = heroShader.fragment.indexOf('uv * uCoverScale + uCoverOffset');
    expect(smear).toBeGreaterThan(-1);
    expect(mapped).toBeGreaterThan(-1);
    expect(smear).toBeLessThan(mapped);
  });
});
