import { gsap } from 'gsap';
import { isPlainPrimaryClick } from '../lib/click';
import { DURATION, EASE } from '../motion/tokens';
import { parseFrame, withFrame } from './frame-param';

/** Pixels a touch must travel sideways on the stage to count as a swipe. */
const SWIPE = 40;

export function mountSingle(root: HTMLElement): () => void {
  const dialog = root.querySelector<HTMLElement>('[data-single]');
  if (!dialog) return () => {};
  const stage = dialog.querySelector<HTMLElement>('[data-stage]')!;
  const figures = [...dialog.querySelectorAll<HTMLElement>('[data-single-frame]')];
  const thumbs = [...dialog.querySelectorAll<HTMLButtonElement>('[data-goto]')];
  const counter = dialog.querySelector<HTMLElement>('[data-count]')!;
  const live = dialog.querySelector<HTMLElement>('[data-live]')!;
  const closeButton = dialog.querySelector<HTMLElement>('.single__close')!;
  const total = figures.length;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = 0;
  let opener: HTMLElement | null = null;
  let swipeX: number | null = null;

  const isOpen = () => !dialog.hidden;

  /** Fit frame `n` inside the stage at its own aspect ratio (66vw at most on wide screens). */
  function fit(n: number) {
    const figure = figures[n - 1];
    const img = figure?.querySelector('img');
    if (!img) return;
    const aspect = Number(root.querySelector<HTMLElement>(`[data-frame="${n}"]`)?.dataset.aspect) || 1;
    const credit = figure.querySelector('figcaption') ? 36 : 0;
    const maxW = innerWidth > 760 ? Math.min(stage.clientWidth, innerWidth * 0.66, 1280) : stage.clientWidth;
    const maxH = stage.clientHeight - credit;
    const w = Math.min(maxW, maxH * aspect);
    img.style.width = `${Math.round(w)}px`;
    img.style.height = `${Math.round(w / aspect)}px`;
  }

  function onResize() {
    if (isOpen()) fit(current);
  }

  function show(n: number) {
    current = n;
    figures.forEach((f) => (f.hidden = Number(f.dataset.singleFrame) !== n));
    fit(n);
    thumbs.forEach((b) => {
      if (Number(b.dataset.goto) === n) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    counter.textContent = `${n} / ${total}`;
    live.textContent = (dialog!.dataset.position ?? '{n} / {total}').replace('{n}', String(n)).replace('{total}', String(total));
    history.replaceState(history.state, '', withFrame(location.href, n));
    thumbs[n - 1]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** FLIP: start the stage image over the grid frame it came from, then let it settle into place. */
  function flyFrom(from: DOMRect) {
    const img = figures[current - 1]?.querySelector('img');
    if (!img) return;
    const to = img.getBoundingClientRect();
    if (!to.width || !to.height || !from.width) return;
    gsap.fromTo(
      img,
      {
        x: from.left - to.left,
        y: from.top - to.top,
        scaleX: from.width / to.width,
        scaleY: from.height / to.height,
        transformOrigin: '0 0',
      },
      { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: DURATION.base, ease: EASE.out, clearProps: 'transform' }
    );
  }

  function open(n: number, source?: HTMLElement) {
    opener = source?.querySelector('a') ?? null;
    // Measured before opening: single view hides the grid, and a hidden frame has no box to fly from.
    const from = source?.getBoundingClientRect();
    dialog!.hidden = false;
    root.dataset.view = 'single';
    document.documentElement.classList.add('single-open');
    show(n);
    closeButton.focus({ preventScroll: true });
    if (from && !reduced) flyFrom(from);
  }

  function close() {
    if (!isOpen()) return;
    gsap.killTweensOf(dialog!.querySelectorAll('img'));
    dialog!.hidden = true;
    delete root.dataset.view;
    document.documentElement.classList.remove('single-open');
    history.replaceState(history.state, '', withFrame(location.href, null));
    const back = opener ?? root.querySelector<HTMLElement>(`[data-frame="${current}"]:not([data-clone]) a`);
    back?.focus();
    opener = null;
  }

  function step(delta: number) {
    show(((current - 1 + delta + total) % total) + 1);
  }

  function onRootClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>('a.gallery__frame');
    if (link && isPlainPrimaryClick(e)) {
      e.preventDefault();
      const li = link.closest<HTMLElement>('[data-frame]')!;
      open(Number(li.dataset.frame), li);
      return;
    }
    if (target.closest('[data-open]')) open(1);
    else if (target.closest('[data-close]')) close();
    else {
      const thumb = target.closest<HTMLElement>('[data-goto]');
      if (thumb) show(Number(thumb.dataset.goto));
    }
  }

  function onKey(e: KeyboardEvent) {
    if (!isOpen() || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Tab') {
      const focusable = [...dialog!.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = dialog!.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onPointerDown(e: PointerEvent) {
    swipeX = e.pointerType === 'mouse' ? null : e.clientX;
  }

  function onPointerUp(e: PointerEvent) {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) >= SWIPE) step(dx < 0 ? 1 : -1);
  }

  root.addEventListener('click', onRootClick);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointerup', onPointerUp);

  const deepLink = parseFrame(location.search, total);
  if (deepLink) open(deepLink);
  else if (location.search.includes('frame=')) history.replaceState(history.state, '', withFrame(location.href, null));

  return () => {
    gsap.killTweensOf(dialog.querySelectorAll('img'));
    root.removeEventListener('click', onRootClick);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointerup', onPointerUp);
    document.documentElement.classList.remove('single-open');
    delete root.dataset.view;
    dialog.hidden = true;
  };
}
