import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

beforeAll(() => {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing — run `npm run build` first');
});

const pages = (dir = 'dist'): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pages(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []
  );

describe('Content Security Policy', () => {
  it.each(pages())('%s sets the policy before anything it governs, and allows each inline script by hash', (file) => {
    const html = readFileSync(file, 'utf8');
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const policy = head.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    expect(policy, 'policy meta present').toBeTruthy();
    expect(head.indexOf('Content-Security-Policy')).toBeLessThan(head.search(/<script|<link rel="stylesheet"|<style/));

    const scriptSrc = policy!.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const code of inline) {
      const hash = createHash('sha256').update(code).digest('base64');
      expect(scriptSrc, 'every executable inline script is allowed by its hash').toContain(`'sha256-${hash}'`);
    }
  });
});
