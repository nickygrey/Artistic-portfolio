import type { TranslationKey } from '../i18n/translations';

export type DisciplineSlug = 'cinematography' | 'documentary' | 'portrait' | 'photography';
export type World = 'neutral' | DisciplineSlug;

export interface WorldColors {
  bg: string;
  accent: string;
}

export interface Discipline extends WorldColors {
  slug: DisciplineSlug;
  nameKey: TranslationKey;
  /** Placeholder until the owner confirms (spec §10, item 3). */
  years: string;
}

export const NEUTRAL: WorldColors = { bg: '#1c191b', accent: '#efeae2' };

export const DISCIPLINES: readonly Discipline[] = [
  { slug: 'cinematography', nameKey: 'discipline.cinematography', bg: '#22142a', accent: '#cfe07a', years: '2019 — 2026' },
  { slug: 'documentary',    nameKey: 'discipline.documentary',    bg: '#0f2a2e', accent: '#e8a57a', years: '2023 — 2026' },
  { slug: 'portrait',       nameKey: 'discipline.portrait',       bg: '#2b1512', accent: '#9fc3d6', years: '2021 — 2026' },
  { slug: 'photography',    nameKey: 'discipline.photography',    bg: '#14251a', accent: '#c7b2e0', years: '2018 — 2026' },
];

export function getDiscipline(slug: string): Discipline | undefined {
  return DISCIPLINES.find((d) => d.slug === slug);
}

export function worldColors(world: World): WorldColors {
  if (world === 'neutral') return NEUTRAL;
  const { bg, accent } = getDiscipline(world)!;
  return { bg, accent };
}
