import { describe, it, expect } from 'vitest';
import { buildStripReveal } from '../../src/home/strips';
import { DURATION, EASE, STAGGER } from '../../src/motion/tokens';

describe('buildStripReveal', () => {
  it('opens tall strips from their horizontal centre line', () => {
    expect(buildStripReveal(false).clipPath).toBe('inset(50% 0% 50% 0%)');
  });

  it('opens stacked bands from their vertical centre line', () => {
    expect(buildStripReveal(true).clipPath).toBe('inset(0% 50% 0% 50%)');
  });

  it('draws timing from the shared scale and leaves no inline clip-path behind', () => {
    expect(buildStripReveal(false)).toMatchObject({
      duration: DURATION.slow,
      ease: EASE.inOut,
      stagger: STAGGER.base,
      clearProps: 'clipPath',
    });
  });
});
