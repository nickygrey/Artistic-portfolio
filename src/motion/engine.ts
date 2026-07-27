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

function shouldDisableLenis(): boolean {
  return prefersReducedMotion() || isTouch();
}

/**
 * Named so it can be removed from gsap.ticker again in destroyLenis(). An
 * inline arrow here would be unremovable — gsap.ticker.remove() needs the
 * exact function reference that was added.
 */
function tick(time: number): void {
  lenis?.raf(time * 1000);
}

/**
 * Lenis is constructed once and reused across navigations. It is driven by
 * gsap.ticker rather than its own RAF loop so scroll and tweens share a clock.
 */
function ensureLenis(): void {
  if (lenis || shouldDisableLenis()) return;

  lenis = new Lenis({
    duration: 1.1,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
}

/**
 * Reverses ensureLenis(). Only called when the gating condition
 * (reduced motion or touch) has become true for a Lenis instance that
 * already exists — e.g. the user toggled OS reduced-motion mid-session
 * without a full reload. In the ordinary case Lenis is left alone across
 * navigations, per ensureLenis()'s doc comment.
 */
function destroyLenis(): void {
  if (!lenis) return;
  gsap.ticker.remove(tick);
  lenis.destroy();
  lenis = null;
  // lagSmoothing(0) in ensureLenis() is a page-wide gsap.ticker setting,
  // not scoped to Lenis — restore GSAP's own defaults (threshold 500ms,
  // adjustment 33ms) so disabling lag compensation doesn't outlive Lenis
  // and degrade unrelated animations for the rest of the session.
  gsap.ticker.lagSmoothing(500, 33);
}

function applyPrimitive(el: HTMLElement, name: string): void {
  const targets = el.hasAttribute('data-stagger') ? Array.from(el.children) : el;
  const st = buildScrollTriggerVars(el);

  if (name === 'split') {
    const spec = buildSplit(el);
    // autoSplit re-runs split() (destroying and recreating .lines) whenever
    // web fonts finish loading after this point — virtually guaranteed with
    // font-display: swap. The tween must be created inside onSplit and
    // returned from it, or SplitText has no way to re-time it against the
    // new line elements and the re-split lines never animate.
    const split = new SplitText(el, {
      type: 'lines',
      linesClass: 'motion-line',
      mask: 'lines',
      autoSplit: true,
      onSplit: (self) => gsap.fromTo(self.lines, spec.from, {
        ...spec.to,
        scrollTrigger: { trigger: el, ...st },
      }),
    });
    splits.push(split);
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

  // Destroys an already-running Lenis if the gating condition has become
  // true since it was constructed (e.g. OS reduced-motion toggled mid
  // session, no full reload). Ordinary navigations with an unchanged
  // environment leave an existing Lenis untouched.
  if (shouldDisableLenis()) destroyLenis();

  if (prefersReducedMotion()) {
    // Nothing animates; elements are authored visible, so there is
    // nothing to reveal. Lenis is deliberately never constructed.
    return;
  }

  ensureLenis();
  // resize(), not scrollTo(0): astro:page-load fires after ClientRouter has
  // already restored scroll position (or landed on a hash target). This
  // only resyncs Lenis's cached content/viewport geometry against the new
  // DOM without moving the scroll position out from under the router.
  lenis?.resize();

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
