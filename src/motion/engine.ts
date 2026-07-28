import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import {
  buildFade, buildMoveUp, buildParallax, buildScale, buildSplit,
  buildScrollTriggerVars, isMotionName,
} from './primitives';
import { LENIS, num } from './tokens';

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
 * Lenis's own `anchors: true` click handler (onClick in lenis.mjs) never
 * calls event.preventDefault(). Verified in a real Chrome browser via
 * window.scrollTo() call tracing: for a same-page hash link, Chromium
 * performs the native fragment-jump *synchronously during the same click
 * dispatch*, before this handler's bubble-phase listener on `window` even
 * runs — so by the time Lenis computes its own scroll target, the page has
 * already jumped and Lenis's cached `animatedScroll` (still 0, since no
 * scroll event has been processed yet) is stale. Lenis's target formula is
 * `elementRect.top + this.animatedScroll`; with the element now already at
 * the top of the viewport (rect.top ~ 0) and a stale cached scroll of 0,
 * that computes a bogus near-zero target instead of the anchor's real
 * offset — and Lenis then forcibly drags the page back to ~0 on its very
 * next tick, undoing the (correct) native jump. Net effect: clicking
 * #about landed back at the top of the page instead of animating to it.
 *
 * Fix: suppress the native jump ourselves, in the capture phase (so it
 * runs before the target's own default action, which is where the jump
 * was observed to happen) so it never fires at all. Lenis's own click
 * handler still runs and still calls scrollTo — but now against an
 * undisturbed scroll position, so its target is correct and it animates
 * properly. Detection mirrors Lenis's own same-host/same-pathname/has-hash
 * check so this only intercepts the exact clicks `anchors: true` also
 * handles.
 *
 * Modifier-clicks and non-primary mouse buttons are explicitly excluded:
 * a cmd-click (macOS) or ctrl-click (Windows/Linux) on one of these same
 * links means "open in a new background tab", not "follow it here", and
 * must fall through to the browser's native handling untouched — same for
 * shift-click (new window) and alt-click (download). Without this guard
 * the capture-phase preventDefault() below fired for those too, silently
 * cancelling the new tab and leaving Lenis's bubble-phase handler (which
 * has no modifier check of its own) to smooth-scroll the current tab
 * instead — a regression this same fix introduced. `event.button !== 0`
 * catches non-primary buttons the same way; middle-click is not in scope
 * here since Chromium and Firefox fire `auxclick`, not `click`, for the
 * middle button, so this listener never observes it regardless.
 */
function preventNativeAnchorJump(event: MouseEvent): void {
  const link = (event.target as Element | null)?.closest?.('a[href]');
  if (!link) return;

  let url: URL;
  try {
    url = new URL((link as HTMLAnchorElement).href, window.location.href);
  } catch {
    return;
  }

  const current = new URL(window.location.href);
  if (url.host !== current.host || url.pathname !== current.pathname || !url.hash) return;

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    suppressNextLenisAnchorClick = true;
    return;
  }

  event.preventDefault();
}

/**
 * Set synchronously, from preventNativeAnchorJump above, only when a click
 * matched Lenis's own anchor criteria *and* carried a modifier/non-primary
 * button. Consumed once by suppressLenisAnchorClick() below, on the very
 * next 'click' Lenis itself would otherwise act on.
 */
let suppressNextLenisAnchorClick = false;

/**
 * Lenis's own onClick (lenis.mjs, registered on `window` at the bubble
 * phase) runs the identical host/pathname/hash match with no modifier
 * check of its own, and it runs regardless of what preventNativeAnchorJump
 * does — bailing out of preventDefault() there only stops *our* side
 * effect, it does not stop Lenis from also matching this same click and
 * calling its scrollTo. Verified in a real browser: without this,
 * cmd-clicking a nav link correctly opened the target in a background tab
 * *but also* smooth-scrolled the current tab out from under it.
 *
 * Two approaches were tried and rejected before this one:
 *
 * 1. event.stopPropagation() in preventNativeAnchorJump's capture-phase
 *    listener. Rejected: it would also silence every *other* bubble-phase
 *    listener on this same click — Header.astro's own "close the mobile
 *    menu" handlers, one attached directly to each nav link and one on
 *    `document` for outside-clicks — which have nothing to do with Lenis
 *    and should still run on a modifier-click.
 *
 * 2. Flipping lenis.options.anchors to false in the capture-phase
 *    listener and restoring it on a queueMicrotask() right after.
 *    Rejected: verified in a real browser (via a temporary
 *    console.trace() in lenis.scrollTo) that this does *not* work — the
 *    HTML event-loop spec runs a microtask checkpoint after *each
 *    individual listener invocation* during dispatch, not just once after
 *    the whole capture→target→bubble sequence finishes. So the
 *    queueMicrotask() callback ran and restored `anchors` back to `true`
 *    immediately after our own capture-phase listener returned — still
 *    several listeners *before* Lenis's bubble-phase onClick was reached
 *    — and onClick then read `anchors: true` and called scrollTo as
 *    normal. A plain boolean flag read once, synchronously, by a listener
 *    that fires and is fully done before Lenis's own runs sidesteps this
 *    entirely; there is no restore step, hence no window for it to fire
 *    at the wrong time.
 *
 * This listener is what makes that possible: registered on `window` in
 * ensureLenis() *before* `new Lenis(...)` constructs and adds its own
 * bubble-phase 'click' listener on the same `window` object. Same node,
 * same phase, listeners run in registration order — so this one always
 * runs first. When it finds the flag set (only true for the one click
 * that just set it, in the same synchronous dispatch), it calls
 * event.stopImmediatePropagation(), which prevents any *other* listener
 * registered on this exact node from running for this dispatch — here,
 * that is solely Lenis's onClick. Every listener on every other node
 * (the link itself, `document`, etc.) has already run by this point in
 * the bubble phase and is unaffected either way.
 */
function suppressLenisAnchorClick(event: MouseEvent): void {
  if (!suppressNextLenisAnchorClick) return;
  suppressNextLenisAnchorClick = false;
  event.stopImmediatePropagation();
}

/**
 * Lenis is constructed once and reused across navigations. It is driven by
 * gsap.ticker rather than its own RAF loop so scroll and tweens share a clock.
 *
 * `anchors: true` is what makes in-page hash links (the header nav, the
 * hero's #reel CTA) animate instead of teleporting — Lenis intercepts their
 * clicks and runs its own scrollTo, which by default reuses this same
 * instance's duration/easing below rather than needing them repeated. See
 * preventNativeAnchorJump()'s doc comment for why that listener has to run
 * alongside this option, not just the option by itself.
 * `html { scroll-behavior: smooth }` was removed in an earlier commit
 * because it fought with Lenis's own scroll handling; this (both pieces
 * together) is what was supposed to replace it and didn't. Lenis itself is
 * never constructed on touch devices (see shouldDisableLenis()), so none
 * of this runs there — touch gets a CSS `scroll-behavior: smooth`
 * fallback instead (see global.css, gated on `(hover: none) and
 * (pointer: coarse) and (prefers-reduced-motion: no-preference)`). Under
 * reduced motion neither path runs and anchor clicks jump instantly,
 * which is correct.
 */
function ensureLenis(): void {
  if (lenis || shouldDisableLenis()) return;

  // Registered before `new Lenis` below — see suppressLenisAnchorClick()'s
  // doc comment for why registration order against Lenis's own bubble-phase
  // 'click' listener on this same `window` object matters.
  window.addEventListener('click', suppressLenisAnchorClick);

  lenis = new Lenis({
    duration: LENIS.duration,
    easing: LENIS.easing,
    anchors: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  window.addEventListener('click', preventNativeAnchorJump, true);
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
  window.removeEventListener('click', preventNativeAnchorJump, true);
  window.removeEventListener('click', suppressLenisAnchorClick);
  suppressNextLenisAnchorClick = false;
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
    // Clear transform inline style after animation completes, so CSS hover
    // effects can work again. Only for non-scrub tweens; scrub-linked tweens
    // are continuously driven by scroll and must keep the inline transform.
    ...(st.scrub === undefined && { clearProps: 'transform' }),
  });
}

function scan(): void {
  document.querySelectorAll<HTMLElement>('[data-animation]').forEach((el) => {
    const name = el.getAttribute('data-animation');
    if (!name) return;

    // Opt-out modifier for layouts that only work on the element's untouched
    // DOM below a given viewport width — e.g. `split` replaces its target's
    // children with SplitText's own wrapper, which breaks a small-viewport
    // CSS layout (flex-column stacking, etc.) that depends on the original
    // children being present and countable. Below the given width the
    // element is left completely alone, so its authored resting DOM state
    // (see AGENTS.md: "must be its fully-revealed state") is what renders —
    // no primitive runs, no fallback pass needed. Evaluated once per scan
    // (page load / navigation), not on live resize, matching how every
    // other viewport-dependent rule in this codebase is plain CSS with no
    // JS reactivity to width changes.
    const minWidth = el.getAttribute('data-min-width');
    if (minWidth != null && window.innerWidth < num(minWidth, 0)) return;

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
