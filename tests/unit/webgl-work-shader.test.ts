import { describe, it, expect } from 'vitest';
import {
  createWorkUniforms,
  elementUv,
  isPlainPrimaryClick,
  workShader,
  WORK_FRAGMENT,
} from '../../src/webgl/shaders/work';

describe('createWorkUniforms', () => {
  it('gives every card its own uniform objects', () => {
    // The single most consequential difference from hero.ts. registerSurface()
    // spreads these straight into an OGL Program, which then reads `.value`
    // off THESE OBJECTS on every draw — so a module-level object shared by
    // four cards would make all four ripple together from one cursor, and
    // dissolve together from one click. Identity, not equality, is the thing
    // under test.
    const a = createWorkUniforms();
    const b = createWorkUniforms();
    expect(a.uHover).not.toBe(b.uHover);
    expect(a.uMouse).not.toBe(b.uMouse);
    expect(a.uDissolve).not.toBe(b.uDissolve);
    expect(a.uCoverScale).not.toBe(b.uCoverScale);
    a.uHover.value = 1;
    a.uMouse.value = [0.1, 0.9];
    expect(b.uHover.value).toBe(0);
    expect(b.uMouse.value).toEqual([0.5, 0.5]);
  });

  it('rests at "not hovered, not dissolving, whole texture"', () => {
    // If nothing ever syncs the cover window, the card must show the plain
    // full-texture mapping rather than one built from garbage — and it must
    // certainly not start part-dissolved.
    const u = createWorkUniforms();
    expect(u.uHover.value).toBe(0);
    expect(u.uDissolve.value).toBe(0);
    expect(u.uCoverScale.value).toEqual([1, 1]);
    expect(u.uCoverOffset.value).toEqual([0, 0]);
    // The .project-thumbnail box is authored `aspect-ratio: 16/9`, so this
    // default is already correct for every card before syncCover() runs.
    expect(u.uAspect.value[0]).toBeCloseTo(16 / 9, 10);
    expect(u.uAspect.value[1]).toBe(1);
  });
});

describe('elementUv', () => {
  const rect = { left: 100, top: 200, width: 400, height: 225 };

  it('puts the centre of the element at the centre of UV space', () => {
    expect(elementUv(rect, 300, 312.5)).toEqual([0.5, 0.5]);
  });

  it('FLIPS the y axis', () => {
    // clientY grows downwards; the UV space an OGL Plane hands the fragment
    // shader has v = 1 at the top (see the derivation in work.ts). Getting
    // this backwards is invisible at rest and mirrors the ripple vertically
    // the moment anyone hovers, which is why it is pinned here.
    expect(elementUv(rect, 100, 200)).toEqual([0, 1]); // top-left  -> v = 1
    expect(elementUv(rect, 500, 425)).toEqual([1, 0]); // bottom-right -> v = 0
  });

  it('clamps a coordinate outside the element onto its edge', () => {
    // pointermove can be dispatched fractionally outside an element, and the
    // listener is on `.card-link` — which is taller than the <img> this is
    // measured against, so the caption legitimately produces v < 0.
    expect(elementUv(rect, -50, 900)).toEqual([0, 0]);
    expect(elementUv(rect, 9999, -9999)).toEqual([1, 1]);
  });

  it('returns the centre rather than NaN for a zero-sized rect', () => {
    // NaN in a GLSL uniform does not fail loudly, it blows out the frame.
    for (const bad of [
      { left: 0, top: 0, width: 0, height: 100 },
      { left: 0, top: 0, width: 100, height: 0 },
      { left: 0, top: 0, width: 0, height: 0 },
    ]) {
      const [u, v] = elementUv(bad, 10, 10);
      expect(Number.isFinite(u) && Number.isFinite(v)).toBe(true);
      expect([u, v]).toEqual([0.5, 0.5]);
    }
  });
});

describe('isPlainPrimaryClick', () => {
  it('accepts the plain primary click', () => {
    expect(isPlainPrimaryClick({ button: 0 })).toBe(true);
  });

  it('accepts a click with no button at all', () => {
    // Keyboard activation of the link (Enter) dispatches a click that some
    // engines leave without a meaningful `button`. That IS the primary
    // action, and the dissolve should run for it.
    expect(isPlainPrimaryClick({})).toBe(true);
  });

  it('rejects every modifier and every non-primary button', () => {
    // These open a BACKGROUND tab, so the visitor stays on this page — and a
    // dissolve resolving to black would black out a card they never left.
    // Mirrors preventNativeAnchorJump()'s guard in src/motion/engine.ts; see
    // tests/e2e/modifier-click.spec.ts for the regression behind it.
    expect(isPlainPrimaryClick({ metaKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ ctrlKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ shiftKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ altKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ button: 1 })).toBe(false);
    expect(isPlainPrimaryClick({ button: 2 })).toBe(false);
  });
});

describe('workShader', () => {
  it('hands the caller its own uniform objects through to the Program', () => {
    const u = createWorkUniforms();
    expect(workShader(u).uniforms).toBe(u);
  });

  it('declares every uniform it is handed, and only ASCII in its source', () => {
    const u = createWorkUniforms();
    for (const name of Object.keys(u)) {
      expect(WORK_FRAGMENT).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`));
    }
    // WebGL restricts shader source to the GLSL ES character set; a stray
    // typographic dash in a comment can be rejected by shaderSource() with
    // INVALID_VALUE, which surfaces only as an unlit mesh at runtime.
    // eslint-disable-next-line no-control-regex
    expect(WORK_FRAGMENT).toMatch(/^[\x09\x0a\x0d\x20-\x7e]*$/);
  });

  it('samples the object-fit: cover window rather than the raw uv', () => {
    // `.project-scale img` is object-fit: cover into a 16/9 box, and
    // work-audience.png is 3024x1964 (aspect 1.5397). Sampling raw uv shows
    // that photograph stretched 13.4% horizontally and re-framed, against
    // the DOM <img> the mesh is meant to be replacing frame for frame. The
    // three YouTube grabs are exactly 1280x720, so this defect is invisible
    // on three of the four cards — which is precisely why it needs a test.
    expect(WORK_FRAGMENT).toContain('texture2D(tMap, uv * uCoverScale + uCoverOffset)');
  });

  it('applies the ripple and the push before the cover mapping', () => {
    // So their amplitudes stay fractions of the VISIBLE frame rather than of
    // the uncropped source. Same ordering hero.ts's smear relies on.
    const ripple = WORK_FRAGMENT.indexOf('uv += (dir / uAspect) * ripple;');
    const push = WORK_FRAGMENT.indexOf('uv = mix(uv, (uv - 0.5) * 0.96 + 0.5, uDissolve);');
    const mapped = WORK_FRAGMENT.indexOf('uv * uCoverScale + uCoverOffset');
    expect(ripple).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(ripple).toBeLessThan(mapped);
    expect(push).toBeLessThan(mapped);
  });

  it('measures every radial term in aspect-corrected space', () => {
    // vUv is the plane's own 0..1 space, so an uncorrected radial distance on
    // a 16:9 card is anisotropic: the hover rings come out as ellipses
    // stretched 1.78x and the dissolve's iris with them. Verified in the
    // rendered pixels (the rings are round); pinned here so an edit cannot
    // quietly drop the correction from one of the two.
    expect(WORK_FRAGMENT).toContain('vec2 toCursor = (uv - uMouse) * uAspect;');
    expect(WORK_FRAGMENT).toContain('length((vUv - uMouse) * uAspect)');
  });

  it('burns inwards, so what was clicked is the last thing left', () => {
    // Outwards was tried and rejected: people click the subject, so the frame
    // opened a spreading black hole over the sitter's face. The minus sign is
    // the whole difference between an iris out and a censor blob.
    expect(WORK_FRAGMENT).toContain('(1.0 - radial) +');
  });

  it('covers the whole frame at uDissolve = 1 and none of it at 0', () => {
    // Re-derives the shader's own arithmetic: `front` has to start below the
    // smallest `field` any pixel can produce and end above the largest, or
    // the card either starts part-dissolved or never finishes dissolving —
    // and the second failure leaves a frozen half-burned card on screen.
    const noiseMax = 0.12 + 0.13 + 0.06;
    const band = 0.10; // smoothstep(front - 0.10, front + 0.01, field)
    const frontAt = (d: number) => d * 1.53 - 0.11;
    // radial is clamped to [0, 1], so field = (1 - radial) + noise spans
    // [0, 1 + noiseMax].
    expect(frontAt(0) + 0.01).toBeLessThan(0);
    expect(frontAt(1) - band).toBeGreaterThan(1 + noiseMax);
    // And the constants above are the ones actually in the source.
    expect(WORK_FRAGMENT).toContain('float front = uDissolve * 1.53 - 0.11;');
    expect(WORK_FRAGMENT).toContain('smoothstep(front - 0.10, front + 0.01, field)');
    expect(WORK_FRAGMENT).toContain('vnoise(vUv * uAspect * 7.0) * 0.12');
    expect(WORK_FRAGMENT).toContain('vnoise(vUv * uAspect * 19.0) * 0.13');
    expect(WORK_FRAGMENT).toContain('vnoise(vUv * uAspect * 47.0) * 0.06');
  });

  it('keeps the base grain multiplicative so a black frame stays black', () => {
    // Measured on work-audience.png (mean luma 7.1/255) with hero.ts's
    // additive grain at the same nominal amplitude: mean 7.1 -> 7.9 and
    // high-frequency energy 2.88 -> 7.69, a clean black frame turned into a
    // dithered one, because additive noise on black can only ever add.
    expect(WORK_FRAGMENT).toContain('col *= 1.0 + (g - 0.5) * 0.075;');
    // The heavier dissolve grain is confined to the burn rim for the same
    // reason: past the front the frame is black.
    expect(WORK_FRAGMENT).toContain('col += (g2 - 0.5) * rim * 0.09;');
  });

  it('keeps the tuned constants the ripple was calibrated with', () => {
    // Retuned once, by eye, from 5/22/3: that envelope lit the frame to its
    // corners with one and a half rings inside it, which reads as a torch
    // rather than a ripple. 44/6 preserves 22/3's phase velocity exactly.
    expect(WORK_FRAGMENT).toContain('float envelope = 8.0 * d * exp(1.0 - 8.0 * d);');
    expect(WORK_FRAGMENT).toContain('sin(d * 44.0 - uTime * 6.0) * envelope * uHover * 0.010');
    expect(WORK_FRAGMENT).toContain('col = col * (1.0 + lift * 0.12) + lift * 0.022;');
  });

  it('never writes an alpha below 1', () => {
    // The canvas is alpha: true and the DOM photograph is still underneath.
    // Dissolving by fading alpha would reveal an IDENTICAL picture — i.e.
    // dissolve to nothing at all — which is why the dissolve resolves to
    // black in the shader instead.
    const writes = WORK_FRAGMENT.match(/gl_FragColor\s*=[^;]*;/g) ?? [];
    expect(writes).toEqual(['gl_FragColor = vec4(col, 1.0);']);
  });
});
