import { canvasOffset, mountCanvas, observerCount } from './canvas';
import { mountSingle } from './single';

/*
 * Loaded on every page (Layout.astro), not just galleries: the canvas must be
 * laid out at astro:after-swap, before the View Transition takes its snapshot
 * of the new page, and a gallery's own scripts only run after that.
 */
let mounted: HTMLElement | null = null;
let destroyCanvas: (() => void) | null = null;
let destroySingle: (() => void) | null = null;

function teardown() {
  destroySingle?.();
  destroyCanvas?.();
  destroySingle = destroyCanvas = null;
  mounted = null;
}

function mount() {
  const root = document.querySelector<HTMLElement>('[data-gallery]');
  if (root && root === mounted) return; // already mounted at after-swap; page-load follows on the same page
  teardown();
  if (!root) return;
  mounted = root;
  destroyCanvas = mountCanvas(root);
  destroySingle = mountSingle(root);
}

document.addEventListener('astro:after-swap', mount);
document.addEventListener('astro:page-load', mount);
document.addEventListener('astro:before-swap', teardown);

(window as unknown as Record<string, unknown>).__gallery = {
  observers: observerCount,
  mounted: () => destroyCanvas !== null,
  offset: canvasOffset,
};
