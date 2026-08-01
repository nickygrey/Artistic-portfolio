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
