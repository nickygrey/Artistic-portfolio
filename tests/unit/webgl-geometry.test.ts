import { describe, it, expect } from 'vitest';
import {
  computeMeshTransform,
  computeCoverUv,
  computeScissorBox,
  parseObjectPosition,
  type Box,
  type MeshRect,
  type Viewport,
} from '../../src/webgl/geometry';

/** A rect covering the full viewport, e.g. a full-bleed hero image. */
function fullViewportRect(viewport: Viewport): MeshRect {
  return { left: 0, top: 0, width: viewport.width, height: viewport.height, bottom: viewport.height };
}

const VIEWPORT: Viewport = { width: 1280, height: 800 };
const FOV = 45;
const Z = 5;

describe('computeMeshTransform', () => {
  it('centers a full-viewport rect at the origin with no residual offset', () => {
    const t = computeMeshTransform(fullViewportRect(VIEWPORT), VIEWPORT, FOV, Z);
    expect(t.x).toBeCloseTo(0, 10);
    expect(t.y).toBeCloseTo(0, 10);
    expect(t.visible).toBe(true);
  });

  it('scales a full-viewport rect to exactly the camera frustum at that fov/z', () => {
    const t = computeMeshTransform(fullViewportRect(VIEWPORT), VIEWPORT, FOV, Z);
    const expectedH = 2 * Math.tan((FOV * Math.PI) / 360) * Z;
    const expectedW = expectedH * (VIEWPORT.width / VIEWPORT.height);
    expect(t.sx).toBeCloseTo(expectedW, 10);
    expect(t.sy).toBeCloseTo(expectedH, 10);
  });

  it('offsets right and up in world space for a rect in the top-right quadrant', () => {
    // A 200x200 box whose center sits right-of-center and above-center.
    const rect: MeshRect = { left: 1000, top: 50, width: 200, height: 200, bottom: 250 };
    const t = computeMeshTransform(rect, VIEWPORT, FOV, Z);
    expect(t.x).toBeGreaterThan(0);
    // Screen-space "up" (small `top`) must map to positive world-space y —
    // this is the one axis the conversion deliberately flips (see the
    // leading `-` in geometry.ts), because CSS y grows downward while the
    // camera's world-space y grows upward.
    expect(t.y).toBeGreaterThan(0);
  });

  it('offsets left and down in world space for a rect in the bottom-left quadrant', () => {
    const rect: MeshRect = { left: 0, top: 600, width: 200, height: 200, bottom: 800 };
    const t = computeMeshTransform(rect, VIEWPORT, FOV, Z);
    expect(t.x).toBeLessThan(0);
    expect(t.y).toBeLessThan(0);
  });

  it('shrinks scale proportionally to a smaller rect', () => {
    const half: MeshRect = { left: 0, top: 0, width: VIEWPORT.width / 2, height: VIEWPORT.height / 2, bottom: VIEWPORT.height / 2 };
    const full = computeMeshTransform(fullViewportRect(VIEWPORT), VIEWPORT, FOV, Z);
    const t = computeMeshTransform(half, VIEWPORT, FOV, Z);
    expect(t.sx).toBeCloseTo(full.sx / 2, 10);
    expect(t.sy).toBeCloseTo(full.sy / 2, 10);
  });

  it('reflects a live GSAP scrub transform: a shrinking rect (data-from 1.15 -> data-to 1) tracks continuously, not just at the endpoints', () => {
    // Mirrors SelectedWork.astro's .project-scale: as the scrub progresses,
    // getBoundingClientRect() reports a continuously shrinking box centered
    // on the same point. This is the exact scenario the task brief calls
    // out as "the hardest part" — the mesh must follow every intermediate
    // frame, not snap only at scroll start/end.
    const center = { x: 600, y: 400 };
    const steps = [1.15, 1.1, 1.05, 1.0];
    const transforms = steps.map((scale) => {
      const w = 400 * scale;
      const h = 300 * scale;
      const rect: MeshRect = {
        left: center.x - w / 2,
        top: center.y - h / 2,
        width: w,
        height: h,
        bottom: center.y - h / 2 + h,
      };
      return computeMeshTransform(rect, VIEWPORT, FOV, Z);
    });

    // Scale shrinks monotonically...
    for (let i = 1; i < transforms.length; i++) {
      expect(transforms[i].sx).toBeLessThan(transforms[i - 1].sx);
      expect(transforms[i].sy).toBeLessThan(transforms[i - 1].sy);
    }
    // ...while staying centered on the same screen point throughout, exactly
    // as a CSS `scale()` transform (which scales from the element's own
    // center) would.
    for (const t of transforms) {
      expect(t.x).toBeCloseTo(transforms[0].x, 10);
      expect(t.y).toBeCloseTo(transforms[0].y, 10);
    }
  });

  it('is visible when any part of the rect overlaps the viewport vertically', () => {
    const straddlingTop: MeshRect = { left: 0, top: -50, width: 200, height: 100, bottom: 50 };
    const straddlingBottom: MeshRect = { left: 0, top: VIEWPORT.height - 50, width: 200, height: 100, bottom: VIEWPORT.height + 50 };
    expect(computeMeshTransform(straddlingTop, VIEWPORT, FOV, Z).visible).toBe(true);
    expect(computeMeshTransform(straddlingBottom, VIEWPORT, FOV, Z).visible).toBe(true);
  });

  it('is not visible once fully scrolled above or below the viewport', () => {
    const aboveViewport: MeshRect = { left: 0, top: -500, width: 200, height: 100, bottom: -400 };
    const belowViewport: MeshRect = { left: 0, top: VIEWPORT.height + 10, width: 200, height: 100, bottom: VIEWPORT.height + 110 };
    expect(computeMeshTransform(aboveViewport, VIEWPORT, FOV, Z).visible).toBe(false);
    expect(computeMeshTransform(belowViewport, VIEWPORT, FOV, Z).visible).toBe(false);
  });

  it('is not visible exactly at the boundary (bottom === 0 or top === viewport height)', () => {
    // Strict inequalities in geometry.ts (`bottom > 0`, `top < height`), so
    // an element whose last visible pixel has just scrolled past the edge
    // reads as not visible rather than off-by-one visible.
    const atTopEdge: MeshRect = { left: 0, top: -100, width: 200, height: 100, bottom: 0 };
    const atBottomEdge: MeshRect = { left: 0, top: VIEWPORT.height, width: 200, height: 100, bottom: VIEWPORT.height + 100 };
    expect(computeMeshTransform(atTopEdge, VIEWPORT, FOV, Z).visible).toBe(false);
    expect(computeMeshTransform(atBottomEdge, VIEWPORT, FOV, Z).visible).toBe(false);
  });

  it('produces a different frustum size for a different fov/z, proving these are real inputs, not hardcoded', () => {
    const a = computeMeshTransform(fullViewportRect(VIEWPORT), VIEWPORT, 45, 5);
    const b = computeMeshTransform(fullViewportRect(VIEWPORT), VIEWPORT, 60, 8);
    expect(a.sx).not.toBeCloseTo(b.sx, 5);
    expect(a.sy).not.toBeCloseTo(b.sy, 5);
  });

  it('adapts scale to the viewport aspect ratio', () => {
    const wide: Viewport = { width: 1600, height: 800 };
    const tall: Viewport = { width: 800, height: 1600 };
    const wideT = computeMeshTransform(fullViewportRect(wide), wide, FOV, Z);
    const tallT = computeMeshTransform(fullViewportRect(tall), tall, FOV, Z);
    // Height (world units) is aspect-independent (derived from fov/z alone);
    // width scales with the viewport's own aspect ratio.
    expect(wideT.sy).toBeCloseTo(tallT.sy, 10);
    expect(wideT.sx).toBeGreaterThan(tallT.sx);
  });
});

/** The real hero photograph's intrinsic size (src/assets/hero.jpg). */
const HERO_NATURAL = { width: 2400, height: 1943 };
/** Hero.astro's own `object-position: center 30%`. */
const HERO_POSITION = { x: 0.5, y: 0.3 };

/**
 * Samples the texture coordinate the shader would produce for a plane UV,
 * mirroring `texture2D(tMap, uv * uCoverScale + uCoverOffset)` exactly, so
 * these assertions talk about where the shader actually looks rather than
 * about the intermediate scale/offset pair.
 */
function sample(uv: [number, number], cover: { scale: [number, number]; offset: [number, number] }) {
  return [uv[0] * cover.scale[0] + cover.offset[0], uv[1] * cover.scale[1] + cover.offset[1]];
}

describe('computeCoverUv', () => {
  it('leaves a texture whose aspect already matches the box completely untouched', () => {
    const cover = computeCoverUv({ width: 1000, height: 500 }, { width: 400, height: 200 }, { x: 0.5, y: 0.5 });
    expect(cover.scale).toEqual([1, 1]);
    expect(cover.offset[0]).toBeCloseTo(0, 10);
    expect(cover.offset[1]).toBeCloseTo(0, 10);
  });

  it('crops the surplus WIDTH when the image is wider than the box, showing full height', () => {
    // 2:1 image into a 1:1 box — half the width is surplus.
    const cover = computeCoverUv({ width: 1000, height: 500 }, { width: 400, height: 400 }, { x: 0.5, y: 0.5 });
    expect(cover.scale[0]).toBeCloseTo(0.5, 10);
    expect(cover.scale[1]).toBeCloseTo(1, 10);
    // Centred: the window runs 0.25..0.75 across, and the full 0..1 down.
    expect(sample([0, 0], cover)[0]).toBeCloseTo(0.25, 10);
    expect(sample([1, 0], cover)[0]).toBeCloseTo(0.75, 10);
    expect(sample([0, 0], cover)[1]).toBeCloseTo(0, 10);
    expect(sample([0, 1], cover)[1]).toBeCloseTo(1, 10);
  });

  it('crops the surplus HEIGHT when the image is taller than the box, showing full width', () => {
    const cover = computeCoverUv({ width: 500, height: 1000 }, { width: 400, height: 400 }, { x: 0.5, y: 0.5 });
    expect(cover.scale[0]).toBeCloseTo(1, 10);
    expect(cover.scale[1]).toBeCloseTo(0.5, 10);
    expect(sample([0, 0], cover)[1]).toBeCloseTo(0.25, 10);
    expect(sample([0, 1], cover)[1]).toBeCloseTo(0.75, 10);
  });

  it('never distorts: the sampled window always has the box\'s aspect ratio', () => {
    // The whole point of the correction. For any image/box pair, the number
    // of source pixels the window spans horizontally vs vertically must be in
    // the box's proportion — otherwise the photograph is stretched, which is
    // exactly the defect a raw 0..1 mapping produces.
    const cases = [
      { natural: HERO_NATURAL, box: { width: 1280, height: 900 } },
      { natural: HERO_NATURAL, box: { width: 1920, height: 1080 } },
      { natural: HERO_NATURAL, box: { width: 390, height: 844 } },
      { natural: { width: 800, height: 600 }, box: { width: 300, height: 900 } },
    ];
    for (const { natural, box } of cases) {
      const cover = computeCoverUv(natural, box, HERO_POSITION);
      const spanPxX = cover.scale[0] * natural.width;
      const spanPxY = cover.scale[1] * natural.height;
      expect(spanPxX / spanPxY).toBeCloseTo(box.width / box.height, 6);
    }
  });

  it('keeps the whole window inside the texture — no sampling past an edge', () => {
    for (const box of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 2560, height: 700 }]) {
      const cover = computeCoverUv(HERO_NATURAL, box, HERO_POSITION);
      const [x0, y0] = sample([0, 0], cover);
      const [x1, y1] = sample([1, 1], cover);
      expect(x0).toBeGreaterThanOrEqual(-1e-9);
      expect(y0).toBeGreaterThanOrEqual(-1e-9);
      expect(x1).toBeLessThanOrEqual(1 + 1e-9);
      expect(y1).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('honours object-position 30%: less is cropped off the top than off the bottom', () => {
    // Hero.astro frames the subject with `object-position: center 30%`, so
    // the crop is biased towards keeping the upper part of the frame. UVs are
    // bottom-up (OGL uploads <img> textures with flipY), so "kept off the
    // top" is the distance from the window's upper edge to v = 1.
    const cover = computeCoverUv(HERO_NATURAL, { width: 1280, height: 900 }, HERO_POSITION);
    const croppedFromTop = 1 - sample([0, 1], cover)[1];
    const croppedFromBottom = sample([0, 0], cover)[1];
    const total = 1 - cover.scale[1];
    expect(croppedFromTop).toBeCloseTo(total * 0.3, 10);
    expect(croppedFromBottom).toBeCloseTo(total * 0.7, 10);
    expect(croppedFromTop).toBeLessThan(croppedFromBottom);
  });

  it('centres the crop at 50% and pins it to one edge at 0% / 100%', () => {
    const box = { width: 1280, height: 900 };
    const top = computeCoverUv(HERO_NATURAL, box, { x: 0.5, y: 0 });
    const bottom = computeCoverUv(HERO_NATURAL, box, { x: 0.5, y: 1 });
    // y: 0% keeps the very top of the photo — window's upper edge at v = 1.
    expect(sample([0, 1], top)[1]).toBeCloseTo(1, 10);
    // y: 100% keeps the very bottom — window's lower edge at v = 0.
    expect(sample([0, 0], bottom)[1]).toBeCloseTo(0, 10);
  });

  it('returns the identity window for an image that has not decoded yet', () => {
    // <img>.naturalWidth is 0 until decode; a NaN leaking into the uniform
    // from this would blow out the entire frame in GLSL rather than fail
    // quietly, so the untransformed mapping is the correct stand-in.
    const cover = computeCoverUv({ width: 0, height: 0 }, { width: 1280, height: 900 }, HERO_POSITION);
    expect(cover.scale).toEqual([1, 1]);
    expect(cover.offset).toEqual([0, 0]);
    for (const n of [...cover.scale, ...cover.offset]) expect(Number.isFinite(n)).toBe(true);
  });

  it('returns the identity window for a zero-sized box', () => {
    const cover = computeCoverUv(HERO_NATURAL, { width: 0, height: 0 }, HERO_POSITION);
    expect(cover.scale).toEqual([1, 1]);
    expect(cover.offset).toEqual([0, 0]);
  });
});

describe('parseObjectPosition', () => {
  it('parses the computed two-percentage form Chrome reports', () => {
    expect(parseObjectPosition('50% 30%')).toEqual({ x: 0.5, y: 0.3 });
    expect(parseObjectPosition('0% 100%')).toEqual({ x: 0, y: 1 });
    expect(parseObjectPosition('  50%   25%  ')).toEqual({ x: 0.5, y: 0.25 });
  });

  it('centres the axis it cannot express as a fraction', () => {
    // A length has no leftover-space fraction without knowing the crop
    // overflow, and neither does a keyword Chrome failed to normalise.
    expect(parseObjectPosition('10px 30%')).toEqual({ x: 0.5, y: 0.3 });
    expect(parseObjectPosition('50% top')).toEqual({ x: 0.5, y: 0.5 });
  });

  it('centres both axes for missing, empty or malformed input', () => {
    for (const value of [null, undefined, '', '   ', 'nonsense']) {
      expect(parseObjectPosition(value)).toEqual({ x: 0.5, y: 0.5 });
    }
  });

  it('treats a single component as horizontal, centred vertically, per the CSS shorthand', () => {
    expect(parseObjectPosition('20%')).toEqual({ x: 0.2, y: 0.5 });
  });
});

describe('computeScissorBox', () => {
  const VP: Viewport = { width: 1280, height: 900 };

  /** The hero's real shape mid-scroll: a section clipped at the top of the
   * viewport, and an <img> the GSAP scrub has pushed past its bottom edge. */
  const section: Box = { left: 0, top: -300, width: 1280, height: 900 };
  const overhangingImg: Box = { left: -51, top: -336, width: 1382, height: 972 };

  it('clips a rect to the ancestor that overflow:hidden confines it to', () => {
    const s = computeScissorBox(overhangingImg, [section], VP, 1);
    // The section's bottom edge is at viewport y=600; nothing below it.
    expect(s.height).toBe(600);
    expect(s.y).toBe(VP.height - 600);
    expect(s.visible).toBe(true);
  });

  it('is the difference between painting inside the section and 36px past it', () => {
    const clipped = computeScissorBox(overhangingImg, [section], VP, 1);
    const unclipped = computeScissorBox(overhangingImg, [], VP, 1);
    // Without the clip the mesh would reach the <img>'s own bottom edge —
    // 36px of hero photograph painted over whatever follows the section.
    expect(unclipped.height - clipped.height).toBe(36);
    expect(unclipped.y).toBe(VP.height - 636);
  });

  it('never extends past the viewport even with no clipping ancestor at all', () => {
    const s = computeScissorBox({ left: -100, top: -100, width: 2000, height: 2000 }, [], VP, 1);
    expect(s).toEqual({ x: 0, y: 0, width: VP.width, height: VP.height, visible: true });
  });

  it('intersects every clipping ancestor, not just the nearest', () => {
    const near: Box = { left: 0, top: 0, width: 1280, height: 800 };
    const far: Box = { left: 200, top: 0, width: 400, height: 900 };
    const s = computeScissorBox({ left: 0, top: 0, width: 1280, height: 900 }, [near, far], VP, 1);
    expect(s.x).toBe(200);
    expect(s.width).toBe(400);
    expect(s.height).toBe(800);
  });

  it('reports not-visible for a rect scrolled entirely above the viewport', () => {
    const s = computeScissorBox({ left: 0, top: -1000, width: 1280, height: 900 }, [], VP, 1);
    expect(s.visible).toBe(false);
    expect(s.width * s.height).toBe(0);
  });

  it('reports not-visible when the clip and the rect do not overlap', () => {
    const s = computeScissorBox(
      { left: 0, top: 0, width: 100, height: 100 },
      [{ left: 400, top: 0, width: 100, height: 100 }],
      VP,
      1
    );
    expect(s.visible).toBe(false);
  });

  it('scales into drawing-buffer pixels at dpr 2, bottom-left origin included', () => {
    const s = computeScissorBox({ left: 10, top: 20, width: 100, height: 200 }, [], VP, 2);
    expect(s).toEqual({
      x: 20,
      // top 20 + height 200 = bottom edge at CSS y 220; 900-220 = 680 CSS px
      // from the bottom, doubled.
      y: (VP.height - 220) * 2,
      width: 200,
      height: 400,
      visible: true,
    });
  });

  it('keeps opposite edges on the same device-pixel grid at a fractional dpr', () => {
    // A rect whose edges land on halves: rounding origin+size independently
    // would put the far edge one pixel away from where the element paints.
    const s = computeScissorBox({ left: 10.3, top: 0, width: 100.4, height: 100 }, [], VP, 1.5);
    expect(s.x).toBe(Math.round(10.3 * 1.5));
    expect(s.x + s.width).toBe(Math.round((10.3 + 100.4) * 1.5));
  });

  it('never returns a negative width or height for an inverted intersection', () => {
    const s = computeScissorBox(
      { left: 0, top: 0, width: 100, height: 100 },
      [{ left: 500, top: 500, width: 100, height: 100 }],
      VP,
      1
    );
    expect(s.width).toBeGreaterThanOrEqual(0);
    expect(s.height).toBeGreaterThanOrEqual(0);
  });
});
