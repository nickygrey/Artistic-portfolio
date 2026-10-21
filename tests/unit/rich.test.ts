import { describe, it, expect } from 'vitest';
import { richText } from '../../src/lib/rich';

const portrait = { href: '/work/portrait/', label: 'portraits', accent: '#9fc3d6' };
const analog = { href: '/work/analog/', label: 'analog', accent: '#e8a57a' };

describe('richText', () => {
  it('returns plain text as one segment', () => {
    expect(richText('Just words.', {})).toEqual([{ text: 'Just words.' }]);
  });

  it('splits placeholders into links, in order', () => {
    expect(richText('Spans {portrait} and {analog} work.', { portrait, analog })).toEqual([
      { text: 'Spans ' },
      { link: portrait },
      { text: ' and ' },
      { link: analog },
      { text: ' work.' },
    ]);
  });

  it('makes no empty text segments at the edges', () => {
    expect(richText('{portrait} first, last {analog}', { portrait, analog })).toEqual([
      { link: portrait },
      { text: ' first, last ' },
      { link: analog },
    ]);
  });

  it('fails loudly on a placeholder it has no link for', () => {
    expect(() => richText('See {portriat}.', { portrait })).toThrow(/portriat/);
  });
});
