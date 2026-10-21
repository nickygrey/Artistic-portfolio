import { gsap } from 'gsap';
import { registerMotion } from '../motion';
import { DURATION, EASE } from '../motion/tokens';
import { registerSurface, WEBGL_READY_EVENT } from '../webgl';
import { computeCoverUv } from '../webgl/geometry';
import { getScene } from '../webgl/renderer';
import { createTintShader } from '../webgl/shaders/tint';

const STRIPS = '[data-animation="strips"]';

/**
 * One tint surface per strip. Registered only once the strips have opened:
 * a mesh follows its image's box but not its clip-path, so during the reveal
 * it would show the whole photograph while the strip is still a sliver.
 */
function registerTints(root: HTMLElement) {
  if (!getScene().renderer || root.dataset.tinted !== undefined) return;
  root.dataset.tinted = '';

  root.querySelectorAll<HTMLAnchorElement>('a.strip').forEach((strip) => {
    const img = strip.querySelector('img');
    if (!img) return;
    const { spec, uniforms } = createTintShader(getComputedStyle(strip).getPropertyValue('--tint').trim());

    const fitCover = () => {
      const r = img.getBoundingClientRect();
      const cover = computeCoverUv({ width: img.naturalWidth, height: img.naturalHeight }, r, { x: 0.5, y: 0.5 });
      uniforms.uCoverScale.value = cover.scale;
      uniforms.uCoverOffset.value = cover.offset;
    };
    const toHover = gsap.quickTo(uniforms.uHover, 'value', { duration: DURATION.fast, ease: EASE.out });
    const on = () => toHover(1);
    const off = () => toHover(0);

    fitCover();
    img.addEventListener('load', fitCover);
    window.addEventListener('resize', fitCover);
    strip.addEventListener('mouseenter', on);
    strip.addEventListener('mouseleave', off);
    strip.addEventListener('focus', on);
    strip.addEventListener('blur', off);

    registerSurface(img, spec, {
      onDestroy: () => {
        img.removeEventListener('load', fitCover);
        window.removeEventListener('resize', fitCover);
        strip.removeEventListener('mouseenter', on);
        strip.removeEventListener('mouseleave', off);
        strip.removeEventListener('focus', on);
        strip.removeEventListener('blur', off);
        gsap.killTweensOf(uniforms.uHover);
        // A fresh renderer (the second initWebGL of a page load) registers again.
        delete root.dataset.tinted;
      },
    });
  });
}

export function registerStrips(): void {
  // The reveal itself is a CSS animation (HomeView.astro). This only waits for it
  // to finish before the WebGL tints arrive.
  registerMotion('strips', (el) => {
    const opening = [...el.querySelectorAll<HTMLElement>('[data-strip-media]')].flatMap((m) => m.getAnimations());
    const revealed = () => {
      el.dataset.revealed = '';
      registerTints(el);
    };
    if (!opening.length) revealed();
    else Promise.all(opening.map((a) => a.finished)).then(revealed, () => {});
  });

  document.addEventListener(WEBGL_READY_EVENT, () => {
    const root = document.querySelector<HTMLElement>(STRIPS);
    if (root && root.dataset.revealed !== undefined) registerTints(root);
  });
}
