import { describe, it, expect } from 'vitest';
import { buildFrames, coverOf, isGalleryImage } from '../../src/lib/gallery';

const img = (file: string) => ({ file, image: `IMG:${file}` });

describe('isGalleryImage', () => {
  it('accepts jpg, jpeg, png and webp in any case', () => {
    for (const f of ['a.jpg', 'a.JPG', 'a.jpeg', 'a.png', 'a.WEBP']) expect(isGalleryImage(f)).toBe(true);
  });

  it('rejects everything else', () => {
    for (const f of ['.gitkeep', 'notes.txt', 'clip.mov', 'jpg']) expect(isGalleryImage(f)).toBe(false);
  });
});

describe('buildFrames', () => {
  it('returns no frames for an empty folder', () => {
    expect(buildFrames('portrait', [])).toEqual([]);
  });

  it('orders by filename, numerically, and indexes from 1', () => {
    const frames = buildFrames('portrait', [img('10.jpg'), img('2.jpg'), img('1.jpg')]);
    expect(frames.map((f) => [f.index, f.file])).toEqual([[1, '1.jpg'], [2, '2.jpg'], [3, '10.jpg']]);
  });

  it('skips files that are not images', () => {
    expect(buildFrames('portrait', [img('.gitkeep'), img('a.jpg')]).map((f) => f.file)).toEqual(['a.jpg']);
  });

  it('without credits, the first frame is the cover and no frame has a credit', () => {
    const frames = buildFrames('portrait', [img('b.jpg'), img('a.jpg')]);
    expect(frames.map((f) => f.cover)).toEqual([true, false]);
    expect(frames.every((f) => f.credit === undefined)).toBe(true);
  });

  it('attaches a partial credit and defaults roles to []', () => {
    const [frame] = buildFrames('documentary', [img('a.jpg')], [{ file: 'a.jpg', film: 'https://youtu.be/x' }]);
    expect(frame.credit).toEqual({ roles: [], film: 'https://youtu.be/x' });
  });

  it('a cover-only entry moves the cover without creating a credit', () => {
    const frames = buildFrames('portrait', [img('a.jpg'), img('b.jpg')], [{ file: 'b.jpg', cover: true }]);
    expect(frames.map((f) => f.cover)).toEqual([false, true]);
    expect(frames[1].credit).toBeUndefined();
    expect(coverOf(frames)?.file).toBe('b.jpg');
  });

  it('rejects credits for an image that is not in the folder, naming it', () => {
    expect(() => buildFrames('portrait', [img('a.jpg')], [{ file: 'typo.jpg', title: 'X' }])).toThrow(
      /portrait.*typo\.jpg/
    );
  });

  it('rejects the same file listed twice', () => {
    expect(() =>
      buildFrames('portrait', [img('a.jpg')], [{ file: 'a.jpg' }, { file: 'a.jpg' }])
    ).toThrow(/a\.jpg.*twice/);
  });

  it('rejects more than one cover', () => {
    expect(() =>
      buildFrames('portrait', [img('a.jpg'), img('b.jpg')], [
        { file: 'a.jpg', cover: true },
        { file: 'b.jpg', cover: true },
      ])
    ).toThrow(/at most one/);
  });
});

describe('buildFrames: maxWidth', () => {
  it('carries a per-photograph width cap through to the frame', () => {
    const [frame] = buildFrames('wedding', [img('a.jpg')], [{ file: 'a.jpg', alt: 'x', maxWidth: 960 }]);
    expect(frame.credit?.maxWidth).toBe(960);
  });

  it('a cap alone still makes a credit, so the cap is not lost', () => {
    const [frame] = buildFrames('wedding', [img('a.jpg')], [{ file: 'a.jpg', maxWidth: 960 }]);
    expect(frame.credit).toEqual({ roles: [], maxWidth: 960 });
  });
});
