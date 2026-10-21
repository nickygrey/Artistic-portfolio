import { describe, it, expect } from 'vitest';
import { wrapInto } from '../../src/gallery/wrap';

describe('wrapInto', () => {
  it('leaves values inside the range alone', () => expect(wrapInto(5, 0, 10)).toBe(5));
  it('wraps values past the end', () => expect(wrapInto(23, 0, 10)).toBe(3));
  it('wraps negative values', () => expect(wrapInto(-3, 0, 10)).toBe(7));
  it('includes min and excludes max', () => {
    expect(wrapInto(0, 0, 10)).toBe(0);
    expect(wrapInto(10, 0, 10)).toBe(0);
  });
  it('works for ranges that start below zero', () => expect(wrapInto(-150, -100, 300)).toBe(250));
});
