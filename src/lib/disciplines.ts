import type { TranslationKey } from '../i18n/translations';

export type DisciplineSlug = 'portrait' | 'film';
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
  { slug: 'portrait', nameKey: 'discipline.portrait', bg: '#2b1512', accent: '#9fc3d6', years: '2021 — 2026' },
  { slug: 'film',     nameKey: 'discipline.film',     bg: '#0f2a2e', accent: '#e8a57a', years: '2024' },
];

export function getDiscipline(slug: string): Discipline | undefined {
  return DISCIPLINES.find((d) => d.slug === slug);
}

export function worldColors(world: World): WorldColors {
  if (world === 'neutral') return NEUTRAL;
  const { bg, accent } = getDiscipline(world)!;
  return { bg, accent };
}
