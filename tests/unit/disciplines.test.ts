import { describe, it, expect } from 'vitest';
import { DISCIPLINES, NEUTRAL, getDiscipline, worldColors } from '../../src/lib/disciplines';
import { translations } from '../../src/i18n/translations';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('disciplines', () => {
  it('lists the disciplines in home-page order', () => {
    expect(DISCIPLINES.map((d) => d.slug)).toEqual(['portrait', 'analog']);
  });

  it.each([...DISCIPLINES, { slug: 'neutral', ...NEUTRAL }])(
    '$slug accent on bg clears WCAG AAA (7:1)',
    ({ bg, accent }) => {
      expect(contrast(bg, accent)).toBeGreaterThanOrEqual(7);
    }
  );

  it.each(DISCIPLINES)('$slug has a display name in every locale', ({ nameKey }) => {
    for (const lang of ['en', 'fr', 'de'] as const) {
      expect((translations[lang] as Record<string, string>)[nameKey]).toBeTruthy();
    }
  });

  it('getDiscipline finds by slug and rejects anything else', () => {
    expect(getDiscipline('portrait')?.accent).toBe('#9fc3d6');
    expect(getDiscipline('Portrait')).toBeUndefined();
    expect(getDiscipline('neutral')).toBeUndefined();
  });

  it('worldColors maps neutral and every discipline', () => {
    expect(worldColors('neutral')).toEqual(NEUTRAL);
    for (const d of DISCIPLINES) {
      expect(worldColors(d.slug)).toEqual({ bg: d.bg, accent: d.accent });
    }
  });
});
