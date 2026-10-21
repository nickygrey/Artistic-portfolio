import { describe, it, expect } from 'vitest';
import { scatter, type Placed } from '../../src/gallery/scatter';

const CELL = 380;
const overlap = (a: Placed, b: Placed, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const aspects = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.66, 1, 0.8, 1.78][i % 5]);

describe('scatter', () => {
  it.each([1, 6, 7, 60])('places %i frames with no overlaps and a clear gap', (n) => {
    const { placed } = scatter(aspects(n), { cell: CELL, seed: 3 });
    expect(placed).toHaveLength(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) expect(overlap(placed[i], placed[j], CELL * 0.2 - 0.001), `${i}/${j}`).toBe(false);
  });

  it('keeps every frame inside the tile', () => {
    const tile = scatter(aspects(13), { cell: CELL, seed: 9 });
    for (const p of tile.placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(tile.width);
      expect(p.y + p.h).toBeLessThanOrEqual(tile.height);
    }
  });

  it("keeps each image's aspect ratio and caps its long side", () => {
    const a = aspects(10);
    scatter(a, { cell: CELL, seed: 1 }).placed.forEach((p, i) => {
      expect(p.w / p.h).toBeCloseTo(a[i], 2);
      expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(CELL * 0.8 + 0.001);
    });
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = scatter(aspects(7), { cell: CELL, seed: 42 });
    expect(scatter(aspects(7), { cell: CELL, seed: 42 })).toEqual(a);
    expect(scatter(aspects(7), { cell: CELL, seed: 43 })).not.toEqual(a);
  });

  it('grows the tile with empty cells until it covers the requested area', () => {
    const tile = scatter(aspects(2), { cell: CELL, seed: 5, minWidth: 1800, minHeight: 1260 });
    expect(tile.width).toBeGreaterThanOrEqual(1800);
    expect(tile.height).toBeGreaterThanOrEqual(1260);
    expect(tile.width % CELL).toBe(0);
  });
});

describe('scatter with repeated frames', () => {
  it('never puts two copies of the same photograph in neighbouring cells, wrapping included', () => {
    const groups = Array.from({ length: 21 }, (_, i) => i % 7);
    const cell = 380;
    const tile = scatter(groups.map(() => 0.66), { cell, seed: 11, minWidth: 1820, minHeight: 1280, groups });
    const cols = tile.width / cell, rows = tile.height / cell;
    const cellOf = (p: Placed) => [Math.floor(p.x / cell), Math.floor(p.y / cell)];
    tile.placed.forEach((a, i) => tile.placed.forEach((b, j) => {
      if (i >= j || groups[i] !== groups[j]) return;
      const [ax, ay] = cellOf(a), [bx, by] = cellOf(b);
      const dx = Math.min(Math.abs(ax - bx), cols - Math.abs(ax - bx));
      const dy = Math.min(Math.abs(ay - by), rows - Math.abs(ay - by));
      expect(Math.max(dx, dy), `copies ${i} and ${j}`).toBeGreaterThan(1);
    }));
  });
});
