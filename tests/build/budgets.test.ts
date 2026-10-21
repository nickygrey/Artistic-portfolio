import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

beforeAll(() => {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing — run `npm run build` first');
});

/** Every chunk a page loads: its module scripts and, transitively, their static imports. */
function scriptClosure(page: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...readFileSync(page, 'utf8').matchAll(/<script[^>]*type="module"[^>]*src="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(join('dist', file), 'utf8');
    for (const m of code.matchAll(/(?:import|from)\s*["']\.\/([^"']+\.js)["']/g)) queue.push(`assets/${m[1]}`);
  }
  return seen;
}

const gzipped = (files: Set<string>) =>
  [...files].reduce((sum, f) => sum + gzipSync(readFileSync(join('dist', f))).length, 0);

describe('JavaScript budgets (gzip)', () => {
  it.each([
    ['dist/index.html', 90],
    ['dist/about/index.html', 90],
    ['dist/privacy/index.html', 90],
    ['dist/work/portrait/index.html', 125],
    ['dist/de/work/analog/index.html', 125],
  ])('%s ships at most %i kB', (page, kb) => {
    const files = scriptClosure(page);
    expect(files.size).toBeGreaterThan(0);
    expect(gzipped(files) / 1024).toBeLessThanOrEqual(kb);
  });
});
