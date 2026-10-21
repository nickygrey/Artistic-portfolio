import { it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );

// The privacy page promises the site stores nothing in the browser.
it('no source file touches localStorage or sessionStorage', () => {
  const offenders = walk('src')
    .filter((f) => /\.(astro|ts|js)$/.test(f))
    .filter((f) => /\b(localStorage|sessionStorage)\b/.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});
