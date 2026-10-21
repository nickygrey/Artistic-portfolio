import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { contentSecurityPolicy, scriptHash, CANVAS_PENDING_SCRIPT } from '../../src/lib/csp';

const directives = (policy: string) =>
  Object.fromEntries(policy.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values];
  }));

describe('scriptHash', () => {
  it('is the base64 SHA-256 CSP expects, over the exact script text', () => {
    const expected = createHash('sha256').update('alert(1)').digest('base64');
    expect(scriptHash('alert(1)')).toBe(`'sha256-${expected}'`);
  });
});

describe('contentSecurityPolicy', () => {
  const p = directives(contentSecurityPolicy([CANVAS_PENDING_SCRIPT]));

  it('runs only same-origin scripts and the hashed inline ones: no unsafe-inline, no eval', () => {
    expect(p['script-src']).toEqual(["'self'", scriptHash(CANVAS_PENDING_SCRIPT)]);
  });

  it('talks only to itself and Formspree, and forms post only to Formspree', () => {
    expect(p['default-src']).toEqual(["'self'"]);
    expect(p['connect-src']).toEqual(["'self'", 'https://formspree.io']);
    expect(p['form-action']).toEqual(['https://formspree.io']);
  });

  it('shuts the classic escape hatches', () => {
    expect(p['object-src']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'self'"]);
    expect(p['frame-src']).toEqual(["'none'"]);
    expect(p).toHaveProperty('upgrade-insecure-requests');
  });

  it('uses only directives a <meta> policy honours', () => {
    for (const unsupported of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']) expect(p).not.toHaveProperty(unsupported);
  });
});
