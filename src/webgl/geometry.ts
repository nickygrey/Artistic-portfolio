/**
 * Pure geometry: element rect + viewport + camera fov/z in, world-space mesh
 * transform out. No DOM, no OGL, no GSAP.
 *
 * This is the calculation `surface.ts`'s `update()` closure runs every
 * `gsap.ticker` frame to keep a mesh registered against an element that may
 * be under a continuous GSAP transform (SelectedWork's scrubbed
 * `.project-scale`, Hero's zoom/parallax timeline). The task brief that
 * introduced this module called registration "the likeliest place for a
 * subtle bug, and it only shows mid-scroll" — extracting the math lets it be
 * checked directly, without a browser, a live OGL mesh, or a GSAP timeline
 * to drive one. Mirrors the split `src/motion/primitives.ts` already
 * establishes for the motion system (see AGENTS.md, "pure logic separates
 * from effects").
 */

export interface MeshRect {
  left: number;
  top: number;
  width: number;
  height: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface MeshTransform {
  x: number;
  y: number;
  sx: number;
  sy: number;
  visible: boolean;
}

/**
 * Converts an element's live CSS-pixel rect into the position/scale a mesh
 * needs at the given camera `fov`/`z` to sit exactly over that element, plus
 * whether any part of it is within the viewport vertically.
 *
 * `h`/`w` are the world-space height/width of the camera's view plane at
 * `z` — a perspective camera's frustum cross-section at distance `z` is
 * `2 * tan(fov/2) * z` tall, and `w` follows from the viewport's aspect
 * ratio. Every position/scale below is that same CSS-pixel-to-world-unit
 * conversion applied to `rect`, so the mesh lands at exactly the screen
 * position `rect` describes.
 */
export function computeMeshTransform(
  rect: MeshRect,
  viewport: Viewport,
  fov: number,
  z: number
): MeshTransform {
  const h = 2 * Math.tan((fov * Math.PI) / 360) * z;
  const w = h * (viewport.width / viewport.height);

  return {
    sx: (rect.width / viewport.width) * w,
    sy: (rect.height / viewport.height) * h,
    x: ((rect.left + rect.width / 2) / viewport.width - 0.5) * w,
    y: -((rect.top + rect.height / 2) / viewport.height - 0.5) * h,
    // Only the vertical extent is checked, matching the horizontal-agnostic
    // full-bleed/full-viewport-width targets (Hero, ImageBand) this exists
    // for — a mesh scrolled off the top or bottom is culled from rendering.
    visible: rect.bottom > 0 && rect.top < viewport.height,
  };
}
