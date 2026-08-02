/**
 * Whether a click is the plain, primary one — no modifier, no secondary
 * button.
 *
 * Shared, because two unrelated systems need the identical answer and a copy
 * in each was a review finding (two places to change, already diverging):
 *
 * - `src/motion/engine.ts`'s `preventNativeAnchorJump()`, which must let a
 *   modifier-click on a same-page anchor fall through to the browser's native
 *   handling untouched (see tests/e2e/modifier-click.spec.ts for the
 *   regression that produced it).
 * - `src/components/SelectedWork.astro`, which must not arm a work card's
 *   re-form on one. A modifier- or middle-click opens a BACKGROUND tab, so
 *   the visitor never leaves this page and never "returns" to it.
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
