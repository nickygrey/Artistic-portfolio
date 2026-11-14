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

const PERSON_ID = `${SITE}/#person`;

/**
 * The one Person every page's structured data points at. "Nicky Grey" is the
 * name the domain and the Instagram handle carry, so search engines can tie
 * them to the legal name.
 */
function personNode(site: string = SITE): object {
  return {
    '@type': 'Person',
    '@id': `${site}/#person`,
    name: 'Vyacheslav Plotnikov',
    alternateName: 'Nicky Grey',
    url: `${site}/`,
    jobTitle: 'Photographer, Cinematographer & Editor',
    image: `${site}/images/og.jpg`,
    sameAs: ['https://instagram.com/nickygreys'],
  };
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
      personNode(site),
      {
        '@type': 'ProfessionalService',
        '@id': serviceId,
        name: 'Vyacheslav Plotnikov — Photography & Cinematography',
        url: `${site}/`,
        image: `${site}/images/og.jpg`,
        founder: { '@id': personId },
        areaServed: { '@type': 'Country', name: 'Luxembourg' },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Services',
          itemListElement: [
            { '@type': 'Offer', name: 'Portrait Photography' },
            { '@type': 'Offer', name: 'Wedding Photography' },
            { '@type': 'Offer', name: 'Analog Photography' },
            { '@type': 'Offer', name: 'Cinematography' },
            { '@type': 'Offer', name: 'Editing & Colour' },
          ],
        },
      },
    ],
  };
}

/** The about page: a ProfilePage whose subject is the Person. */
export function aboutJsonLd(locale: Locale, name: string, description: string): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      personNode(),
      {
        '@type': 'ProfilePage',
        '@id': `${canonicalUrl('/about/', locale)}#page`,
        url: canonicalUrl('/about/', locale),
        name,
        description,
        inLanguage: locale,
        mainEntity: { '@id': PERSON_ID },
      },
    ],
  };
}

/**
 * A gallery: a CollectionPage by the Person, with the breadcrumb home > gallery.
 * `image` is the absolute URL of the gallery's cover.
 */
export function galleryJsonLd(opts: {
  locale: Locale;
  slug: string;
  name: string;
  description: string;
  image: string;
  homeName: string;
}): object {
  const url = canonicalUrl(`/work/${opts.slug}/`, opts.locale);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      personNode(),
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name: opts.name,
        description: opts.description,
        inLanguage: opts.locale,
        primaryImageOfPage: opts.image,
        author: { '@id': PERSON_ID },
        about: { '@id': PERSON_ID },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: opts.homeName, item: canonicalUrl('/', opts.locale) },
          { '@type': 'ListItem', position: 2, name: opts.name, item: url },
        ],
      },
    ],
  };
}
