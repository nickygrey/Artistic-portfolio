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

/**
 * A viewport-relative rectangle in CSS pixels. `DOMRect` satisfies this
 * structurally, so a `getBoundingClientRect()` can be passed straight in.
 */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MeshRect extends Box {
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

/**
 * A WebGL scissor rectangle, in drawing-buffer pixels, with WebGL's own
 * bottom-left origin. `visible: false` means the rectangle is empty — nothing
 * of this surface is on screen, so it should not be drawn at all rather than
 * drawn into a zero-area scissor.
 */
export interface ScissorBox {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * The clip half of "match the mesh to the element".
 *
 * `computeMeshTransform` above reproduces the element's live *transform*, and
 * that is only half of what the browser does with the element. An ancestor
 * with a non-`visible` `overflow` also *clips* it, and a mesh that honours the
 * transform without the clip paints outside the box CSS confines the element
 * to. That is not hypothetical: Hero's <img> is under a scrubbed
 * `scale: 1.08 -> 1, yPercent: 0 -> 12` tween whose whole point is to make the
 * rect overhang `.hero-fullscreen`, which is `overflow: hidden` precisely so
 * the overhang never shows. Before this existed, the mesh painted 44-84px of
 * hero photograph over the section below it at every scroll position except 0
 * (the only one the tests sampled), and in light theme that dark band landed
 * on near-white type and destroyed its contrast.
 *
 * Expressed as a scissor rectangle rather than by shrinking the mesh: the
 * geometry stays a faithful copy of the element's border box, so the UV
 * mapping, the cover window and the shader are all untouched by clipping, and
 * a clip that changes shape every frame costs no vertex work.
 *
 * `clips` are the border-box rects of every clipping ancestor. The viewport
 * itself is always intersected in as well, since the drawing buffer ends
 * there regardless — which is also why an `overflow` that CSS propagates to
 * the viewport (`body { overflow-x: hidden }`) does not need to be in `clips`
 * to be honoured.
 *
 * Each edge is rounded to the device-pixel grid independently, rather than
 * rounding an origin and a size: rounding the edges keeps the box aligned
 * with the same grid the element's own painted edge lands on, where rounding
 * a width separately could drift the far edge by a pixel.
 */
export function computeScissorBox(
  rect: Box,
  clips: readonly Box[],
  viewport: Viewport,
  dpr: number
): ScissorBox {
  let left = rect.left;
  let top = rect.top;
  let right = rect.left + rect.width;
  let bottom = rect.top + rect.height;

  for (const clip of clips) {
    left = Math.max(left, clip.left);
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.left + clip.width);
    bottom = Math.min(bottom, clip.top + clip.height);
  }

  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, viewport.width);
  bottom = Math.min(bottom, viewport.height);

  const x0 = Math.round(left * dpr);
  const x1 = Math.round(right * dpr);
  const y0 = Math.round(top * dpr);
  const y1 = Math.round(bottom * dpr);

  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);

  return {
    x: x0,
    // CSS measures y downwards from the top of the viewport; WebGL's scissor
    // origin is the BOTTOM-left of the drawing buffer, so the box's top edge
    // in CSS is its distance-from-the-bottom in GL.
    y: Math.round(viewport.height * dpr) - y1,
    width,
    height,
    visible: width > 0 && height > 0,
  };
}

/** Natural (intrinsic) pixel dimensions of a decoded image. */
export interface NaturalSize {
  width: number;
  height: number;
}

/** The element box the image is being fitted into, in CSS pixels. */
export interface BoxSize {
  width: number;
  height: number;
}

/**
 * `object-position` as fractions of the *leftover* space, in CSS's own
 * convention: `x` grows rightwards, `y` grows DOWNWARDS from the top.
 * `{ x: 0.5, y: 0.3 }` is `object-position: center 30%`.
 */
export interface ObjectPosition {
  x: number;
  y: number;
}

/**
 * A UV window into a texture: `texcoord = uv * scale + offset`, expressed in
 * the bottom-up UV space a `Plane` geometry hands the fragment shader (OGL
 * uploads `<img>` textures with `flipY`, so v = 0 is the bottom of the
 * photograph as displayed).
 */
export interface CoverUv {
  scale: [number, number];
  offset: [number, number];
}

/**
 * Reproduces CSS `object-fit: cover` + `object-position` as a UV window.
 *
 * A mesh registered against an <img> covers that element's *border box*, and
 * sampling the texture with the plane's raw 0..1 UVs therefore squashes the
 * whole photograph into the box — which is precisely what `object-fit: cover`
 * does not do. The hero photograph is 2400x1943 (aspect 1.235) rendered into
 * a full-viewport box (aspect 1.42 at 1280x900, 1.78 at 1920x1080), so a raw
 * mapping compresses it vertically by 13-30% against the DOM <img> that is
 * still sitting underneath the canvas. The canvas is meant to *replace* that
 * photograph frame-for-frame with a smear and some grain, not to swap it for
 * a differently-proportioned one; without this correction the enhancement is
 * visibly a distortion, and switching WebGL off would visibly change the
 * photo's proportions.
 *
 * Returns the identity window (`scale [1,1]`, `offset [0,0]`) for any
 * degenerate input — an image that has not decoded yet (`naturalWidth === 0`)
 * or a zero-sized box — so a caller polling this before the image loads gets
 * the untransformed mapping rather than NaNs propagating into a uniform.
 */
export function computeCoverUv(
  natural: NaturalSize,
  box: BoxSize,
  position: ObjectPosition
): CoverUv {
  if (natural.width <= 0 || natural.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { scale: [1, 1], offset: [0, 0] };
  }

  const imageAspect = natural.width / natural.height;
  const boxAspect = box.width / box.height;

  // `cover` scales until BOTH axes are filled, so whichever axis has surplus
  // is the one that gets cropped; the other is shown in full.
  const sx = imageAspect > boxAspect ? boxAspect / imageAspect : 1;
  const sy = imageAspect > boxAspect ? 1 : imageAspect / boxAspect;

  return {
    scale: [sx, sy],
    offset: [
      (1 - sx) * position.x,
      // `position.y` is measured from the top (CSS), the UV window from the
      // bottom (flipY) — so the *bottom* crop takes the complementary share
      // of the surplus. `object-position: center 30%` therefore drops 30% of
      // the cropped height off the top and 70% off the bottom.
      (1 - sy) * (1 - position.y),
    ],
  };
}

/**
 * Parses the *computed* value of `object-position` into leftover-space
 * fractions. Chrome normalises keywords to percentages ("center 30%" reads
 * back as "50% 30%"), which is the only form this site's CSS produces, so
 * percentages are what this handles; a length (`10px`) has no meaningful
 * fraction without also knowing the crop overflow, and an unparseable value
 * has none at all, so both fall back to centred on that axis rather than
 * guessing. A single component means "that value, centred vertically", per
 * the CSS shorthand.
 */
export function parseObjectPosition(value: string | null | undefined): ObjectPosition {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  const fraction = (part: string | undefined): number => {
    if (part == null) return 0.5;
    const match = /^(-?\d+(?:\.\d+)?)%$/.exec(part);
    if (!match) return 0.5;
    return Number(match[1]) / 100;
  };
  return { x: fraction(parts[0]), y: fraction(parts[1]) };
}
