import { DISTANCE, DURATION, EASE, SCALE_FROM, SCROLL, STAGGER, flag, num } from './tokens';

export type MotionName = 'moveUp' | 'split' | 'parallax' | 'fade' | 'scale' | 'marquee';

const MOTION_NAMES: readonly string[] = [
  'moveUp', 'split', 'parallax', 'fade', 'scale', 'marquee',
];

export function isMotionName(value: string | null): value is MotionName {
  return value != null && MOTION_NAMES.includes(value);
}

export interface TweenSpec {
  from: Record<string, unknown>;
  to: Record<string, unknown>;
}

function delayOf(el: Element): number {
  return num(el.getAttribute('data-delay'), 0);
}

/**
 * `data-stagger` is presence-as-true: bare means the base token, an explicit
 * number overrides it, absent means no stagger at all.
 */
function staggerOf(el: Element, base: number): number {
  if (!flag(el, 'data-stagger')) return 0;
  return num(el.getAttribute('data-stagger'), base);
}

export function buildMoveUp(el: Element): TweenSpec {
  return {
    from: { y: DISTANCE.md, opacity: 0 },
    to: {
      y: 0,
      opacity: 1,
      duration: DURATION.base,
      ease: EASE.out,
      delay: delayOf(el),
      stagger: staggerOf(el, STAGGER.base),
    },
  };
}

export function buildFade(el: Element): TweenSpec {
  return {
    from: { opacity: 0 },
    to: {
      opacity: 1,
      duration: DURATION.base,
      ease: EASE.out,
      delay: delayOf(el),
      stagger: staggerOf(el, STAGGER.base),
    },
  };
}

export function buildScale(el: Element): TweenSpec {
  return {
    from: { scale: num(el.getAttribute('data-from'), SCALE_FROM) },
    to: {
      scale: num(el.getAttribute('data-to'), 1),
      duration: DURATION.slow,
      ease: EASE.out,
      delay: delayOf(el),
    },
  };
}

/**
 * Travel is symmetric about zero so the element sits at its authored position
 * mid-viewport. Linear easing is required: with scrub, easing would decouple
 * motion from scroll position.
 */
export function buildParallax(el: Element): TweenSpec {
  const speed = num(el.getAttribute('data-speed'), 1);
  const travel = DISTANCE.lg * speed;
  return {
    from: { y: travel },
    to: { y: -travel, ease: EASE.none },
  };
}

export function buildSplit(el: Element): TweenSpec {
  return {
    from: { yPercent: 100 },
    to: {
      yPercent: 0,
      duration: DURATION.base,
      ease: EASE.out,
      delay: delayOf(el),
      stagger: num(el.getAttribute('data-stagger'), STAGGER.tight),
    },
  };
}

export function buildScrollTriggerVars(el: Element): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    start: el.getAttribute('data-start') ?? SCROLL.start,
    end: el.getAttribute('data-end') ?? SCROLL.end,
  };
  if (flag(el, 'data-scrub')) {
    const raw = el.getAttribute('data-scrub');
    vars.scrub = raw == null || raw.trim() === '' ? true : num(raw, 1);
  }
  return vars;
}
