import { DURATION, EASE, STAGGER } from '../motion/tokens';

/** Below this width the strips stack as horizontal bands (HomeView.astro's CSS uses the same breakpoint). */
export const STRIPS_STACKED_QUERY = '(max-width: 760px)';

/** `gsap.from` vars: each strip opens from its centre line, across its short side. */
export function buildStripReveal(stacked: boolean) {
  return {
    clipPath: stacked ? 'inset(0% 50% 0% 50%)' : 'inset(50% 0% 50% 0%)',
    duration: DURATION.slow,
    ease: EASE.inOut,
    stagger: STAGGER.base,
    clearProps: 'clipPath',
  };
}
