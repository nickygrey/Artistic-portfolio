export interface Placed { x: number; y: number; w: number; h: number }
export interface Tile { width: number; height: number; placed: Placed[] }

interface ScatterOptions {
  cell: number;
  seed: number;
  minWidth?: number;
  minHeight?: number;
  /** Frames sharing a group are copies of one photograph; they are kept out of each other's neighbouring cells. */
  groups?: number[];
}

/** mulberry32: small, fast, good enough for layout jitter, and reproducible. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A jittered grid: one frame per cell, each kept `cell * 0.1` inside its cell's
 * edges, so frames never overlap and always keep a gap. Extra cells stay empty,
 * which is what makes the canvas feel sparse and endless rather than tiled.
 */
export function scatter(aspects: number[], { cell, seed, minWidth = 0, minHeight = 0, groups }: ScatterOptions): Tile {
  const rand = random(seed);
  const n = aspects.length;
  let cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)), Math.ceil(minWidth / cell));
  let rows = Math.max(1, Math.ceil(n / cols), Math.ceil(minHeight / cell));
  // Leave roughly a third of the cells empty so the canvas breathes.
  while (cols * rows < Math.ceil(n * 1.5)) cols * cell <= rows * cell * 1.6 ? cols++ : rows++;

  const cells = Array.from({ length: cols * rows }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  // Each frame takes the first free cell (in shuffled order) with no copy of
  // itself among its eight neighbours, wrapping across the tile's edges because
  // the canvas repeats; if none is left, the first free cell.
  const groupAt = new Map<number, number>();
  const near = (c: number, group: number) => {
    const cx = c % cols, cy = Math.floor(c / cols);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = ((cy + dy + rows) % rows) * cols + ((cx + dx + cols) % cols);
        if (n !== c && groupAt.get(n) === group) return true;
      }
    return false;
  };
  const assigned = aspects.map((_, i) => {
    const group = groups?.[i] ?? -1 - i;
    const free = cells.filter((c) => !groupAt.has(c));
    const c = free.find((f) => !near(f, group)) ?? free[0];
    groupAt.set(c, group);
    return c;
  });

  const margin = cell * 0.1;
  const room = cell - 2 * margin;
  const placed = aspects.map((aspect, i) => {
    const long = room * (0.72 + rand() * 0.28);
    const w = aspect >= 1 ? long : long * aspect;
    const h = aspect >= 1 ? long / aspect : long;
    const c = assigned[i];
    const x = (c % cols) * cell + margin + rand() * (room - w);
    const y = Math.floor(c / cols) * cell + margin + rand() * (room - h);
    return { x, y, w, h };
  });

  return { width: cols * cell, height: rows * cell, placed };
}
