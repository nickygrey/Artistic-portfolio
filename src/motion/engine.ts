import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import {
  buildFade, buildMoveUp, buildParallax, buildScale, buildSplit,
  buildScrollTriggerVars, isMotionName,
} from './primitives';

gsap.registerPlugin(ScrollTrigger, SplitText);

export interface MotionContext {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
}

type CustomHandler = (el: HTMLElement, ctx: MotionContext) => void;

const custom = new Map<string, CustomHandler>();
const splits: SplitText[] = [];
let lenis: Lenis | null = null;
let mm: gsap.MatchMedia | null = null;

export function registerMotion(name: string, fn: CustomHandler): void {
  custom.set(name, fn);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isTouch(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * Lenis is constructed once and reused across navigations. It is driven by
 * gsap.ticker rather than its own RAF loop so scroll and tweens share a clock.
 */
function ensureLenis(): void {
  if (lenis || prefersReducedMotion() || isTouch()) return;

  lenis = new Lenis({
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time: number) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function applyPrimitive(el: HTMLElement, name: string): void {
  const targets = el.hasAttribute('data-stagger') ? Array.from(el.children) : el;
  const st = buildScrollTriggerVars(el);

  if (name === 'split') {
    const split = new SplitText(el, {
      type: 'lines',
      linesClass: 'motion-line',
      mask: 'lines',
      autoSplit: true,
    });
    splits.push(split);
    const spec = buildSplit(el);
    gsap.fromTo(split.lines, spec.from, {
      ...spec.to,
      scrollTrigger: { trigger: el, ...st },
    });
    return;
  }

  if (name === 'parallax') {
    const spec = buildParallax(el);
    gsap.fromTo(el, spec.from, {
      ...spec.to,
      scrollTrigger: { trigger: el, scrub: true, ...st },
    });
    return;
  }

  const spec =
    name === 'fade' ? buildFade(el) :
    name === 'scale' ? buildScale(el) :
    buildMoveUp(el);

  gsap.fromTo(targets, spec.from, {
    ...spec.to,
    scrollTrigger: { trigger: el, ...st },
  });
}

function scan(): void {
  document.querySelectorAll<HTMLElement>('[data-animation]').forEach((el) => {
    const name = el.getAttribute('data-animation');
    if (!name) return;

    const handler = custom.get(name);
    if (handler) {
      handler(el, { gsap, ScrollTrigger });
      return;
    }

    if (isMotionName(name) && name !== 'marquee') {
      applyPrimitive(el, name);
    }
  });
}

/** Kill every trigger and revert every split. Must leave nothing behind. */
export function teardownMotion(): void {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  while (splits.length) splits.pop()?.revert();
  mm?.revert();
  mm = null;
}

export function initMotion(): void {
  teardownMotion();

  if (prefersReducedMotion()) {
    // Nothing animates; elements are authored visible, so there is
    // nothing to reveal. Lenis is deliberately never constructed.
    return;
  }

  ensureLenis();
  lenis?.scrollTo(0, { immediate: true });

  mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    scan();
    ScrollTrigger.refresh();
  });
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__motion = {
    triggerCount: () => ScrollTrigger.getAll().length,
  };
}
