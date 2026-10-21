import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { DRAG } from '../motion/tokens';
import { registerSurface, WEBGL_READY_EVENT } from '../webgl';
import { getScene } from '../webgl/renderer';
import { bendShader, bendUniforms, normaliseDrag } from '../webgl/shaders/bend';
import { scatter, type Tile } from './scatter';
import { wrapInto } from './wrap';

gsap.registerPlugin(Observer);

/** Only real pointers get the canvas; touch keeps the scrolling grid. */
export const CANVAS_QUERY = '(hover: hover) and (pointer: fine)';
const CELL = 380;

let active: { x: number; y: number } | null = null;

export function mountCanvas(root: HTMLElement): (() => void) | null {
  if (!window.matchMedia(CANVAS_QUERY).matches) return null;
  const originals = [...root.querySelectorAll<HTMLElement>('[data-frame]')];
  if (!originals.length) return null;

  // A small gallery would leave the endless canvas mostly empty, so its frames
  // repeat (as the reference's do) until about 60% of the canvas's cells are
  // filled. Repeats are hidden from assistive tech and skipped by Tab, so
  // each photograph is announced and focused exactly once.
  const cells = Math.ceil((innerWidth + CELL) / CELL) * Math.ceil((innerHeight + CELL) / CELL);
  const copies = Math.max(1, Math.ceil((cells * 0.6) / originals.length));
  const clones: HTMLElement[] = [];
  for (let c = 1; c < copies; c++) {
    for (const li of originals) {
      const clone = li.cloneNode(true) as HTMLElement;
      clone.setAttribute('aria-hidden', 'true');
      clone.dataset.clone = '';
      clone.querySelector('a')?.setAttribute('tabindex', '-1');
      li.parentElement!.append(clone);
      clones.push(clone);
    }
  }
  const frames = [...originals, ...clones];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const aspects = frames.map((f) => Number(f.dataset.aspect) || 1);
  const groups = frames.map((_, i) => i % originals.length);
  const seed = Number(root.dataset.seed) || 1;
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  let tile: Tile;
  let travelled = 0;

  function layout() {
    tile = scatter(aspects, { cell: CELL, seed, minWidth: innerWidth + CELL, minHeight: innerHeight + CELL, groups });
    frames.forEach((f, i) => {
      f.style.width = `${tile.placed[i].w}px`;
      f.style.height = `${tile.placed[i].h}px`;
    });
    paint();
  }

  function paint() {
    frames.forEach((f, i) => {
      const p = tile.placed[i];
      const x = wrapInto(p.x + current.x, -p.w, tile.width - p.w);
      const y = wrapInto(p.y + current.y, -p.h, tile.height - p.h);
      f.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }

  function tick() {
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    let travelX = 0;
    let travelY = 0;
    if (Math.abs(dx) >= 0.05 || Math.abs(dy) >= 0.05) {
      const k = reduced ? 1 : 1 - Math.pow(1 - DRAG.follow, gsap.ticker.deltaRatio(60));
      travelX = dx * k;
      travelY = dy * k;
      current.x += travelX;
      current.y += travelY;
      paint();
    }
    // The WebGL bend follows this frame's travel and eases back to flat when the canvas stops.
    const v = bendUniforms.uVelocity.value;
    v[0] += (normaliseDrag(travelX) - v[0]) * 0.2;
    v[1] += (normaliseDrag(travelY) - v[1]) * 0.2;
    if (Math.abs(v[0]) < 0.001) v[0] = 0;
    if (Math.abs(v[1]) < 0.001) v[1] = 0;
  }

  /** Bend surfaces for every frame, clones included. teardownWebGL() destroys them. */
  function registerFrames() {
    if (!getScene().renderer) return;
    for (const f of frames) {
      const img = f.querySelector('img');
      if (img) registerSurface(img, bendShader);
    }
  }

  const observer = Observer.create({
    target: root,
    type: 'wheel,pointer',
    dragMinimum: 2,
    preventDefault: true,
    onPress: () => {
      travelled = 0;
      root.classList.add('is-dragging');
    },
    onDrag: (self) => {
      if (root.dataset.view === 'single') return;
      target.x += self.deltaX;
      target.y += self.deltaY;
      travelled += Math.abs(self.deltaX) + Math.abs(self.deltaY);
    },
    onWheel: (self) => {
      if (root.dataset.view === 'single') return;
      target.x -= self.deltaX * DRAG.wheel;
      target.y -= self.deltaY * DRAG.wheel;
    },
    onRelease: (self) => {
      root.classList.remove('is-dragging');
      if (!reduced && travelled > DRAG.clickSlop) {
        target.x += gsap.utils.clamp(-DRAG.maxVelocity, DRAG.maxVelocity, self.velocityX) * DRAG.throw;
        target.y += gsap.utils.clamp(-DRAG.maxVelocity, DRAG.maxVelocity, self.velocityY) * DRAG.throw;
      }
    },
  });

  /** Links and images are natively draggable; a native drag would swallow the pointer and stall the pan. */
  function onNativeDrag(e: DragEvent) {
    e.preventDefault();
  }

  function onClick(e: MouseEvent) {
    if (travelled > DRAG.clickSlop) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function onKey(e: KeyboardEvent) {
    const step = { ArrowLeft: [CELL, 0], ArrowRight: [-CELL, 0], ArrowUp: [0, CELL], ArrowDown: [0, -CELL] }[e.key];
    if (!step || e.altKey || e.metaKey || e.ctrlKey || root.dataset.view === 'single') return;
    e.preventDefault();
    target.x += step[0];
    target.y += step[1];
  }

  /** Keyboard users tab through frames in order; bring each one into view as it takes focus. */
  function onFocus(e: FocusEvent) {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-frame]');
    if (!li) return;
    const r = li.getBoundingClientRect();
    if (r.left >= 0 && r.right <= innerWidth && r.top >= 64 && r.bottom <= innerHeight - 96) return;
    target.x += innerWidth / 2 - (r.left + r.width / 2);
    target.y += innerHeight / 2 - (r.top + r.height / 2);
  }

  let resizeFrame = 0;
  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  }

  root.classList.add('is-canvas');
  document.documentElement.classList.add('canvas-open');
  active = current;
  layout();
  // Open on the cover photograph, centred: the image the home strip showed, so the transition lands on it.
  const first = tile!.placed[Math.max(0, originals.findIndex((li) => li.hasAttribute('data-cover')))];
  target.x = current.x = innerWidth / 2 - (first.x + first.w / 2);
  target.y = current.y = innerHeight / 2 - (first.y + first.h / 2);
  paint();

  gsap.ticker.add(tick);
  root.addEventListener('click', onClick, true);
  root.addEventListener('dragstart', onNativeDrag);
  root.addEventListener('focusin', onFocus);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  document.addEventListener(WEBGL_READY_EVENT, registerFrames);
  registerFrames();

  return () => {
    active = null;
    document.removeEventListener(WEBGL_READY_EVENT, registerFrames);
    bendUniforms.uVelocity.value = [0, 0];
    document.documentElement.classList.remove('canvas-open');
    observer.kill();
    gsap.ticker.remove(tick);
    cancelAnimationFrame(resizeFrame);
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('dragstart', onNativeDrag);
    root.removeEventListener('focusin', onFocus);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    root.classList.remove('is-canvas', 'is-dragging');
    clones.forEach((c) => c.remove());
    originals.forEach((f) => f.removeAttribute('style'));
  };
}

export function observerCount(): number {
  return Observer.getAll().length;
}

/** Unwrapped canvas offset, for tests: frame rects wrap around the tile, the offset never does. */
export function canvasOffset(): { x: number; y: number } | null {
  return active && { x: active.x, y: active.y };
}
