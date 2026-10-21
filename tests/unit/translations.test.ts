import { describe, it, expect } from 'vitest';
import { translations } from '../../src/i18n/translations';

describe('translations', () => {
  it('fr and de define exactly the keys en defines', () => {
    const en = Object.keys(translations.en).sort();
    expect(Object.keys(translations.fr).sort()).toEqual(en);
    expect(Object.keys(translations.de).sort()).toEqual(en);
  });

  it('no locale has an empty string', () => {
    for (const lang of ['en', 'fr', 'de'] as const) {
      const empty = Object.entries(translations[lang]).filter(([, v]) => !String(v).trim());
      expect(empty, lang).toEqual([]);
    }
  });
});
