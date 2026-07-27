import { describe, it, expect } from 'vitest';
import { EASE, DURATION, DISTANCE, STAGGER, num, flag } from '../../src/motion/tokens';

describe('tokens', () => {
  it('exposes a single easing scale', () => {
    expect(EASE.out).toBe('power3.out');
    expect(EASE.none).toBe('none');
  });

  it('orders durations fast < base < slow', () => {
    expect(DURATION.fast).toBeLessThan(DURATION.base);
    expect(DURATION.base).toBeLessThan(DURATION.slow);
  });

  it('orders distances and staggers ascending', () => {
    expect(DISTANCE.sm).toBeLessThan(DISTANCE.md);
    expect(DISTANCE.md).toBeLessThan(DISTANCE.lg);
    expect(STAGGER.tight).toBeLessThan(STAGGER.base);
    expect(STAGGER.base).toBeLessThan(STAGGER.loose);
  });
});

describe('num', () => {
  it('parses a numeric string', () => {
    expect(num('0.6', 1)).toBe(0.6);
  });

  it('parses negative and zero', () => {
    expect(num('-2', 1)).toBe(-2);
    expect(num('0', 1)).toBe(0);
  });

  it('falls back on null, undefined, and empty string', () => {
    expect(num(null, 7)).toBe(7);
    expect(num(undefined, 7)).toBe(7);
    expect(num('', 7)).toBe(7);
    expect(num('   ', 7)).toBe(7);
  });

  it('falls back on non-numeric and non-finite input', () => {
    expect(num('fast', 3)).toBe(3);
    expect(num('Infinity', 3)).toBe(3);
    expect(num('NaN', 3)).toBe(3);
  });
});

describe('flag', () => {
  it('is true for a present attribute even when empty', () => {
    const el = { hasAttribute: (n: string) => n === 'data-scrub' } as Element;
    expect(flag(el, 'data-scrub')).toBe(true);
  });

  it('is false for an absent attribute', () => {
    const el = { hasAttribute: () => false } as unknown as Element;
    expect(flag(el, 'data-scrub')).toBe(false);
  });
});
