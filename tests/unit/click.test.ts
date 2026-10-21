import { describe, it, expect } from 'vitest';
import { isPlainPrimaryClick } from '../../src/lib/click';

/**
 * Used by `src/motion/engine.ts`, which must let a modifier-click on a
 * same-page anchor reach the browser's native handling.
 */
describe('isPlainPrimaryClick', () => {
  it('accepts the plain primary click', () => {
    expect(isPlainPrimaryClick({ button: 0 })).toBe(true);
  });

  it('accepts a click with no button at all', () => {
    // Keyboard activation of a link dispatches a click that some engines
    // leave without a meaningful `button`. That IS the primary action.
    expect(isPlainPrimaryClick({})).toBe(true);
    expect(isPlainPrimaryClick({ button: undefined })).toBe(true);
  });

  it('rejects every modifier and every non-primary button', () => {
    // These open a BACKGROUND tab, so the visitor never leaves the page —
    // which is the whole premise of both callers. See
    // tests/e2e/modifier-click.spec.ts for the regression behind it.
    expect(isPlainPrimaryClick({ metaKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ ctrlKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ shiftKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ altKey: true, button: 0 })).toBe(false);
    expect(isPlainPrimaryClick({ button: 1 })).toBe(false);
    expect(isPlainPrimaryClick({ button: 2 })).toBe(false);
  });

  it('rejects a modifier even when the button is absent', () => {
    // The widening for keyboard clicks must not become a hole: a
    // cmd-Enter-style activation is still not the plain primary action.
    expect(isPlainPrimaryClick({ metaKey: true })).toBe(false);
    expect(isPlainPrimaryClick({ shiftKey: true })).toBe(false);
  });
});
