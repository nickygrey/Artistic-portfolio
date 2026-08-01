import { describe, it, expect } from 'vitest';
import { computeMeshTransform, type MeshRect, type Viewport } from '../../src/webgl/geometry';

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
