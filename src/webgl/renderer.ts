import { Renderer, Camera, Transform } from 'ogl';
import gsap from 'gsap';

let renderer: Renderer | null = null;
let scene: Transform | null = null;
let camera: Camera | null = null;
let canvas: HTMLCanvasElement | null = null;

export interface SurfaceHandle {
  update: () => void;
  destroy: () => void;
  /** Live mesh/element geometry, for registration assertions in tests. */
  debug: () => {
    el: string;
    rect: DOMRect;
    mesh: { x: number; y: number; sx: number; sy: number };
    visible: boolean;
  };
}

const surfaces: SurfaceHandle[] = [];

/** Frames sampled before judging whether this device can hold the effects. */
const FPS_SAMPLE_FRAMES = 60;
const FPS_FLOOR = 50;

/**
 * Whether this browser can create a WebGL context at all. `null` means
 * "not probed yet"; once probed, the answer cannot change for the life of
 * the page (a browser doesn't gain or lose WebGL support mid-session), so
 * it is cached rather than re-probed on every initWebGL() call — this
 * module gets called at least twice per page load (see Layout.astro) and
 * again on every client-side navigation.
 *
 * Deliberately separate from the live prefers-reduced-motion check in
 * supported() below: that one genuinely can change mid-session (the user
 * can flip the OS setting without a reload — see src/motion/engine.ts's
 * destroyLenis() for the same distinction) and must stay live, not cached.
 */
let webglAvailable: boolean | null = null;

function probeWebGLAvailability(): boolean {
  if (webglAvailable !== null) return webglAvailable;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    webglAvailable = !!gl;
    // Release immediately. This probe context counts against the browser's
    // cap on live WebGL contexts exactly like the real renderer's own
    // context does (see teardownWebGL()) — the difference is this one is
    // never used again after this line, so leaving it alive bought nothing
    // and, left unbounded across enough navigations, risks the browser
    // evicting the *real*, in-use context to make room instead.
    (gl as WebGLRenderingContext | WebGL2RenderingContext | null)
      ?.getExtension('WEBGL_lose_context')
      ?.loseContext();
  } catch {
    webglAvailable = false;
  }
  return webglAvailable;
}

export function supported(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return probeWebGLAvailability();
}

// Named so gsap.ticker.remove() can take it back.
function tick() {
  if (!renderer || !scene || !camera) return;
  for (const s of surfaces) s.update();
  renderer.render({ scene, camera });
}

let frames = 0;
let started = 0;

function resetFpsSample(): void {
  frames = 0;
  started = 0;
}

/**
 * `visibilitychange` fires synchronously on the transition, unlike
 * gsap.ticker's underlying requestAnimationFrame — which Chrome throttles
 * to roughly 1fps (some browsers stop calling it at all) once a tab is
 * hidden. Without this, a sample that straddles a hidden period measures
 * wall-clock time across a handful of real frames and computes an
 * artificially low fps — e.g. someone backgrounding this tab to open
 * several links at once during the first second — and fpsGuard would
 * permanently disable WebGL on a perfectly capable machine for that
 * session. Restarting the sample on *any* visibility transition (both
 * hidden and visible-again) discards a straddling sample instead of
 * trusting it.
 */
function handleVisibilityChange(): void {
  resetFpsSample();
}

function fpsGuard() {
  // Covers the case where the tab is already hidden when a ticker frame
  // lands (e.g. this navigation happened in a background tab) — the
  // visibilitychange listener alone only catches *transitions*, not the
  // state at the moment fpsGuard starts sampling.
  if (document.hidden) {
    resetFpsSample();
    return;
  }
  if (frames === 0) started = performance.now();
  frames++;
  if (frames < FPS_SAMPLE_FRAMES) return;
  const fps = (frames * 1000) / (performance.now() - started);
  gsap.ticker.remove(fpsGuard);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (fps < FPS_FLOOR) {
    // Too slow to be worth it. The DOM images were never hidden, so the page
    // simply reverts to its unenhanced, entirely functional state.
    //
    // This fires at most once per initWebGL() call, not continuously for
    // the rest of the page's life — every astro:page-load already re-arms
    // a fresh sample (see initWebGL() below), which is "re-arming" at
    // navigation granularity. A guard that kept re-sampling indefinitely
    // mid-visit was considered and rejected: yanking a working effect away
    // mid-scroll because of a transient stutter (another tab's background
    // work, a GC pause) is a worse experience than a one-shot, slightly
    // conservative gate that a fresh navigation gets to re-attempt.
    teardownWebGL();
  }
}

/**
 * Context loss can happen for reasons entirely outside this module's
 * control — a GPU driver crash or reset, the OS reclaiming VRAM under
 * memory pressure, another origin's tab monopolising the GPU process — not
 * only the FPS/support checks above. `preventDefault()` is required by the
 * WebGL spec to even be eligible for a future `webglcontextrestored`;
 * without it the browser treats the loss as final regardless. This module
 * doesn't attempt to use that event — it degrades exactly like every other
 * path here: teardownWebGL() undoes everything, and the DOM images (never
 * hidden by any of this) are what's left. The next astro:page-load starts
 * a fully fresh attempt.
 */
function handleContextLost(event: Event): void {
  event.preventDefault();
  teardownWebGL();
}

export function initWebGL(): void {
  teardownWebGL();
  if (!supported()) return;

  renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio, 2) });
  canvas = renderer.gl.canvas as HTMLCanvasElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none',
    // An explicit, non-negative z-index puts this canvas in CSS's "z-index:
    // 0 or auto" paint step — after plain, non-positioned photographs
    // (Hero's <img>, ImageBand's <img>, none of which carry position/
    // z-index of their own) and, for anything tied at that same step
    // (elements that gained a stacking context from a GSAP transform
    // without an explicit z-index — see below), after whichever comes
    // earlier in the DOM. Explicit positive z-index (Hero.astro's
    // .hero-overlay / .hero-content, both z-index: 1) unconditionally wins
    // regardless of DOM order.
    zIndex: '0',
  });
  // Appended inside <main id="main-content">, as its LAST child, not
  // document.body. This is load-bearing, not a style preference:
  // Astro's `transition:name="main-content"` on that element (every page —
  // see src/pages/*.astro) forces it to establish its own stacking context
  // per the View Transitions spec, whether or not a transition is actually
  // in flight. That traps everything inside <main> — a photograph AND the
  // text/overlay layered over it alike — as ONE atomic paint unit relative
  // to a sibling outside <main>. A canvas appended to document.body (a
  // later sibling of <main>) can only ever sit entirely in front of or
  // entirely behind that whole unit; no z-index number threads it between
  // a photograph and its own overlay, because both are on the *same* side
  // of that boundary. Living *inside* main.content puts this canvas back in
  // direct competition with the real elements (Hero's <img>, .hero-overlay,
  // .hero-content) rather than with <main> as a monolith.
  //
  // LAST child specifically — not first — because of a second, independent
  // trap: SelectedWork.astro's `.project-scale` carries a continuously
  // scrubbed `transform: scale(...)` (see surface.ts's registration
  // comment), and ANY element with a non-none `transform` establishes its
  // own stacking context too, even with no `position` and no explicit
  // z-index at all — landing it in the same "z-index: 0/auto" paint step
  // as this canvas, tie-broken by DOM order. Verified empirically (a
  // throwaway probe placed where `.project-scale` renders, mid-scrub):
  // appended last, this canvas wins that tie and paints above the scrubbed
  // photograph, exactly as Task 6/7 need; appended first, `.project-scale`
  // would win instead and the photograph would cover whatever the mesh
  // later draws there.
  (document.getElementById('main-content') ?? document.body).appendChild(canvas);
  canvas.addEventListener('webglcontextlost', handleContextLost, false);

  camera = new Camera(renderer.gl, { fov: 45 });
  camera.position.z = 5;
  scene = new Transform();

  resize();
  window.addEventListener('resize', resize, { passive: true });

  gsap.ticker.add(tick);
  resetFpsSample();
  gsap.ticker.add(fpsGuard);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.perspective({ aspect: window.innerWidth / window.innerHeight });
}

export function teardownWebGL(): void {
  gsap.ticker.remove(tick);
  gsap.ticker.remove(fpsGuard);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('resize', resize);
  while (surfaces.length) surfaces.pop()?.destroy();
  const gl = renderer?.gl;
  canvas?.removeEventListener('webglcontextlost', handleContextLost, false);
  canvas?.remove();
  // Release the GPU context explicitly; browsers cap concurrent contexts and
  // a leaked one across navigations will eventually refuse to create another.
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  renderer = null; scene = null; camera = null; canvas = null;
}

export function getScene() { return { renderer, scene, camera, surfaces }; }

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__webgl = {
    active: () => !!renderer,
    surfaces: () => surfaces.length,
    // Registration is the likeliest place for a subtle bug, and it only shows
    // mid-scroll. Exposing live geometry is what lets a test catch drift.
    debug: () => surfaces.map(s => s.debug()),
  };
}
