/**
 * Whether a click is the plain, primary one — no modifier, no secondary
 * button.
 *
 * `src/motion/engine.ts`'s `preventNativeAnchorJump()` must let a
 * modifier-click on a same-page anchor fall through to the browser's native
 * handling untouched: a modifier- or middle-click opens a background tab, and
 * the current page must not scroll as if it had been followed.
 *
 * `button` absent counts as primary. Keyboard activation of a link dispatches
 * a click that some engines leave without a meaningful `button`, and that IS
 * the primary action. Real `MouseEvent`s always carry one, so this is a
 * widening for synthetic and keyboard-originated events only — it does not
 * change what either caller sees from a real mouse.
 *
 * Deliberately takes a structural type rather than `MouseEvent`, so it is
 * callable and testable without a DOM.
 */
export function isPlainPrimaryClick(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
}): boolean {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return event.button == null || event.button === 0;
}
