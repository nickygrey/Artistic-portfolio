/** Shared easing scale. Every primitive draws from this. */
export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  none: 'none',
  /** Continuous velocity smoothing (gsap.quickTo), not an enter/reveal
   *  curve — kept distinct from `out` so the two can be tuned separately. */
  smooth: 'power2.out',
} as const;

/** Seconds. */
export const DURATION = {
  fast: 0.5,
  base: 0.9,
  slow: 1.4,
  /** How long gsap.quickTo takes to settle onto a new target value (e.g.
   *  the marquee's scroll-velocity speed boost). */
  quickTo: 0.4,
} as const;

/** Default scale an element starts at for the `scale` primitive
 *  (see buildScale in primitives.ts). Also used directly by the hero
 *  background zoom (data-animation="hero"), which replicates this effect
 *  by hand rather than going through buildScale — shared here so the two
 *  can't drift apart if this value is retuned. */
export const SCALE_FROM = 1.08;

/** Seconds for one full marquee loop cycle (see the `marquee` primitive's
 *  fallback when `data-speed` is absent). */
export const MARQUEE_DURATION = 40;

/**
 * Lenis's own smooth-scroll tuning. Kept separate from the GSAP-facing
 * DURATION/EASE scale above because Lenis takes a raw easing *function*,
 * not one of GSAP's named ease strings — the two aren't interchangeable.
 */
export const LENIS = {
  duration: 1.1,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
} as const;

/** Pixels of travel for enter animations. */
export const DISTANCE = {
  sm: 20,
  md: 40,
  lg: 80,
} as const;

/** Seconds between staggered children. */
export const STAGGER = {
  tight: 0.06,
  base: 0.1,
  loose: 0.16,
} as const;

/** Default ScrollTrigger window for enter animations. */
export const SCROLL = {
  start: 'top bottom-=10%',
  end: 'bottom top+=10%',
} as const;

/**
 * Parse a data-attribute value as a number.
 * Attribute values are strings, absent, or present-but-empty; all of the
 * non-numeric cases fall back rather than producing NaN.
 */
export function num(value: string | null | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Presence-as-true, for valueless attributes like `data-scrub`. */
export function flag(el: Element, name: string): boolean {
  return el.hasAttribute(name);
}
