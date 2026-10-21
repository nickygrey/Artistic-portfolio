import { describe, it, expect } from 'vitest';
import { parseFrame, withFrame } from '../../src/gallery/frame-param';

describe('parseFrame', () => {
  it.each([
    ['?frame=3', 3],
    ['?a=1&frame=7', 7],
    ['?frame=0', null],
    ['?frame=8', null],
    ['?frame=2.5', null],
    ['?frame=abc', null],
    ['?frame=', null],
    ['', null],
  ])('%s → %s', (search, expected) => {
    expect(parseFrame(search, 7)).toBe(expected);
  });
});

describe('withFrame', () => {
  it('sets the frame and keeps other params and the hash', () => {
    expect(withFrame('https://x/work/p/?a=1#h', 4)).toBe('/work/p/?a=1&frame=4#h');
  });

  it('replaces an existing frame', () => {
    expect(withFrame('https://x/work/p/?frame=2', 5)).toBe('/work/p/?frame=5');
  });

  it('removes the frame, leaving a clean path', () => {
    expect(withFrame('https://x/work/p/?frame=4', null)).toBe('/work/p/');
  });
});
