import heroImage from '../assets/hero.jpg';

/**
 * Single source of truth for the hero's responsive image transform, shared
 * between Hero.astro (renders it with <Image>) and Layout.astro (preloads
 * it with <link rel="preload" imagesrcset imagesizes>). Kept in one place so
 * the two cannot silently drift apart — a preload that doesn't match the
 * widths/format/quality the <img> actually requests just wastes a fetch
 * instead of warming the one the browser will pick.
 */
export const HERO_IMAGE = heroImage;
export const HERO_WIDTHS = [900, 1440, 1920];
export const HERO_QUALITY = 75;
export const HERO_FORMAT = 'webp' as const;
export const HERO_SIZES = '100vw';
