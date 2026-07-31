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

export function supported(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

// Named so gsap.ticker.remove() can take it back.
function tick() {
  if (!renderer || !scene || !camera) return;
  for (const s of surfaces) s.update();
  renderer.render({ scene, camera });
}

let frames = 0;
let started = 0;
function fpsGuard() {
  if (frames === 0) started = performance.now();
  frames++;
  if (frames < FPS_SAMPLE_FRAMES) return;
  const fps = (frames * 1000) / (performance.now() - started);
  gsap.ticker.remove(fpsGuard);
  if (fps < FPS_FLOOR) {
    // Too slow to be worth it. The DOM images were never hidden, so the page
    // simply reverts to its unenhanced, entirely functional state.
    teardownWebGL();
  }
}

export function initWebGL(): void {
  teardownWebGL();
  if (!supported()) return;

  renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio, 2) });
  canvas = renderer.gl.canvas as HTMLCanvasElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '1',
  });
  document.body.appendChild(canvas);

  camera = new Camera(renderer.gl, { fov: 45 });
  camera.position.z = 5;
  scene = new Transform();

  resize();
  window.addEventListener('resize', resize, { passive: true });

  gsap.ticker.add(tick);
  frames = 0;
  gsap.ticker.add(fpsGuard);
}

function resize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.perspective({ aspect: window.innerWidth / window.innerHeight });
}

export function teardownWebGL(): void {
  gsap.ticker.remove(tick);
  gsap.ticker.remove(fpsGuard);
  window.removeEventListener('resize', resize);
  while (surfaces.length) surfaces.pop()?.destroy();
  const gl = renderer?.gl;
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
