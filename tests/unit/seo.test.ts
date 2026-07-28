import { describe, it, expect } from 'vitest';
import {
  LOCALES, DEFAULT_LOCALE, SITE,
  stripLocale, localizedPath, canonicalUrl, hreflangAlternates, ogLocale, siteJsonLd,
} from '../../src/lib/seo';

describe('constants', () => {
  it('has three locales with en as the unprefixed default', () => {
    expect([...LOCALES]).toEqual(['en', 'fr', 'de']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('has an absolute site origin with no trailing slash', () => {
    expect(SITE).toBe('https://nickygrey.com');
  });
});

describe('stripLocale', () => {
  it('treats an unprefixed path as the default locale', () => {
    expect(stripLocale('/')).toEqual({ locale: 'en', path: '/' });
    expect(stripLocale('/privacy/')).toEqual({ locale: 'en', path: '/privacy/' });
  });

  it('extracts a prefixed locale and returns the remaining path', () => {
    expect(stripLocale('/fr/')).toEqual({ locale: 'fr', path: '/' });
    expect(stripLocale('/de/')).toEqual({ locale: 'de', path: '/' });
    expect(stripLocale('/fr/privacy/')).toEqual({ locale: 'fr', path: '/privacy/' });
    expect(stripLocale('/de/privacy/')).toEqual({ locale: 'de', path: '/privacy/' });
  });

  it('only matches a whole first segment, never a prefix of one', () => {
    // '/french-films/' must not be read as locale 'fr'
    expect(stripLocale('/french-films/')).toEqual({ locale: 'en', path: '/french-films/' });
    expect(stripLocale('/design/')).toEqual({ locale: 'en', path: '/design/' });
  });

  it('normalises a missing trailing slash', () => {
    expect(stripLocale('/privacy')).toEqual({ locale: 'en', path: '/privacy/' });
    expect(stripLocale('/fr/privacy')).toEqual({ locale: 'fr', path: '/privacy/' });
    expect(stripLocale('/fr')).toEqual({ locale: 'fr', path: '/' });
  });
});

describe('localizedPath', () => {
  it('leaves the default locale unprefixed', () => {
    expect(localizedPath('/', 'en')).toBe('/');
    expect(localizedPath('/privacy/', 'en')).toBe('/privacy/');
  });

  it('prefixes non-default locales', () => {
    expect(localizedPath('/', 'fr')).toBe('/fr/');
    expect(localizedPath('/', 'de')).toBe('/de/');
    expect(localizedPath('/privacy/', 'fr')).toBe('/fr/privacy/');
    expect(localizedPath('/privacy/', 'de')).toBe('/de/privacy/');
  });

  it('is idempotent with respect to trailing slashes', () => {
    expect(localizedPath('/privacy', 'fr')).toBe('/fr/privacy/');
  });
});

describe('canonicalUrl', () => {
  it('builds an absolute URL for each locale', () => {
    expect(canonicalUrl('/', 'en')).toBe('https://nickygrey.com/');
    expect(canonicalUrl('/', 'fr')).toBe('https://nickygrey.com/fr/');
    expect(canonicalUrl('/privacy/', 'de')).toBe('https://nickygrey.com/de/privacy/');
  });

  it('never produces a double slash', () => {
    for (const l of LOCALES) {
      for (const p of ['/', '/privacy/']) {
        expect(canonicalUrl(p, l)).not.toMatch(/([^:])\/\//);
      }
    }
  });
});

describe('hreflangAlternates', () => {
  it('emits one entry per locale plus x-default', () => {
    const alts = hreflangAlternates('/');
    expect(alts.map((a) => a.hreflang)).toEqual(['en', 'fr', 'de', 'x-default']);
  });

  it('points x-default at the default locale', () => {
    const alts = hreflangAlternates('/privacy/');
    const xd = alts.find((a) => a.hreflang === 'x-default');
    const en = alts.find((a) => a.hreflang === 'en');
    expect(xd?.href).toBe(en?.href);
    expect(xd?.href).toBe('https://nickygrey.com/privacy/');
  });

  it('builds correct hrefs for a sub-page', () => {
    const alts = hreflangAlternates('/privacy/');
    expect(alts.find((a) => a.hreflang === 'fr')?.href).toBe('https://nickygrey.com/fr/privacy/');
    expect(alts.find((a) => a.hreflang === 'de')?.href).toBe('https://nickygrey.com/de/privacy/');
  });

  it('produces only absolute URLs', () => {
    for (const a of hreflangAlternates('/')) {
      expect(a.href.startsWith('https://')).toBe(true);
    }
  });
});

describe('ogLocale', () => {
  it('maps each locale to an OpenGraph locale code', () => {
    expect(ogLocale('en')).toBe('en_US');
    expect(ogLocale('fr')).toBe('fr_FR');
    expect(ogLocale('de')).toBe('de_DE');
  });
});

describe('siteJsonLd', () => {
  const ld = siteJsonLd() as any;

  it('is a schema.org graph with a Person and a ProfessionalService', () => {
    expect(ld['@context']).toBe('https://schema.org');
    const types = ld['@graph'].map((n: any) => n['@type']);
    expect(types).toContain('Person');
    expect(types).toContain('ProfessionalService');
  });

  it('names the person exactly as decided', () => {
    const person = ld['@graph'].find((n: any) => n['@type'] === 'Person');
    expect(person.name).toBe('Vyacheslav Plotnikov');
    expect(person.email).toBe('mailto:pv@nickygrey.com');
    expect(person.sameAs).toContain('https://instagram.com/nickygreys');
  });

  it('claims Luxembourg as service area and lists the three services', () => {
    const svc = ld['@graph'].find((n: any) => n['@type'] === 'ProfessionalService');
    expect(svc.areaServed.name).toBe('Luxembourg');
    const offers = svc.hasOfferCatalog.itemListElement.map((i: any) => i.name);
    expect(offers).toEqual(['Cinematography', 'Photography', 'Editing & Colour']);
  });

  it('makes NO address or business-registration claim', () => {
    const json = JSON.stringify(ld);
    expect(json).not.toContain('address');
    expect(json).not.toContain('PostalAddress');
    expect(json).not.toContain('streetAddress');
    expect(json).not.toContain('vatID');
    expect(json).not.toContain('taxID');
  });

  it('links the service to the person by @id rather than duplicating them', () => {
    const person = ld['@graph'].find((n: any) => n['@type'] === 'Person');
    const svc = ld['@graph'].find((n: any) => n['@type'] === 'ProfessionalService');
    expect(person['@id']).toBeTruthy();
    expect(svc.founder['@id']).toBe(person['@id']);
  });

  it('serialises to valid JSON', () => {
    expect(() => JSON.parse(JSON.stringify(ld))).not.toThrow();
  });
});
