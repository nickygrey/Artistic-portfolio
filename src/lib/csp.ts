import { createHash } from 'node:crypto';

/**
 * Before first paint: on pointer devices a gallery's fallback grid stays
 * unpainted until the canvas lays it out (GalleryView.astro). Same query as
 * CANVAS_QUERY in src/gallery/canvas.ts. Kept here, as data, so the Content
 * Security Policy can allow exactly this text by its hash.
 */
export const CANVAS_PENDING_SCRIPT =
  "if (matchMedia('(hover: hover) and (pointer: fine)').matches) document.documentElement.classList.add('canvas-pending');";

/** A CSP source expression allowing one inline script, by the SHA-256 of its exact text. */
export function scriptHash(source: string): string {
  return `'sha256-${createHash('sha256').update(source).digest('base64')}'`;
}

/**
 * The site's Content Security Policy, delivered by <meta> (GitHub Pages cannot
 * set response headers), so only directives a meta policy honours: no
 * frame-ancestors or reporting. Styles allow inline values because the colour
 * worlds and strips set custom properties in style attributes; inline styles
 * cannot run code.
 */
export function contentSecurityPolicy(inlineScripts: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScripts.map(scriptHash).join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://formspree.io",
    'form-action https://formspree.io',
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}
