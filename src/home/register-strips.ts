import { registerMotion } from '../motion';
import { buildStripReveal, STRIPS_STACKED_QUERY } from './strips';

export function registerStrips(): void {
  registerMotion('strips', (el, { gsap }) => {
    const media = el.querySelectorAll<HTMLElement>('[data-strip-media]');
    gsap.from(media, buildStripReveal(window.matchMedia(STRIPS_STACKED_QUERY).matches));
  });
}
