import { describe, it, expect } from 'vitest';
import {
  createWorkUniforms,
  dissolveOriginUv,
  elementUv,
  initialReformState,
  nextReformState,
  REFORM_ARM_MS,
  workShader,
  WORK_FRAGMENT,
  type ReformState,
} from '../../src/webgl/shaders/work';

describe('createWorkUniforms', () => {
  it('gives every card its own uniform objects', () => {
    // The single most consequential difference from hero.ts. registerSurface()
    // spreads these straight into an OGL Program, which then reads `.value`
    // off THESE OBJECTS on every draw — so a module-level object shared by
    // four cards would make all four ripple together from one cursor, and
    // re-form together from one activation. Identity, not equality, is the
    // thing under test.
    const a = createWorkUniforms();
    const b = createWorkUniforms();
    expect(a.uHover).not.toBe(b.uHover);
    expect(a.uMouse).not.toBe(b.uMouse);
    expect(a.uOrigin).not.toBe(b.uOrigin);
    expect(a.uDissolve).not.toBe(b.uDissolve);
    expect(a.uCoverScale).not.toBe(b.uCoverScale);
    a.uHover.value = 1;
    a.uMouse.value = [0.1, 0.9];
    expect(b.uHover.value).toBe(0);
    expect(b.uMouse.value).toEqual([0.5, 0.5]);
  });

  it('keeps the live cursor and the frozen iris origin separate', () => {
    // uMouse moves on every pointermove; uOrigin is captured once, when the
    // link is activated, and must hold still for the whole re-form. Sharing
    // one uniform let a pointer crossing the card mid-re-form drag the iris
    // around with it.
    const u = createWorkUniforms();
    u.uMouse.value = [0.2, 0.8];
    expect(u.uOrigin.value).toEqual([0.5, 0.5]);
  });

  it('rests at "not hovered, not burned, whole texture"', () => {
    // If nothing ever syncs the cover window, the card must show the plain
    // full-texture mapping rather than one built from garbage — and it must
    // certainly not start part-burned. uDissolve 0 IS the fully-revealed
    // state (AGENTS.md), and it is the only state this card ever rests in.
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
    // measured against, so the caption legitimately produces v < 0. For the
    // LIVE ripple, following the pointer onto the nearest edge is right.
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

/**
 * *** The defect this block exists for ***
 *
 * `.card-link` wraps the caption as well as the photograph, so two perfectly
 * ordinary activations land outside the <img>, and `elementUv`'s clamp — right
 * for the live ripple — puts the iris on an edge for them. Measured on the
 * live page before this existed: clicking `.project-title` ran the effect with
 * `uMouse.y = 0`, converging on the frame's BOTTOM edge, so on a portrait the
 * sitter's head was the first thing to go; `Enter` on a focused card dispatched
 * a click at clientX/clientY 0, clamped to the top-left CORNER.
 */
describe('dissolveOriginUv', () => {
  const rect = { left: 100, top: 200, width: 400, height: 225 };

  it('honours a genuine hit inside the photograph', () => {
    expect(dissolveOriginUv(rect, 300, 312.5, false)).toEqual([0.5, 0.5]);
    expect(dissolveOriginUv(rect, 200, 245, false)).toEqual([0.25, 0.8]);
  });

  it('falls back to the centre for a click on the caption', () => {
    // Below the <img>: the caption sits under the frame, so v < 0.
    expect(dissolveOriginUv(rect, 300, 500, false)).toEqual([0.5, 0.5]);
    // And anywhere else outside it, on either axis.
    expect(dissolveOriginUv(rect, 20, 312.5, false)).toEqual([0.5, 0.5]);
    expect(dissolveOriginUv(rect, 9999, 312.5, false)).toEqual([0.5, 0.5]);
    expect(dissolveOriginUv(rect, 300, 10, false)).toEqual([0.5, 0.5]);
  });

  it('falls back to the centre for a keyboard activation', () => {
    // (0, 0) is a legitimate viewport coordinate, so this cannot be inferred
    // from the numbers — `detail === 0` is the signal, read at the call site.
    // Without the flag the same coordinates would be honoured, since a rect
    // containing the viewport origin makes them a real hit.
    const atOrigin = { left: 0, top: 0, width: 400, height: 225 };
    expect(dissolveOriginUv(atOrigin, 0, 0, true)).toEqual([0.5, 0.5]);
    expect(dissolveOriginUv(atOrigin, 0, 0, false)).toEqual([0, 1]);
  });

  it('never returns a point outside the frame, and never NaN', () => {
    for (const [x, y, kb] of [
      [-1e6, -1e6, false], [1e6, 1e6, false], [0, 0, true], [300, 312.5, false],
    ] as Array<[number, number, boolean]>) {
      const [u, v] = dissolveOriginUv(rect, x, y, kb);
      expect(Number.isFinite(u) && Number.isFinite(v)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // A zero-sized rect divides by zero without the guard.
    expect(dissolveOriginUv({ left: 0, top: 0, width: 0, height: 0 }, 5, 5, false))
      .toEqual([0.5, 0.5]);
  });
});

/**
 * *** The property this block exists to make checkable ***
 *
 * The burn runs on RETURN, not on click, and the single non-negotiable
 * property of that arrangement is that **no state of this machine describes a
 * card that is dark**. A click draws nothing; the only thing that ever raises
 * `uDissolve` is the start of a re-form, which is a tween straight back to 0.
 *
 * So the question every case below asks is the same one: if this event is
 * missed, delayed, duplicated or arrives out of order, is the card still fully
 * revealed? Before this inversion the same unreliability in `visibilitychange`
 * left a permanently black rectangle (mean 0.8/255, 97.4% pure black), which
 * the task's acceptance bar forbids outright.
 */
describe('nextReformState', () => {
  const click = (state: ReformState, card: number, at = 0) =>
    nextReformState(state, { type: 'click', card, at });
  const hidden = (state: ReformState, at = 0) => nextReformState(state, { type: 'hidden', at });
  const visible = (state: ReformState) => nextReformState(state, { type: 'visible' });

  it('does not re-form anything on a click', () => {
    // The click is the moment nobody is watching: the tab hands focus away
    // 100-200ms later. Nothing may be drawn here, so nothing can be stranded.
    const step = click(initialReformState(), 2, 1000);
    expect(step.reform).toBeNull();
    expect(step.state.pending).toBeNull();
  });

  it('CLICK AND NEVER RETURN leaves nothing pending and nothing drawn', () => {
    // The C1 configuration: a new window that does not occlude the opener, a
    // background-tab preference, a blocked popup, an assistive activation
    // that never raises the new tab. The old arrangement left a black card
    // here forever; this one leaves an ordinary card and one dead flag.
    let s = click(initialReformState(), 1, 0).state;
    // ...and any number of later clicks still draw nothing.
    s = click(s, 3, 10).state;
    expect(s.pending).toBeNull();
  });

  it('re-forms the clicked card when the visitor comes back', () => {
    let s = click(initialReformState(), 1, 1000).state;
    s = hidden(s, 1120).state;
    const back = visible(s);
    expect(back.reform).toBe(1);
    expect(back.state).toEqual(initialReformState());
  });

  it('does NOT fire on a first page load, or any tab switch without a click', () => {
    // A visitor who has never clicked a card must never see cards animate in
    // from black. Only a HIDE can promote a click into a pending re-form, so
    // a `visible` with nothing clicked finds nothing.
    expect(visible(initialReformState()).reform).toBeNull();
    const s = hidden(initialReformState(), 5000).state;
    expect(s.pending).toBeNull();
    expect(visible(s).reform).toBeNull();
  });

  it('re-forms only the LAST card clicked when several were', () => {
    let s = click(initialReformState(), 0, 100).state;
    s = click(s, 2, 200).state;
    s = click(s, 3, 300).state;
    s = hidden(s, 400).state;
    const back = visible(s);
    expect(back.reform).toBe(3);
  });

  it('re-forms once, not twice, on a duplicated return', () => {
    let s = click(initialReformState(), 2, 0).state;
    s = hidden(s, 100).state;
    const first = visible(s);
    expect(first.reform).toBe(2);
    expect(visible(first.state).reform).toBeNull();
  });

  it('abandons rather than resumes a re-form the visitor left during', () => {
    // RETURN MID-TWEEN, then leave again: the component sets uDissolve back
    // to 0 on every transition, so the card is whole; this must not queue the
    // rest of the burn up to play at some later moment.
    let s = click(initialReformState(), 1, 0).state;
    s = hidden(s, 100).state;
    s = visible(s).state;          // re-form starts
    s = hidden(s, 300).state;      // gone again, mid-tween
    expect(visible(s).reform).toBeNull();
  });

  it('keeps a promoted re-form across a duplicated hide', () => {
    let s = click(initialReformState(), 1, 0).state;
    s = hidden(s, 100).state;
    s = hidden(s, 150).state;
    expect(visible(s).reform).toBe(1);
  });

  it('drops a stale arm rather than firing at an unrelated tab switch', () => {
    // A click whose tab never opened (popup blocker, cancelling extension)
    // leaves the visitor on this page. Without a bound, their next alt-tab —
    // minutes or hours later — would reassemble a card out of nowhere. Losing
    // the effect is the safe direction; it leaves an ordinary card.
    let s = click(initialReformState(), 1, 0).state;
    s = hidden(s, REFORM_ARM_MS + 1).state;
    expect(visible(s).reform).toBeNull();
    // Just inside the window still arms. A real click hands the tab away in
    // 100-200ms, so this bound is generous by more than an order of magnitude.
    let t = click(initialReformState(), 1, 0).state;
    t = hidden(t, REFORM_ARM_MS).state;
    expect(visible(t).reform).toBe(1);
  });

  it('never returns a re-form for a card that was not clicked', () => {
    // Exhaustive over short event sequences: whatever order these arrive in,
    // the only card that can ever be re-formed is one whose link was
    // activated, and at most one at a time.
    const events = [
      { type: 'click', card: 0, at: 0 },
      { type: 'click', card: 1, at: 1 },
      { type: 'hidden', at: 2 },
      { type: 'visible' },
    ] as const;
    for (const a of events) for (const b of events) for (const c of events) for (const d of events) {
      let s = initialReformState();
      const fired: Array<number | null> = [];
      for (const e of [a, b, c, d]) {
        const step = nextReformState(s, e);
        s = step.state;
        if (step.reform !== null) fired.push(step.reform);
      }
      for (const card of fired) expect([0, 1]).toContain(card);
      // And a `visible` always leaves the machine empty, so no sequence can
      // accumulate state that outlives the visit it belongs to.
      expect(nextReformState(s, { type: 'visible' }).state).toEqual(initialReformState());
    }
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
    // work-audience.png is 3024x1964 (aspect 1.5397) — TALLER in proportion
    // than the box, so `cover` crops 13.4% off the top and bottom
    // (computeCoverUv returns scale [1, 0.8659]). Sampling raw uv instead
    // shows that photograph squashed and re-framed against the DOM <img> the
    // mesh is meant to be replacing frame for frame. The three YouTube grabs
    // are exactly 1280x720, so this defect is invisible on three of the four
    // cards — which is precisely why it needs a test.
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
    // stretched 1.78x and the iris with them. Verified in the rendered pixels
    // (the rings are round); pinned here so an edit cannot quietly drop the
    // correction from one of the two.
    expect(WORK_FRAGMENT).toContain('vec2 toCursor = (uv - uMouse) * uAspect;');
    expect(WORK_FRAGMENT).toContain('length((vUv - uOrigin) * uAspect)');
  });

  it('burns inwards, so what was activated is the last thing left', () => {
    // Outwards was tried and rejected: people click the subject, so the frame
    // opened a spreading black hole over the sitter's face. The minus sign is
    // the whole difference between an iris and a censor blob. Run backwards,
    // as a re-form, it is what makes the frame open outwards from that point.
    expect(WORK_FRAGMENT).toContain('float field = 1.0 - radial;');
  });

  /*
   * There used to be a test here called "covers the whole frame at
   * uDissolve = 1 and none of it at 0". It re-derived the shader's own
   * arithmetic from "radial is clamped to [0, 1], so field spans
   * [0, 1 + noiseMax]" — a range the shader could only reach for an origin
   * within 0.33 of a corner, because the divisor was a fixed 1.35 and the
   * largest attainable distance from a centre origin is 1.020. The assertion
   * passed, the arithmetic was correct, and it certified a span the effect did
   * not have: a third of the tween was dead time, and this test is why that
   * shipped unnoticed.
   *
   * It has been replaced, not repaired. The span is now asserted where it can
   * actually be seen — by compiling this exact source in a real GL context and
   * measuring the rendered frame across the tween — in "the burn is visible
   * across almost all of its tween, from any origin" in tests/e2e/webgl.spec.ts.
   * Re-deriving the arithmetic here a second, more careful time would just be
   * the same mistake with better numbers.
   */

  it('keeps the base grain multiplicative so a black frame stays black', () => {
    // Measured on work-audience.png (mean luma ~7/255) with hero.ts's additive
    // grain at its real amplitude (0.045): mean 6.94 -> 8.32 and
    // high-frequency energy 4.48 -> 10.86, a clean black frame turned into a
    // dithered one, because additive noise on black can only ever add.
    expect(WORK_FRAGMENT).toContain('col *= 1.0 + (g - 0.5) * 0.075;');
    // The heavier burn grain is confined to the rim for the same reason: past
    // the front the frame is black.
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

  it('keeps the rim hue adjustable in exactly one place', () => {
    // Of the three constants calibrated against a near-black title card, the
    // rim's fixed warm hue is the one most likely to clash with the owner's
    // real film frames: against a cool or desaturated grade it reads as an
    // orange contamination rather than as celluloid. The value is unchanged
    // and deliberately so; what this pins is that changing it is a one-line
    // edit at a named constant, not a hunt through the shader body.
    expect(WORK_FRAGMENT).toContain('const vec3  RIM_TINT = vec3(1.0, 0.74, 0.46);');
    expect(WORK_FRAGMENT).toContain('const float RIM_GAIN = 0.30;');
    expect(WORK_FRAGMENT).toContain('col += rim * RIM_TINT * RIM_GAIN;');
    // The hue and its strength exist as literals exactly once each: at the
    // named constant. Anything that re-typed either number somewhere in the
    // shader body would make "change it here" untrue.
    expect(WORK_FRAGMENT.match(/vec3\(1\.0, 0\.74, 0\.46\)/g)).toHaveLength(1);
    expect(WORK_FRAGMENT.match(/\b0\.30\b/g)).toHaveLength(1);
  });

  it('never writes an alpha below 1', () => {
    // The canvas is alpha: true and the DOM photograph is still underneath.
    // Burning by fading alpha would reveal an IDENTICAL picture — i.e. burn
    // to nothing at all — which is why it resolves to black in the shader.
    const writes = WORK_FRAGMENT.match(/gl_FragColor\s*=[^;]*;/g) ?? [];
    expect(writes).toEqual(['gl_FragColor = vec4(col, 1.0);']);
  });
});
