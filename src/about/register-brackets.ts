import { registerMotion } from '../motion';
import { DURATION, EASE, STAGGER } from '../motion/tokens';

const ORIGIN: Record<string, string> = { tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right' };

/** The portrait's corner brackets draw out from their corners, one after another. */
export function registerBrackets(): void {
  registerMotion('brackets', (el, { gsap }) => {
    el.querySelectorAll<HTMLElement>('.frame__corner').forEach((corner, i) => {
      const at = corner.className.match(/frame__corner--(tl|tr|bl|br)/)?.[1] ?? 'tl';
      gsap.from(corner, {
        scale: 0,
        opacity: 0,
        transformOrigin: ORIGIN[at],
        duration: DURATION.base,
        ease: EASE.out,
        delay: DURATION.fast + i * STAGGER.base,
        clearProps: 'transform,opacity',
      });
    });
  });
}
