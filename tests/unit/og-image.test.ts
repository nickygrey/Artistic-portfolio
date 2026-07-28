import { describe, it, expect } from 'vitest';
import { statSync, readFileSync } from 'node:fs';

const OG = 'public/images/og.jpg';

/** Read intrinsic size from the JPEG SOF marker — no image library needed. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker found');
}

describe('og:image', () => {
  it('exists', () => {
    expect(() => statSync(OG)).not.toThrow();
  });

  it('is 1200x630, the aspect ratio every platform crops to', () => {
    expect(jpegSize(readFileSync(OG))).toEqual({ width: 1200, height: 630 });
  });

  it('is under 1MB, comfortably inside the 5MB platform limit', () => {
    const kb = statSync(OG).size / 1024;
    expect(kb).toBeLessThan(1024);
  });
});
