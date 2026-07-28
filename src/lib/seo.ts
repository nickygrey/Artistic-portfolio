export type Locale = 'en' | 'fr' | 'de';

export const LOCALES: readonly Locale[] = ['en', 'fr', 'de'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

/** Absolute origin, no trailing slash. Matches `site` in astro.config.mjs. */
export const SITE = 'https://nickygrey.com';

const PREFIXED = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/** Leading and trailing slash, always. '/privacy' -> '/privacy/' */
function normalise(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Split a pathname into its locale and the locale-independent remainder.
 * The default locale is unprefixed, so anything without a recognised first
 * segment belongs to it. Matching is on the whole segment — '/french-films/'
 * is not locale 'fr'.
 */
export function stripLocale(pathname: string): { locale: Locale; path: string } {
  const p = normalise(pathname);
  for (const locale of PREFIXED) {
    if (p === `/${locale}/` ) return { locale, path: '/' };
    if (p.startsWith(`/${locale}/`)) return { locale, path: p.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: p };
}

/** Apply a locale prefix to a locale-independent path. */
export function localizedPath(path: string, locale: Locale): string {
  const p = normalise(path);
  return locale === DEFAULT_LOCALE ? p : `/${locale}${p}`;
}

export function canonicalUrl(path: string, locale: Locale, site: string = SITE): string {
  return `${site}${localizedPath(path, locale)}`;
}

/**
 * One entry per locale plus x-default, which tells search engines what to
 * serve a visitor whose language we do not cover.
 */
export function hreflangAlternates(
  path: string,
  site: string = SITE
): Array<{ hreflang: string; href: string }> {
  const alts = LOCALES.map((locale) => ({
    hreflang: locale as string,
    href: canonicalUrl(path, locale, site),
  }));
  alts.push({ hreflang: 'x-default', href: canonicalUrl(path, DEFAULT_LOCALE, site) });
  return alts;
}

const OG_LOCALES: Record<Locale, string> = {
  en: 'en_US',
  fr: 'fr_FR',
  de: 'de_DE',
};

export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale];
}

/**
 * Person + ProfessionalService, linked by @id.
 * Deliberately asserts no postal address and no business registration —
 * the entity is an individual professional without a public studio.
 */
export function siteJsonLd(site: string = SITE): object {
  const personId = `${site}/#person`;
  const serviceId = `${site}/#service`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: 'Vyacheslav Plotnikov',
        url: `${site}/`,
        email: 'mailto:pv@nickygrey.com',
        jobTitle: 'Cinematographer, Photographer & Editor',
        image: `${site}/images/og.jpg`,
        sameAs: ['https://instagram.com/nickygreys'],
      },
      {
        '@type': 'ProfessionalService',
        '@id': serviceId,
        name: 'Vyacheslav Plotnikov — Cinematography & Photography',
        url: `${site}/`,
        image: `${site}/images/og.jpg`,
        email: 'mailto:pv@nickygrey.com',
        founder: { '@id': personId },
        areaServed: { '@type': 'Country', name: 'Luxembourg' },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Services',
          itemListElement: [
            { '@type': 'Offer', name: 'Cinematography' },
            { '@type': 'Offer', name: 'Photography' },
            { '@type': 'Offer', name: 'Editing & Colour' },
          ],
        },
      },
    ],
  };
}
