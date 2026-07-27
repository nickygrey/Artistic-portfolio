/** Shared easing scale. Every primitive draws from this. */
export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  none: 'none',
} as const;

/** Seconds. */
export const DURATION = {
  fast: 0.5,
  base: 0.9,
  slow: 1.4,
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
